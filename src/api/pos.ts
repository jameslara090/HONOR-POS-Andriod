/**
 * Shift / sale-sync / floating-stock-sync / discount-approval / reprint-gate
 * / sales-history / void / refund API — ported from the desktop's
 * src/ui/api/pos.ts. The online/offline decision pattern is unchanged: try
 * the network call first, and on a network-shaped failure fall back to the
 * SQLite-backed offline store (src/services/offlineStore.ts) instead of the
 * desktop's `window.electron.offline*` IPC bridge — there's no process
 * boundary here, so those calls are direct and unconditional (the desktop's
 * `window.electron?.xxx` presence guards are dropped).
 *
 * getXReport/getReadingReport and cash-movement endpoints are still not
 * ported — not requested by any phase's checklist so far.
 */
import { getApiUrl, getApiToken } from './config';
import { belongsToCurrentCashier, nextOfflineShiftSyncStep } from './posOfflineShift';
import type {
  CashMovementResult,
  CloseShiftOutcome,
  CloseShiftResult,
  CreateDiscountApprovalRequestParams,
  DiscountApprovalRequestResult,
  EodReport,
  FloatingStockItem,
  PosDiscount,
  PosRefundRequest,
  PosRefundResult,
  PosSaleDetail,
  PosSaleRequest,
  PosSaleResult,
  PosSaleSummary,
  PosShiftInfo,
  PosTenderType,
  PromoterOption,
  ReprintEligibility,
  ReprintRequestResult,
  ReprintTargetType,
  SalesSummaryGroupBy,
  SalesSummaryReport,
  WarrantyRecord,
} from '../types';
import * as Crypto from 'expo-crypto';
import {
  offlineAddSyncedSale,
  offlineCachePromoters,
  offlineClearShiftState,
  offlineEnqueueCashMovement,
  offlineEnqueueFloatingStockEvent,
  offlineEnqueueSale,
  offlineEnqueueVoid,
  offlineFindCachedPromoter,
  offlineListCachedPromoters,
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

export function computeSaleAmounts(payload: PosSaleRequest): { saleAmount: number; tenderAmount: number } {
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

  // A stale local shift left behind by a different cashier on this shared
  // device must never be synced/opened under the current session.
  if (!belongsToCurrentCashier(shiftState.cashierId, context.currentCashierId)) return result;

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

// ---------------------------------------------------------------------------
// Discount catalog + remote approval requests
// ---------------------------------------------------------------------------

/** Network/auth failure — caller should fall back to in-person/offline approval rather than assume the discount is unapprovable. */
export class DiscountApprovalUnavailableError extends Error {}

/** No ETag/localStorage caching layer this phase (a pure optimization, same call as Phase 3's getPosTenderTypes) — always fetches fresh. */
export async function getPosDiscounts(): Promise<PosDiscount[]> {
  const res = await fetch(getApiUrl('/api/v1/pos/discounts'), { method: 'GET', headers: getHeaders() });
  const body = await parseJsonBody(res);
  if (!res.ok) throw new Error(body.message ?? 'Failed to load discounts');
  return body.data?.discounts ?? [];
}

export async function createDiscountApprovalRequest(
  params: CreateDiscountApprovalRequestParams
): Promise<DiscountApprovalRequestResult> {
  try {
    const res = await fetch(getApiUrl('/api/v1/pos/discount-approval-requests'), {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        client_request_uuid: Crypto.randomUUID(),
        store_id: params.storeId,
        discount_amount: params.discountAmount,
        discount_reason: params.discountReason,
        sale_subtotal: params.saleSubtotal,
      }),
    });
    if (res.status === 401) throw new DiscountApprovalUnavailableError('Not connected to the server.');
    const body = await parseJsonBody(res);
    if (!res.ok || !body.data) throw new Error(body.message ?? 'Failed to create discount approval request.');
    return body.data.request;
  } catch (err) {
    if (err instanceof DiscountApprovalUnavailableError) throw err;
    if (isLikelyNetworkFailure(err)) throw new DiscountApprovalUnavailableError('Cannot reach the server.');
    throw err;
  }
}

export async function getDiscountApprovalRequest(id: number): Promise<DiscountApprovalRequestResult> {
  try {
    const res = await fetch(getApiUrl(`/api/v1/pos/discount-approval-requests/${id}`), { headers: getHeaders() });
    if (res.status === 401) throw new DiscountApprovalUnavailableError('Not connected to the server.');
    const body = await parseJsonBody(res);
    if (!res.ok || !body.data) throw new Error(body.message ?? 'Failed to check discount approval request.');
    return body.data.request;
  } catch (err) {
    if (err instanceof DiscountApprovalUnavailableError) throw err;
    if (isLikelyNetworkFailure(err)) throw new DiscountApprovalUnavailableError('Cannot reach the server.');
    throw err;
  }
}

