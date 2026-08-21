/**
 * Shift / sale-sync / floating-stock-sync API — ported from the desktop's
 * src/ui/api/pos.ts. The online/offline decision pattern is unchanged: try
 * the network call first, and on a network-shaped failure fall back to the
 * SQLite-backed offline store (src/services/offlineStore.ts) instead of the
 * desktop's `window.electron.offline*` IPC bridge — there's no process
 * boundary here, so those calls are direct and unconditional (the desktop's
 * `window.electron?.xxx` presence guards are dropped).
 *
 * Only the shift + sale/floating-stock sync surface needed by Phase 2 is
 * ported here; getXReport/getReadingReport, cash-movement, void, and
 * promoter-validation endpoints are added in the later phases that use them.
 */
import { getApiUrl, getApiToken } from './config';
import { nextOfflineShiftSyncStep } from './posOfflineShift';
import type {
  CloseShiftOutcome,
  CloseShiftResult,
  EodReport,
  PosSaleRequest,
  PosSaleResult,
  PosShiftInfo,
  PosTenderType,
} from '../types';
import * as Crypto from 'expo-crypto';
import {
  offlineAddSyncedSale,
  offlineClearShiftState,
  offlineEnqueueSale,
  offlineFindCachedPromoter,
  offlineListPendingCashMovements,
  offlineListPendingFloatingStockEvents,
  offlineListPendingSales,
  offlineListPendingVoids,
  offlineLoadShiftState,
  offlineRemovePendingCashMovement,
  offlineRemovePendingFloatingStockEvent,
  offlineRemovePendingSale,
  offlineRemovePendingVoid,
  offlineSaveShiftState,
} from '../services/offlineStore';

class ApiUnauthenticatedError extends Error {}

function throwForFailedResponse(status: number, message: string): never {
  if (status === 401) throw new ApiUnauthenticatedError(message);
  throw new Error(message);
}

/** No `navigator.onLine` on RN — this is pure error-shape detection; callers gate on their own isOnline state first. */
export function isLikelyNetworkFailure(err: unknown): boolean {
  if (err instanceof ApiUnauthenticatedError) return true;
  if (err instanceof TypeError) {
    const message = String(err.message || '');
    if (/network|fetch|failed to fetch|ECONNREFUSED|Load failed/i.test(message)) return true;
  }
  return false;
}

function getHeaders(): Record<string, string> {
  const token = getApiToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function parseJsonBody(res: Response): Promise<any> {
  return res.json().catch(() => ({}));
}

// ---------------------------------------------------------------------------
// Shift lifecycle
// ---------------------------------------------------------------------------

export async function getCurrentShift(storeId: number, register: string): Promise<PosShiftInfo | null> {
  const res = await fetch(getApiUrl(`/api/v1/pos/shift?store_id=${storeId}&register=${encodeURIComponent(register)}`), {
    method: 'GET',
    headers: getHeaders(),
  });
  const body = await parseJsonBody(res);
  if (!res.ok) throwForFailedResponse(res.status, body.message ?? 'Failed to load current shift');
  return body.data?.shift ?? null;
}

export async function openShift(params: {
  storeId: number;
  register: string;
  openingCash?: number;
  oicName?: string;
  cashierId: string;
}): Promise<PosShiftInfo> {
  const clientShiftId = Crypto.randomUUID();

  async function postOpenShiftRequest(): Promise<PosShiftInfo> {
    const res = await fetch(getApiUrl('/api/v1/pos/shift/open'), {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        store_id: params.storeId,
        register: params.register,
        opening_cash: params.openingCash ?? 0,
        oic_name: params.oicName,
        client_shift_uuid: clientShiftId,
      }),
    });
    const body = await parseJsonBody(res);
    if (!res.ok) throwForFailedResponse(res.status, body.message ?? 'Failed to open shift');
    if (!body.data?.shift) throw new Error('Unexpected response');
    return body.data.shift;
  }

  try {
    return await postOpenShiftRequest();
  } catch (err) {
    if (!isLikelyNetworkFailure(err)) throw err;
    await offlineSaveShiftState({
      clientShiftId,
      storeId: params.storeId,
      register: params.register,
      cashierId: params.cashierId,
      openingCash: params.openingCash ?? 0,
      openedAt: Date.now(),
      serverShiftId: null,
      status: 'PENDING_OPEN',
    });
    return {
      id: 0,
      branch: params.storeId,
      register: params.register,
      opened_at: new Date().toISOString(),
      opening_cash: params.openingCash ?? 0,
      sales_count: 0,
      sales_total: 0,
      discount_total: 0,
      // ShiftModal keys its amber "offline" badge and locked-register view off this exact string.
      status: 'PENDING_OPEN',
    };
  }
}

