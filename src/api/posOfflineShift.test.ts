import {
  belongsToCurrentCashier,
  isCashPayment,
  sumCashFromPendingSales,
  computeLocalExpectedCash,
  nextOfflineShiftSyncStep,
  qualifiesForOfflineVoid,
} from './posOfflineShift';

describe('belongsToCurrentCashier', () => {
  it('is true when ids match', () => {
    expect(belongsToCurrentCashier('user-1', 'user-1')).toBe(true);
  });
  it('is false when ids differ', () => {
    expect(belongsToCurrentCashier('user-1', 'user-2')).toBe(false);
  });
});

describe('isCashPayment', () => {
  it('matches "CASH" case-insensitively', () => {
    expect(isCashPayment({ method: 'CASH' })).toBe(true);
    expect(isCashPayment({ method: 'cash' })).toBe(true);
  });
  it('does not match other tender methods', () => {
    expect(isCashPayment({ method: 'GCASH' })).toBe(false);
    expect(isCashPayment({ method: 'CARD' })).toBe(false);
  });
});

describe('sumCashFromPendingSales', () => {
  const pendingSales = [
    { payload: { store_id: 5, register: 'REG-1', payments: [{ method: 'CASH', amount: 100 }, { method: 'GCASH', amount: 50 }] } },
    { payload: { store_id: 5, register: 'REG-1', payments: [{ method: 'CASH', amount: 200 }] } },
    { payload: { store_id: 5, register: 'REG-2', payments: [{ method: 'CASH', amount: 999 }] } },
    { payload: { store_id: 9, register: 'REG-1', payments: [{ method: 'CASH', amount: 999 }] } },
  ];

  it('sums only cash payments for the matching store and register', () => {
    expect(sumCashFromPendingSales(pendingSales, 5, 'REG-1')).toBe(300);
  });

  it('returns 0 when nothing matches', () => {
    expect(sumCashFromPendingSales(pendingSales, 999, 'REG-9')).toBe(0);
  });
});

describe('computeLocalExpectedCash', () => {
  it('uses opening cash as the base when there is no server figure yet', () => {
    const result = computeLocalExpectedCash({
      openingCash: 1000,
      serverExpectedCash: null,
      unsyncedCashSalesTotal: 300,
      unsyncedCashIn: 100,
      unsyncedCashOut: 50,
    });
    expect(result.expectedCash).toBe(1350);
    expect(result.isBlended).toBe(true);
  });

  it('adds unsynced deltas on top of the server figure', () => {
    const result = computeLocalExpectedCash({
      openingCash: 1000,
      serverExpectedCash: 6000,
      unsyncedCashSalesTotal: 200,
      unsyncedCashIn: 0,
      unsyncedCashOut: 0,
    });
    expect(result.expectedCash).toBe(6200);
    expect(result.isBlended).toBe(true);
  });

  it('is not blended when there is nothing unsynced', () => {
    const result = computeLocalExpectedCash({
      openingCash: 1000,
      serverExpectedCash: 6000,
      unsyncedCashSalesTotal: 0,
      unsyncedCashIn: 0,
      unsyncedCashOut: 0,
    });
    expect(result.expectedCash).toBe(6000);
    expect(result.isBlended).toBe(false);
  });
});

describe('nextOfflineShiftSyncStep', () => {
  it('is DONE when there is no local shift', () => {
    expect(nextOfflineShiftSyncStep({
      shiftStatus: null, hasPendingSalesForRegister: false, hasPendingCashMovementsForShift: false, hasPendingVoidsForShift: false,
    })).toBe('DONE');
  });

  it('opens the shift first, even if sales/cash-movements are also pending', () => {
    expect(nextOfflineShiftSyncStep({
      shiftStatus: 'PENDING_OPEN', hasPendingSalesForRegister: true, hasPendingCashMovementsForShift: true, hasPendingVoidsForShift: false,
    })).toBe('OPEN_SHIFT');
  });

  it('syncs sales before cash movements once the shift is open', () => {
    expect(nextOfflineShiftSyncStep({
      shiftStatus: 'OPEN', hasPendingSalesForRegister: true, hasPendingCashMovementsForShift: true, hasPendingVoidsForShift: false,
    })).toBe('SYNC_SALES');
  });

  it('syncs cash movements once sales are clear', () => {
    expect(nextOfflineShiftSyncStep({
      shiftStatus: 'OPEN', hasPendingSalesForRegister: false, hasPendingCashMovementsForShift: true, hasPendingVoidsForShift: false,
    })).toBe('SYNC_CASH_MOVEMENTS');
  });

  it('is DONE when the shift is OPEN with nothing pending (nothing to do until close)', () => {
    expect(nextOfflineShiftSyncStep({
      shiftStatus: 'OPEN', hasPendingSalesForRegister: false, hasPendingCashMovementsForShift: false, hasPendingVoidsForShift: false,
    })).toBe('DONE');
  });

  it('never closes while sales or cash movements are still pending', () => {
    expect(nextOfflineShiftSyncStep({
      shiftStatus: 'PENDING_CLOSE', hasPendingSalesForRegister: true, hasPendingCashMovementsForShift: false, hasPendingVoidsForShift: false,
    })).toBe('SYNC_SALES');
    expect(nextOfflineShiftSyncStep({
      shiftStatus: 'PENDING_CLOSE', hasPendingSalesForRegister: false, hasPendingCashMovementsForShift: true, hasPendingVoidsForShift: false,
    })).toBe('SYNC_CASH_MOVEMENTS');
  });

  it('closes only once everything for the shift has synced', () => {
    expect(nextOfflineShiftSyncStep({
      shiftStatus: 'PENDING_CLOSE', hasPendingSalesForRegister: false, hasPendingCashMovementsForShift: false, hasPendingVoidsForShift: false,
    })).toBe('CLOSE_SHIFT');
  });
});

describe('nextOfflineShiftSyncStep — voids', () => {
  it('syncs voids after cash movements, before close', () => {
    expect(nextOfflineShiftSyncStep({
      shiftStatus: 'OPEN', hasPendingSalesForRegister: false,
      hasPendingCashMovementsForShift: false, hasPendingVoidsForShift: true,
    })).toBe('SYNC_VOIDS');
  });

  it('does not close while voids are still pending', () => {
    expect(nextOfflineShiftSyncStep({
      shiftStatus: 'PENDING_CLOSE', hasPendingSalesForRegister: false,
      hasPendingCashMovementsForShift: false, hasPendingVoidsForShift: true,
    })).toBe('SYNC_VOIDS');
  });
});

describe('qualifiesForOfflineVoid', () => {
  it('qualifies a sale still sitting in the local unsynced queue', () => {
    expect(qualifiesForOfflineVoid({ saleId: 0, isLocalUnsynced: true, syncedSaleIdsThisShift: [] })).toBe(true);
  });

  it('qualifies a synced sale made this shift on this register', () => {
    expect(qualifiesForOfflineVoid({ saleId: 501, isLocalUnsynced: false, syncedSaleIdsThisShift: [501, 502] })).toBe(true);
  });

  it('does not qualify a synced sale not made this shift', () => {
    expect(qualifiesForOfflineVoid({ saleId: 999, isLocalUnsynced: false, syncedSaleIdsThisShift: [501, 502] })).toBe(false);
  });
});