/** Best-effort — the request will simply expire server-side instead if this fails. */
export async function cancelDiscountApprovalRequest(id: number): Promise<void> {
  try {
    await fetch(getApiUrl(`/api/v1/pos/discount-approval-requests/${id}/cancel`), { method: 'POST', headers: getHeaders() });
  } catch {
    // best-effort
  }
}

// ---------------------------------------------------------------------------
// Reprint gate — one free reprint per sale/Z-report within 24h; after that,
// or on the very first reprint if >24h has passed, needs is_approver approval.
// ---------------------------------------------------------------------------

/** Network/auth failure — caller should treat the reprint as unavailable rather than assume it's free. */
export class ReprintGateUnavailableError extends Error {}

export async function getReprintEligibility(type: ReprintTargetType, targetId: number): Promise<ReprintEligibility> {
  try {
    const res = await fetch(getApiUrl(`/api/v1/pos/reprints/status?type=${type}&target_id=${targetId}`), { headers: getHeaders() });
    if (res.status === 401) throw new ReprintGateUnavailableError('Not connected to the server.');
    const body = await parseJsonBody(res);
    if (!res.ok || !body.data) throw new Error(body.message ?? 'Failed to check reprint eligibility.');
    return body.data;
  } catch (err) {
    if (err instanceof ReprintGateUnavailableError) throw err;
    if (isLikelyNetworkFailure(err)) throw new ReprintGateUnavailableError('Cannot reach the server.');
    throw err;
  }
}

export async function createReprintRequest(type: ReprintTargetType, targetId: number): Promise<ReprintRequestResult> {
  try {
    const res = await fetch(getApiUrl('/api/v1/pos/reprints/requests'), {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ client_request_uuid: Crypto.randomUUID(), type, target_id: targetId }),
    });
    if (res.status === 401) throw new ReprintGateUnavailableError('Not connected to the server.');
    const body = await parseJsonBody(res);
    if (!res.ok || !body.data) throw new Error(body.message ?? 'Failed to create reprint request.');
    return body.data.request;
  } catch (err) {
    if (err instanceof ReprintGateUnavailableError) throw err;
    if (isLikelyNetworkFailure(err)) throw new ReprintGateUnavailableError('Cannot reach the server.');
    throw err;
  }
}

export async function getReprintRequest(id: number): Promise<ReprintRequestResult> {
  try {
    const res = await fetch(getApiUrl(`/api/v1/pos/reprints/requests/${id}`), { headers: getHeaders() });
    if (res.status === 401) throw new ReprintGateUnavailableError('Not connected to the server.');
    const body = await parseJsonBody(res);
    if (!res.ok || !body.data) throw new Error(body.message ?? 'Failed to check reprint request.');
    return body.data.request;
  } catch (err) {
    if (err instanceof ReprintGateUnavailableError) throw err;
    if (isLikelyNetworkFailure(err)) throw new ReprintGateUnavailableError('Cannot reach the server.');
    throw err;
  }
}

/** Best-effort — called when the cashier closes the waiting UI early. Never blocks on failure. */
export async function cancelReprintRequest(id: number): Promise<void> {
  try {
    await fetch(getApiUrl(`/api/v1/pos/reprints/requests/${id}/cancel`), { method: 'POST', headers: getHeaders() });
  } catch {
    // best-effort — the request will simply expire server-side instead
  }
}

/**
 * Records that a reprint actually happened, right after the print fires.
 * Pass reprintRequestId when this print is spending an approved grant; omit
 * it for the free-window path. Server re-validates either way.
 */
export async function logReprint(type: ReprintTargetType, targetId: number, reprintRequestId?: number | null): Promise<void> {
  const res = await fetch(getApiUrl('/api/v1/pos/reprints/log'), {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ type, target_id: targetId, reprint_request_id: reprintRequestId ?? undefined }),
  });
  const body = await parseJsonBody(res);
  if (!res.ok || !body.success) throw new Error(body.message ?? 'Failed to record reprint.');
}

// ---------------------------------------------------------------------------
// Sales history, void, refund
// ---------------------------------------------------------------------------