export async function sendShiftHeartbeat(shiftId: number): Promise<void> {
  const res = await fetch(getApiUrl('/api/v1/pos/shift/heartbeat'), {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ shift_id: shiftId }),
  });
  if (!res.ok) {
    const body = await parseJsonBody(res);
    throwForFailedResponse(res.status, body.message ?? 'Heartbeat failed');
  }
}

export async function closeShift(
  shiftId: number,
  closingCash: number | undefined,
  context: { storeId: number; register: string }
): Promise<CloseShiftOutcome> {
  const shiftState = await offlineLoadShiftState(context.storeId, context.register);
  if (shiftState) {
    const [pendingSales, pendingCashMovements, pendingVoids] = await Promise.all([
      offlineListPendingSales(),
      offlineListPendingCashMovements(),
      offlineListPendingVoids(),
    ]);
    const step = nextOfflineShiftSyncStep({
      shiftStatus: shiftState.status,
      hasPendingSalesForRegister: pendingSales.some(
        (s) => s.payload.store_id === context.storeId && (s.payload.register ?? '') === context.register
      ),
      hasPendingCashMovementsForShift: pendingCashMovements.some((m) => m.clientShiftId === shiftState.clientShiftId),
      hasPendingVoidsForShift: pendingVoids.some((v) => v.cashierId === shiftState.cashierId),
    });

    if (step !== 'CLOSE_SHIFT' && step !== 'DONE') {
      await offlineSaveShiftState({ ...shiftState, status: 'PENDING_CLOSE', closingCash, pendingClosedAt: Date.now() });
      return { kind: 'pending', closingCash: closingCash ?? 0 };
    }
  }

  const res = await fetch(getApiUrl('/api/v1/pos/shift/close'), {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ shift_id: shiftId, closing_cash: closingCash }),
  });
  const body = await parseJsonBody(res);
  if (!res.ok) throwForFailedResponse(res.status, body.message ?? 'Failed to close shift');
  const result = body.data as CloseShiftResult;
  await offlineClearShiftState(context.storeId, context.register);
  return { kind: 'closed', result };
}

export async function getEodReport(shiftId: number): Promise<EodReport> {
  const res = await fetch(getApiUrl(`/api/v1/pos/shift/${shiftId}/eod`), { method: 'GET', headers: getHeaders() });
  const body = await parseJsonBody(res);
  if (!res.ok) throwForFailedResponse(res.status, body.message ?? 'Failed to load EOD report');
  return body.data;
}

export async function getPosCategories(storeId?: number): Promise<string[]> {
  const query = storeId != null ? `?store_id=${storeId}` : '';
  const res = await fetch(getApiUrl(`/api/v1/pos/categories${query}`), { method: 'GET', headers: getHeaders() });
  const body = await parseJsonBody(res);
  if (!res.ok) throwForFailedResponse(res.status, body.message ?? 'Failed to load categories');
  return body.data?.categories ?? body.data ?? [];
}

