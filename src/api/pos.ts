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
import type { CloseShiftOutcome, CloseShiftResult, EodReport, PosShiftInfo } from '../types';
import * as Crypto from 'expo-crypto';
import {
  offlineAddSyncedSale,
  offlineClearShiftState,
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

// ---------------------------------------------------------------------------
// Reconnect sync: shift state, then queued sales/cash-movements/voids
// ---------------------------------------------------------------------------

export interface SaleSyncConflict {
  clientSaleId: string;
  message: string;
}

async function postPendingSale(payload: Record<string, unknown>): Promise<{ ok: boolean; status: number; body: any }> {
  const res = await fetch(getApiUrl('/api/v1/pos/sale'), {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseJsonBody(res);
  return { ok: res.ok, status: res.status, body };
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
      const { ok, status, body } = await postPendingSale(row.payload);
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