/** No server-side pagination — returns the full date-range result set; callers paginate client-side. */
export async function getPosSales(params: { storeId?: number | null; dateFrom?: string; dateTo?: string } = {}): Promise<PosSaleSummary[]> {
  const query = new URLSearchParams();
  if (params.storeId != null) query.set('store_id', String(params.storeId));
  if (params.dateFrom) query.set('date_from', params.dateFrom);
  if (params.dateTo) query.set('date_to', params.dateTo);
  const res = await fetch(getApiUrl(`/api/v1/pos/sales?${query.toString()}`), { headers: getHeaders() });
  const body = await parseJsonBody(res);
  if (!res.ok) throw new Error(body.message ?? 'Failed to load sales history');
  return body.data?.sales ?? [];
}

export async function getSaleById(saleId: number): Promise<PosSaleDetail> {
  const res = await fetch(getApiUrl(`/api/v1/pos/sale/${saleId}`), { headers: getHeaders() });
  const body = await parseJsonBody(res);
  if (!res.ok) throw new Error(body.message ?? 'Failed to load sale');
  if (!body.data?.sale) throw new Error('Unexpected response');
  return body.data.sale;
}

/**
 * Voids a sale. On a network failure, queues via offlineEnqueueVoid against
 * this register's active local shift state (there must be one — a void with
 * no local shift record to key on can't be queued) and returns
 * `{queued: true}`; the background sync loop in useCatalog.ts clears it once
 * back online.
 */
export async function voidPosSale(
  saleId: number,
  reason: string | null,
  params: { storeId: number; register: string; cashierId: string; approvedByManagerId?: string }
): Promise<{ queued: boolean }> {
  const clientVoidUuid = Crypto.randomUUID();
  try {
    const res = await fetch(getApiUrl(`/api/v1/pos/sale/${saleId}/void`), {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        void_reason: reason ?? null,
        client_void_uuid: clientVoidUuid,
        approved_by_manager_id: params.approvedByManagerId ?? null,
      }),
    });
    const body = await parseJsonBody(res);
    if (!res.ok) throwForFailedResponse(res.status, body.message ?? 'Failed to void sale');
    return { queued: false };
  } catch (err) {
    if (!isLikelyNetworkFailure(err)) throw err;
    const shiftState = await offlineLoadShiftState(params.storeId, params.register);
    if (!shiftState) throw new Error('No active shift found for this register — cannot queue a void offline.');
    await offlineEnqueueVoid({
      id: clientVoidUuid,
      originalSaleId: saleId,
      reason: reason ?? null,
      approvedByManagerId: params.approvedByManagerId ?? '',
      cashierId: params.cashierId,
      createdAt: Date.now(),
    });
    return { queued: true };
  }
}

/** Online-only this phase — the desktop's own design docs confirm refund offline support was never built. */
export async function recordPosRefund(payload: PosRefundRequest): Promise<PosRefundResult> {
  const res = await fetch(getApiUrl('/api/v1/pos/refund'), {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      store_id: payload.store_id,
      register: payload.register,
      original_sale_id: payload.original_sale_id,
      items: payload.items.map((i) => ({ product_id: i.product_id, quantity: i.quantity, is_serialized: i.is_serialized, serials: i.serials ?? [] })),
    }),
  });
  const body = await parseJsonBody(res);
  if (!res.ok) throwForFailedResponse(res.status, body.message ?? 'Failed to record refund');
  if (!body.data) throw new Error('Unexpected response from refund endpoint');
  return body.data;
}

// ---------------------------------------------------------------------------
// Cash movement (cash in / cash out during an open shift)
// ---------------------------------------------------------------------------