const FALLBACK_TENDERS: PosTenderType[] = [
  { id: -1, code: '0', name: 'Cash', bank_name: null, tender_class: 'cash', sort_order: 0, metadata: {} },
  { id: -2, code: 'GCASH', name: 'GCash', bank_name: null, tender_class: 'ewallet', sort_order: 10, metadata: {} },
  { id: -3, code: '10', name: 'BDO STRAIGHT', bank_name: 'BDO', tender_class: 'credit_card', sort_order: 20, metadata: {} },
  { id: -4, code: '48', name: 'BDO 24 MONTHS', bank_name: 'BDO', tender_class: 'installment', sort_order: 30, metadata: {} },
];

/** No ETag/localStorage caching layer this phase (a pure optimization) — always fetches fresh, falling back to a hardcoded catalog on failure so checkout never has zero tender options. */
export async function getPosTenderTypes(): Promise<PosTenderType[]> {
  try {
    const res = await fetch(getApiUrl('/api/v1/pos/tender-types'), { method: 'GET', headers: getHeaders() });
    const body = await parseJsonBody(res);
    if (!res.ok) throw new Error(body.message ?? 'Failed to load tender types');
    return body.data?.tender_types ?? FALLBACK_TENDERS;
  } catch {
    return FALLBACK_TENDERS;
  }
}

// ---------------------------------------------------------------------------
// Sale recording (first-attempt) + reconnect sync of queued sales
// ---------------------------------------------------------------------------

export interface SaleSyncConflict {
  clientSaleId: string;
  message: string;
}

