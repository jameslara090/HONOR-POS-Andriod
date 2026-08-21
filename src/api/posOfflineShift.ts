/**
 * Pure helpers backing the offline shift-sync state machine. Ported verbatim
 * from the desktop's src/ui/api/posOfflineShift.ts — no I/O, so no changes
 * needed for Android.
 */

type PendingSaleLike = {
  payload: { store_id?: number; register?: string; payments?: { method: string; amount: number }[] };
};

export function isCashPayment(payment: { method: string }): boolean {
  return payment.method.toLowerCase() === 'cash';
}

export function belongsToCurrentCashier(cashierId: string, currentCashierId: string): boolean {
  return cashierId === currentCashierId;
}

export function sumCashFromPendingSales(pendingSales: PendingSaleLike[], storeId: number, register: string): number {
  let total = 0;
  for (const row of pendingSales) {
    const p = row.payload;
    if (p.store_id !== storeId) continue;
    if ((p.register ?? '') !== register) continue;
    for (const payment of p.payments ?? []) {
      if (isCashPayment(payment)) total += payment.amount;
    }
  }
  return total;
}

export function computeLocalExpectedCash(params: {
  openingCash: number;
  serverExpectedCash: number | null;
  unsyncedCashSalesTotal: number;
  unsyncedCashIn: number;
  unsyncedCashOut: number;
}): { expectedCash: number; isBlended: boolean } {
  const base = params.serverExpectedCash ?? params.openingCash;
  const delta = params.unsyncedCashSalesTotal + params.unsyncedCashIn - params.unsyncedCashOut;
  return { expectedCash: base + delta, isBlended: delta !== 0 };
}

export type SyncStep = 'OPEN_SHIFT' | 'SYNC_SALES' | 'SYNC_CASH_MOVEMENTS' | 'SYNC_VOIDS' | 'CLOSE_SHIFT' | 'DONE';

/**
 * Decides the single next step in the offline shift-sync chain. Strict
 * order: shift-open -> sales -> cash-movements -> voids -> close. Never
 * advances past a gap.
 */
export function nextOfflineShiftSyncStep(input: {
  shiftStatus: 'PENDING_OPEN' | 'OPEN' | 'PENDING_CLOSE' | null;
  hasPendingSalesForRegister: boolean;
  hasPendingCashMovementsForShift: boolean;
  hasPendingVoidsForShift: boolean;
}): SyncStep {
  if (input.shiftStatus === null) return 'DONE';
  if (input.shiftStatus === 'PENDING_OPEN') return 'OPEN_SHIFT';
  if (input.hasPendingSalesForRegister) return 'SYNC_SALES';
  if (input.hasPendingCashMovementsForShift) return 'SYNC_CASH_MOVEMENTS';
  if (input.hasPendingVoidsForShift) return 'SYNC_VOIDS';
  if (input.shiftStatus === 'PENDING_CLOSE') return 'CLOSE_SHIFT';
  return 'DONE';
}

/**
 * A sale qualifies for offline void when this terminal has first-hand,
 * up-to-date knowledge of it: it's either still sitting unsynced in this
 * device's own queue, or it synced during the current, still-open shift on
 * this register.
 */
export function qualifiesForOfflineVoid(input: {
  saleId: number;
  isLocalUnsynced: boolean;
  syncedSaleIdsThisShift: number[];
}): boolean {
  if (input.isLocalUnsynced) return true;
  return input.syncedSaleIdsThisShift.includes(input.saleId);
}