/** Record a cash in or cash out movement for the active shift. Falls back to a local queue when offline. */
export async function recordCashMovement(params: {
  storeId: number;
  register: string;
  type: 'IN' | 'OUT';
  amount: number;
  reason?: string;
  cashierId: string;
}): Promise<CashMovementResult> {
  const clientMovementId = Crypto.randomUUID();
  const payload = {
    store_id: params.storeId,
    register: params.register,
    type: params.type,
    amount: params.amount,
    reason: params.reason,
    client_movement_uuid: clientMovementId,
  };

  try {
    const res = await fetch(getApiUrl('/api/v1/pos/shift/cash-movement'), {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    const body = await parseJsonBody(res);
    if (!res.ok) throwForFailedResponse(res.status, body.message ?? 'Failed to record cash movement');
    if (!body.data?.movement) throw new Error('Unexpected response');
    return body.data.movement;
  } catch (err) {
    if (!isLikelyNetworkFailure(err)) throw err;
    const shiftState = await offlineLoadShiftState(params.storeId, params.register);
    if (!shiftState) throw new Error('No active shift found for this register — cannot queue a cash movement offline.');
    await offlineEnqueueCashMovement({
      id: clientMovementId,
      clientShiftId: shiftState.clientShiftId,
      cashierId: params.cashierId,
      payload,
      createdAt: Date.now(),
    });
    return {
      id: 0,
      shift_id: shiftState.serverShiftId ?? 0,
      type: params.type,
      amount: params.amount,
      reason: params.reason ?? null,
      created_at: new Date().toISOString(),
      queued: true,
    };
  }
}

// ---------------------------------------------------------------------------
// Sales summary report
// ---------------------------------------------------------------------------

export async function getSalesSummary(params: {
  storeId: number;
  dateFrom: string;
  dateTo: string;
  groupBy: SalesSummaryGroupBy;
}): Promise<SalesSummaryReport> {
  const url = new URL(getApiUrl('/api/v1/pos/sales-summary'));
  url.searchParams.set('store_id', String(params.storeId));
  url.searchParams.set('date_from', params.dateFrom);
  url.searchParams.set('date_to', params.dateTo);
  url.searchParams.set('group_by', params.groupBy);
  const res = await fetch(url.toString(), { headers: getHeaders() });
  const body = await parseJsonBody(res);
  if (!res.ok) throwForFailedResponse(res.status, body.message ?? 'Failed to load sales summary');
  if (!body.data) throw new Error('No data in sales summary response');
  return body.data;
}

// ---------------------------------------------------------------------------
// Promoter roster (store-scoped search list backing PromoterComboBox) + the
// session-lock PIN check
// ---------------------------------------------------------------------------

/**
 * Store-scoped promoter/OIC roster — the population the search dropdown (in
 * CheckoutModal and FloatingStockModal) searches over, and validatePromoter()
 * validates against offline. Live: fetches and re-caches. Offline: reads the
 * last cached roster.
 */
export async function getStorePromoters(storeId: number): Promise<PromoterOption[]> {
  try {
    const res = await fetch(getApiUrl(`/api/v1/pos/promoters?store_id=${storeId}`), { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to load promoters');
    const body = (await parseJsonBody(res)) as { success?: boolean; data?: { user_id: string; name: string; email?: string | null }[] };
    if (!body.success || !Array.isArray(body.data)) throw new Error('Failed to load promoters');
    const list = body.data.map((p) => ({ userId: p.user_id, name: p.name, email: p.email ?? null }));
    await offlineCachePromoters(storeId, list);
    return list;
  } catch {
    return offlineListCachedPromoters(storeId);
  }
}

/** Refreshes this store's promoter/OIC roster cache — best-effort, call whenever online (e.g. shift open). */
export async function cacheStorePromoters(storeId: number): Promise<void> {
  await getStorePromoters(storeId);
}

/** Verify the session PIN (user's ID) for the auto-lock screen. */
export async function verifySessionPin(userId: string): Promise<{ success: boolean; message: string; unauthenticated?: boolean }> {
  const res = await fetch(getApiUrl('/api/v1/pos/verify-session-pin'), {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ user_id: userId }),
  });
  const body = (await parseJsonBody(res)) as { success: boolean; message: string };
  if (res.status === 401) {
    // No valid API token to check (e.g. this session logged in fully offline and
    // never obtained one) — not a real "wrong ID" verdict, so the caller should
    // fall back to the local check rather than surface this as a rejection.
    return { ...body, unauthenticated: true };
  }
  return body;
}

// ---------------------------------------------------------------------------
// Floating stock (demo units taken to the display floor) — a punch is purely
// an audit log on the backend, it never touches stock. When offline, queued
// locally and flushed by syncOfflinePendingFloatingStockEvents() on reconnect.
// ---------------------------------------------------------------------------

interface FloatingStockActionResponse {
  success: boolean;
  message?: string;
}

export async function punchOutFloatingStock(params: { serialNumber: string; storeId: number; promoterId?: string; notes?: string }): Promise<{ queued: boolean }> {
  const body = {
    serial_number: params.serialNumber,
    store_id: params.storeId,
    promoter_id: params.promoterId || undefined,
    notes: params.notes || undefined,
  };
  try {
    const res = await fetch(getApiUrl('/api/v1/pos/floating-stock/punch-out'), {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(body),
    });
    const resBody = (await parseJsonBody(res)) as FloatingStockActionResponse;
    if (!res.ok || !resBody.success) throw new Error(resBody.message ?? 'Failed to punch out serial.');
    return { queued: false };
  } catch (err) {
    if (!isLikelyNetworkFailure(err)) throw err;
    await offlineEnqueueFloatingStockEvent({ id: Crypto.randomUUID(), action: 'OUT', payload: body, createdAt: Date.now() });
    return { queued: true };
  }
}

export async function punchInFloatingStock(params: { serialNumber: string; storeId: number; reason?: string }): Promise<{ queued: boolean }> {
  const body = { serial_number: params.serialNumber, store_id: params.storeId, reason: params.reason || undefined };
  try {
    const res = await fetch(getApiUrl('/api/v1/pos/floating-stock/punch-in'), {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(body),
    });
    const resBody = (await parseJsonBody(res)) as FloatingStockActionResponse;
    if (!res.ok || !resBody.success) throw new Error(resBody.message ?? 'Failed to punch in serial.');
    return { queued: false };
  } catch (err) {
    if (!isLikelyNetworkFailure(err)) throw err;
    await offlineEnqueueFloatingStockEvent({ id: Crypto.randomUUID(), action: 'IN', payload: body, createdAt: Date.now() });
    return { queued: true };
  }
}

/**
 * Merges in any not-yet-synced local punches so the "currently out" list stays
 * accurate offline (or right after reconnecting, before the sync loop has run).
 */
function applyPendingFloatingStockEvents(
  serverItems: FloatingStockItem[],
  pending: { action: 'OUT' | 'IN'; payload: Record<string, unknown>; createdAt: number }[],
  status: 'OUT' | 'all'
): FloatingStockItem[] {
  if (pending.length === 0) return serverItems;

  const latestBySerial = new Map<string, { action: 'OUT' | 'IN'; payload: Record<string, unknown>; createdAt: number }>();
  for (const p of pending) {
    const sn = String(p.payload.serial_number ?? '');
    if (!sn) continue;
    const existing = latestBySerial.get(sn);
    if (!existing || p.createdAt > existing.createdAt) latestBySerial.set(sn, p);
  }

  let items = serverItems.filter((item) => {
    const pendingForSerial = latestBySerial.get(item.serial_number);
    return !(pendingForSerial && pendingForSerial.action === 'IN');
  });

  for (const [serial, p] of latestBySerial) {
    if (p.action !== 'OUT') continue;
    if (items.some((i) => i.serial_number === serial)) continue;
    items.push({
      id: -1,
      serial_number: serial,
      promoter_id: (p.payload.promoter_id as string) ?? null,
      punched_out_at: new Date(p.createdAt).toISOString(),
      notes: (p.payload.notes as string) ?? null,
      status: 'OUT',
      hours_out: Math.round((Date.now() - p.createdAt) / 36_000) / 100,
      pendingSync: true,
    });
  }

  if (status !== 'all') items = items.filter((i) => i.status === status);
  return items;
}

export async function listFloatingStock(storeId: number, status: 'OUT' | 'all' = 'OUT'): Promise<FloatingStockItem[]> {
  const pending = await offlineListPendingFloatingStockEvents();

  try {
    const url = new URL(getApiUrl('/api/v1/pos/floating-stock'));
    url.searchParams.set('store_id', String(storeId));
    url.searchParams.set('status', 'all');
    const res = await fetch(url.toString(), { headers: getHeaders() });
    const body = (await parseJsonBody(res)) as { success?: boolean; message?: string; data?: FloatingStockItem[] };
    if (!res.ok || !body.data) throw new Error(body.message ?? 'Failed to load floating stock.');
    return applyPendingFloatingStockEvents(body.data, pending, status);
  } catch (err) {
    if (!isLikelyNetworkFailure(err)) throw err;
    return applyPendingFloatingStockEvents([], pending, status);
  }
}

// ---------------------------------------------------------------------------
// Warranty lookup
// ---------------------------------------------------------------------------

export async function searchWarranties(q: string): Promise<WarrantyRecord[]> {
  const url = new URL(getApiUrl('/api/v1/pos/warranties'));
  url.searchParams.set('q', q);
  const res = await fetch(url.toString(), { headers: getHeaders() });
  const body = await parseJsonBody(res);
  if (!res.ok) throwForFailedResponse(res.status, body.message ?? 'Lookup failed');
  return body?.data?.warranties ?? [];
}