async function postPosSaleRequestRaw(payload: Record<string, unknown>): Promise<{ ok: boolean; status: number; body: any }> {
  const res = await fetch(getApiUrl('/api/v1/pos/sale'), {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseJsonBody(res);
  return { ok: res.ok, status: res.status, body };
}

async function postPosSaleRequest(body: PosSaleRequest & { client_sale_id: string }): Promise<PosSaleResult> {
  const { ok, status, body: responseBody } = await postPosSaleRequestRaw(body as unknown as Record<string, unknown>);
  if (!ok) throwForFailedResponse(status, responseBody.message ?? 'Failed to record sale');
  if (!responseBody.data) throw new Error('Unexpected response from sale endpoint');
  return responseBody.data;
}

function computeSaleAmounts(payload: PosSaleRequest): { saleAmount: number; tenderAmount: number } {
  const itemsTotal = payload.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const saleAmount = Math.max(0, itemsTotal - (payload.discount_amt ?? 0));
  const tenderAmount = payload.payments.reduce((sum, p) => sum + p.amount, 0);
  return { saleAmount, tenderAmount };
}

function buildOfflinePlaceholderResult(payload: PosSaleRequest, clientSaleId: string): PosSaleResult {
  const { saleAmount, tenderAmount } = computeSaleAmounts(payload);
  const short = clientSaleId.replace(/-/g, '').slice(0, 8).toUpperCase();
  return {
    sale_id: 0,
    transac: `OFFLINE-${short}`,
    receipt: `PENDING-${short}`,
    trandate: new Date().toISOString(),
    amount: saleAmount,
    tender_amount: tenderAmount,
    change_amount: payload.change_amount ?? 0,
  };
}

/**
 * Record a completed POS sale. When the network is unavailable, the sale is
 * queued via offlineEnqueueSale and a placeholder receipt is returned —
 * mirrors the desktop's recordPosSale exactly.
 */
export async function recordPosSale(payload: PosSaleRequest): Promise<PosSaleResult> {
  const clientSaleId = payload.client_sale_id?.trim() || Crypto.randomUUID();
  const body = { ...payload, client_sale_id: clientSaleId };

  try {
    const result = await postPosSaleRequest(body);
    if (result.sale_id > 0 && payload.register) {
      await offlineAddSyncedSale(payload.store_id, payload.register, {
        saleId: result.sale_id,
        receipt: result.receipt,
        amount: result.amount,
        trandate: result.trandate,
      });
    }
    return result;
  } catch (err) {
    if (!isLikelyNetworkFailure(err)) throw err;
    await offlineEnqueueSale({ id: clientSaleId, payload: body as unknown as Record<string, unknown>, createdAt: Date.now() });
    return buildOfflinePlaceholderResult(payload, clientSaleId);
  }
}

/**
 * Retry queued offline sales (call when back online). Safe to call
 * repeatedly. A genuine server rejection (bad/missing/already-sold serial,
 * quantity mismatch, ...) is permanent — the sale is removed from the queue
 * and reported in saleConflicts for staff follow-up. A 401 or network
 * failure is not a verdict: the sale stays queued for the next cycle.
 */
export async function syncOfflinePendingSales(): Promise<{ synced: number; failed: number; saleConflicts: SaleSyncConflict[] }> {
  const pending = await offlineListPendingSales();
  let synced = 0;
  let failed = 0;
  const saleConflicts: SaleSyncConflict[] = [];

  for (const row of pending) {
    const clientSaleId = row.payload.client_sale_id;
    if (typeof clientSaleId !== 'string') {
      failed++;
      continue;
    }
    try {
      const { ok, status, body } = await postPosSaleRequestRaw(row.payload);
      if (ok) {
        const sale = body?.data?.sale;
        if (sale && typeof row.payload.store_id === 'number' && typeof row.payload.register === 'string') {
          await offlineAddSyncedSale(row.payload.store_id, row.payload.register, {
            saleId: sale.id,
            receipt: sale.receipt_number ?? sale.receipt ?? '',
            amount: sale.total ?? 0,
            trandate: sale.trandate ?? new Date().toISOString(),
          });
        }
        await offlineRemovePendingSale(row.id);
        synced++;
        continue;
      }
      if (status === 401) {
        failed++;
        continue;
      }
      saleConflicts.push({ clientSaleId, message: body?.message ?? 'Sale rejected by server.' });
      await offlineRemovePendingSale(row.id);
    } catch {
      failed++;
    }
  }

  return { synced, failed, saleConflicts };
}

/**
 * Flushes queued floating-stock punches to the server on reconnect.
 * Best-effort — network failures leave entries queued for the next cycle.
 */
export async function syncOfflinePendingFloatingStockEvents(): Promise<{ synced: number }> {
  const pending = await offlineListPendingFloatingStockEvents();
  let synced = 0;

  for (const event of pending) {
    const path = event.action === 'OUT' ? '/api/v1/pos/floating-stock/punch-out' : '/api/v1/pos/floating-stock/punch-in';
    try {
      const res = await fetch(getApiUrl(path), { method: 'POST', headers: getHeaders(), body: JSON.stringify(event.payload) });
      if (res.status === 401) continue; // leave queued
      // Non-2xx here is a permanent rejection (e.g. serial no longer
      // available) — drop it rather than retry forever; it's an audit
      // convenience log, not stock-affecting, so nothing besides the log
      // entry is lost.
      await offlineRemovePendingFloatingStockEvent(event.id);
      if (res.ok) synced++;
    } catch {
      // network error — leave queued silently
    }
  }

  return { synced };
}

export async function syncOfflineShiftState(context: {
  storeId: number;
  register: string;
  currentCashierId: string;
}): Promise<{
  shiftOpened: boolean;
  cashMovementsSynced: number;
  shiftClosed: CloseShiftResult | null;
  voidsSynced: number;
  voidConflicts: { originalSaleId: number; message: string }[];
  saleConflicts: SaleSyncConflict[];
}> {
  const result = {
    shiftOpened: false,
    cashMovementsSynced: 0,
    shiftClosed: null as CloseShiftResult | null,
    voidsSynced: 0,
    voidConflicts: [] as { originalSaleId: number; message: string }[],
    saleConflicts: [] as SaleSyncConflict[],
  };

  let shiftState = await offlineLoadShiftState(context.storeId, context.register);
  if (!shiftState) return result;

  if (shiftState.status === 'PENDING_OPEN') {
    try {
      const opened = await openShift({
        storeId: context.storeId,
        register: context.register,
        openingCash: shiftState.openingCash,
        cashierId: context.currentCashierId,
      });
      if (opened.status === 'PENDING_OPEN') return result; // still offline
      result.shiftOpened = true;
      shiftState = await offlineLoadShiftState(context.storeId, context.register);
      if (!shiftState) return result;
    } catch {
      return result;
    }
  }

  const pendingSales = await offlineListPendingSales();
  const hasPendingSalesForRegister = pendingSales.some(
    (s) => s.payload.store_id === context.storeId && (s.payload.register ?? '') === context.register
  );
  if (hasPendingSalesForRegister) {
    const saleSync = await syncOfflinePendingSales();
    result.saleConflicts = saleSync.saleConflicts;
    return result;
  }

  const pendingCashMovements = (await offlineListPendingCashMovements()).filter(
    (m) => m.clientShiftId === shiftState!.clientShiftId
  );
  for (const movement of pendingCashMovements) {
    try {
      const res = await fetch(getApiUrl('/api/v1/pos/shift/cash-movement'), {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(movement.payload),
      });
      if (res.ok) {
        await offlineRemovePendingCashMovement(movement.id);
        result.cashMovementsSynced++;
      } else if (res.status !== 401) {
        await offlineRemovePendingCashMovement(movement.id);
      }
    } catch {
      // leave queued
    }
  }
  if (pendingCashMovements.length > result.cashMovementsSynced) return result;

  const pendingVoids = (await offlineListPendingVoids()).filter((v) => v.cashierId === context.currentCashierId);
  for (const voidRecord of pendingVoids) {
    try {
      const res = await fetch(getApiUrl(`/api/v1/pos/sale/${voidRecord.originalSaleId}/void`), {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ void_reason: voidRecord.reason, approved_by_manager_id: voidRecord.approvedByManagerId }),
      });
      const body = await parseJsonBody(res);
      if (res.ok) {
        await offlineRemovePendingVoid(voidRecord.id);
        result.voidsSynced++;
      } else if (res.status !== 401) {
        result.voidConflicts.push({ originalSaleId: voidRecord.originalSaleId, message: body.message ?? 'Void rejected by server.' });
        await offlineRemovePendingVoid(voidRecord.id);
      }
    } catch {
      // leave queued
    }
  }
  const remainingVoids = pendingVoids.length - result.voidsSynced - result.voidConflicts.length;
  if (remainingVoids > 0) return result;

  if (shiftState.status === 'PENDING_CLOSE') {
    const outcome = await closeShift(shiftState.serverShiftId ?? 0, shiftState.closingCash, {
      storeId: context.storeId,
      register: context.register,
    });
    if (outcome.kind === 'closed') result.shiftClosed = outcome.result;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Promoter validation — every sale requires a valid promoter id (see
// CheckoutModal's canComplete gate); this is a convenience check only, the
// id is stored as-entered server-side with no independent re-validation.
// ---------------------------------------------------------------------------

export interface ValidatePromoterResult {
  valid: boolean;
  name?: string;
  user_id?: string;
  message?: string;
  /** True when this couldn't be checked live (network failure) — not a real "invalid" verdict. */
  offline?: boolean;
}

/**
 * Offline fallback — checks the locally cached "assigned to this store"
 * roster so a promoter id can still be validated for real instead of
 * blindly accepted. Only accepted-as-entered (`offline: true`) when the
 * cache has never been populated for this store at all; a populated cache
 * with no match is a genuine rejection even offline.
 */
async function validatePromoterOffline(identifier: string, storeId: number): Promise<ValidatePromoterResult> {
  const match = await offlineFindCachedPromoter(storeId, identifier.trim());
  if (match === undefined) {
    return { valid: false, offline: true, message: 'Offline — promoter ID will be verified once back online.' };
  }
  if (match === null) {
    return { valid: false, message: 'Promoter is not assigned to this store (checked offline cache).' };
  }
  return { valid: true, name: match.name, user_id: match.userId };
}

export async function validatePromoter(identifier: string, storeId: number): Promise<ValidatePromoterResult> {
  try {
    const res = await fetch(
      getApiUrl(`/api/v1/pos/validate-promoter?identifier=${encodeURIComponent(identifier.trim())}&store_id=${storeId}`),
      { method: 'GET', headers: getHeaders() }
    );
    const body = await parseJsonBody(res);
    if (res.status === 401) return validatePromoterOffline(identifier, storeId);
    if (!res.ok) return { valid: false, message: body.message ?? 'Validation failed.' };
    return body;
  } catch (err) {
    if (!isLikelyNetworkFailure(err)) throw err;
    return validatePromoterOffline(identifier, storeId);
  }
}

// ---------------------------------------------------------------------------
// Serial / IMEI lookup and validation
// ---------------------------------------------------------------------------

export interface SerialLookupProduct {
  id: number;
  pd_prodid?: number | string | null;
  pd_desc?: string | null;
  pd_postext?: string | null;
  pd_price?: number | null;
  pd_cat1?: string | null;
  pd_vendor?: string | null;
  is_serialized: boolean;
  image: string | null;
  on_hand: number;
}

export interface SerialLookupResult {
  product: SerialLookupProduct;
  serial_number: string;
  imei_warning?: string | null;
}

const OFFLINE_LOOKUP_MESSAGE =
  "Can't look up by serial while offline — search for the product and enter the serial from there instead.";

/** Looks up a product by serial number — used when the cashier scans an IMEI/serial instead of a SKU barcode. Throws if not found. */
export async function lookupSerial(params: { serial_number: string; store_id?: number | null }): Promise<SerialLookupResult> {
  let res: Response;
  try {
    const query = new URLSearchParams({ serial_number: params.serial_number.trim() });
    if (params.store_id != null) query.set('store_id', String(params.store_id));
    res = await fetch(getApiUrl(`/api/v1/pos/lookup-serial?${query.toString()}`), { method: 'GET', headers: getHeaders() });
  } catch (err) {
    if (isLikelyNetworkFailure(err)) throw new Error(OFFLINE_LOOKUP_MESSAGE);
    throw err;
  }
  if (res.status === 401) throw new Error(OFFLINE_LOOKUP_MESSAGE);
  const body = await parseJsonBody(res);
  if (!res.ok) throw new Error(body.message ?? 'Serial not found');
  return body.data;
}

export interface ValidateSerialOutcome {
  valid: boolean;
  /** True when the live check couldn't run and the serial was accepted as entered. */
  offline?: boolean;
  message?: string;
}

/**
 * Validates a serial exists in inventory for the given product/store. A
 * genuine server rejection returns `{valid:false, message}`; when the live
 * check can't run at all (network drop, or a 401 from an offline-login
 * session with no real token), the serial is accepted as entered —
 * `{valid:true, offline:true}` — and the backend's own validation at
 * sale-commit time remains the authority.
 */
export async function validateSerial(params: {
  serial_number: string;
  product_id: number;
  store_id?: number | null;
}): Promise<ValidateSerialOutcome> {
  try {
    const res = await fetch(getApiUrl('/api/v1/pos/validate-serial'), {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        serial_number: params.serial_number.trim(),
        product_id: params.product_id,
        ...(params.store_id != null ? { store_id: params.store_id } : {}),
      }),
    });
    if (res.status === 401) return { valid: true, offline: true };
    const body = await parseJsonBody(res);
    if (!res.ok) return { valid: false, message: body.message ?? 'Invalid serial' };
    return { valid: true };
  } catch (err) {
    if (isLikelyNetworkFailure(err)) return { valid: true, offline: true };
    throw err;
  }
}
