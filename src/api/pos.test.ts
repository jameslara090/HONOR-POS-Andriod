/**
 * Ported from the desktop's src/ui/api/pos.test.ts. The desktop mocks window.electron's
 * offline-IPC bridge; this port's pos.ts imports ../services/offlineStore directly (no
 * process boundary), so that module is mocked instead. `cancelUnsyncedLocalSale` isn't
 * ported to this repo yet (nothing currently calls it), so that describe block is dropped.
 */
jest.mock('./config', () => ({
  getApiUrl: (path: string) => `http://fake-api${path}`,
  getApiToken: () => 'fake-token',
}));

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => 'test-uuid'),
}));

jest.mock('../services/offlineStore', () => ({
  offlineAddSyncedSale: jest.fn(async () => undefined),
  offlineCachePromoters: jest.fn(async () => undefined),
  offlineClearShiftState: jest.fn(async () => undefined),
  offlineEnqueueCashMovement: jest.fn(async () => undefined),
  offlineEnqueueFloatingStockEvent: jest.fn(async () => undefined),
  offlineEnqueueSale: jest.fn(async () => undefined),
  offlineEnqueueVoid: jest.fn(async () => undefined),
  offlineFindCachedPromoter: jest.fn(async () => undefined),
  offlineListCachedPromoters: jest.fn(async () => []),
  offlineListPendingCashMovements: jest.fn(async () => []),
  offlineListPendingFloatingStockEvents: jest.fn(async () => []),
  offlineListPendingSales: jest.fn(async () => []),
  offlineListPendingVoids: jest.fn(async () => []),
  offlineLoadShiftState: jest.fn(async () => null),
  offlineRemovePendingCashMovement: jest.fn(async () => undefined),
  offlineRemovePendingFloatingStockEvent: jest.fn(async () => undefined),
  offlineRemovePendingSale: jest.fn(async () => undefined),
  offlineRemovePendingVoid: jest.fn(async () => undefined),
  offlineSaveShiftState: jest.fn(async () => undefined),
}));

import * as offlineStore from '../services/offlineStore';
import type { PosSaleRequest } from '../types';
import {
  openShift,
  closeShift,
  recordCashMovement,
  syncOfflineShiftState,
  recordPosSale,
  voidPosSale,
  syncOfflinePendingSales,
  validatePromoter,
  validateSerial,
  lookupSerial,
  computeSaleAmounts,
} from './pos';

const mocks = offlineStore as jest.Mocked<typeof offlineStore>;

function fetchOk(data: unknown) {
  globalThis.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ data }) })) as unknown as typeof fetch;
}

function fetchFail(status: number, message: string) {
  globalThis.fetch = jest.fn(async () => ({ ok: false, status, json: async () => ({ message }) })) as unknown as typeof fetch;
}

function fetchNetworkError() {
  globalThis.fetch = jest.fn(async () => {
    throw new TypeError('Failed to fetch');
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  jest.clearAllMocks();
  mocks.offlineListPendingCashMovements.mockResolvedValue([]);
  mocks.offlineListPendingSales.mockResolvedValue([]);
  mocks.offlineListPendingVoids.mockResolvedValue([]);
  mocks.offlineListPendingFloatingStockEvents.mockResolvedValue([]);
  mocks.offlineLoadShiftState.mockResolvedValue(null);
});

describe('openShift offline fallback', () => {
  it('returns the server shift when the request succeeds', async () => {
    fetchOk({ shift: { id: 42, branch: 5, register: 'REG-1', opened_at: '2026-07-27T00:00:00Z', opening_cash: 1000, status: 'OPEN' } });

    const shift = await openShift({ storeId: 5, register: 'REG-1', openingCash: 1000, cashierId: 'user-1' });
    expect(shift.id).toBe(42);
    expect(mocks.offlineSaveShiftState).not.toHaveBeenCalled();
  });

  it('queues a local PENDING_OPEN shift when the network is unreachable', async () => {
    fetchNetworkError();

    const shift = await openShift({ storeId: 5, register: 'REG-1', openingCash: 1000, cashierId: 'user-1' });

    expect(shift.status).toBe('PENDING_OPEN');
    expect(shift.id).toBe(0);
    expect(mocks.offlineSaveShiftState).toHaveBeenCalledTimes(1);
    const savedState = mocks.offlineSaveShiftState.mock.calls[0][0];
    expect(savedState.status).toBe('PENDING_OPEN');
    expect(savedState.storeId).toBe(5);
    expect(savedState.register).toBe('REG-1');
    expect(savedState.cashierId).toBe('user-1');
  });
});

describe('recordCashMovement offline fallback', () => {
  beforeEach(() => {
    mocks.offlineLoadShiftState.mockResolvedValue({
      clientShiftId: 'shift-1', storeId: 5, register: 'REG-1', cashierId: 'user-1',
      openingCash: 1000, openedAt: 1_700_000_000_000, serverShiftId: 42, status: 'OPEN',
    });
  });

  it('records live when online', async () => {
    fetchOk({ movement: { id: 9, shift_id: 42, type: 'IN', amount: 500, created_at: '2026-07-27T00:00:00Z' } });

    const result = await recordCashMovement({ storeId: 5, register: 'REG-1', type: 'IN', amount: 500, cashierId: 'user-1' });
    expect(result.id).toBe(9);
    expect((result as { queued?: boolean }).queued).toBeFalsy();
    expect(mocks.offlineEnqueueCashMovement).not.toHaveBeenCalled();
  });

  it('queues locally when the network is unreachable', async () => {
    fetchNetworkError();

    const result = await recordCashMovement({ storeId: 5, register: 'REG-1', type: 'OUT', amount: 200, reason: 'Petty cash', cashierId: 'user-1' });

    expect(result.queued).toBe(true);
    expect(mocks.offlineEnqueueCashMovement).toHaveBeenCalledTimes(1);
    const enqueued = mocks.offlineEnqueueCashMovement.mock.calls[0][0];
    expect(enqueued.clientShiftId).toBe('shift-1');
    expect(enqueued.cashierId).toBe('user-1');
  });
});

describe('closeShift pending-close split', () => {
  beforeEach(() => {
    mocks.offlineLoadShiftState.mockResolvedValue({
      clientShiftId: 'shift-1', storeId: 5, register: 'REG-1', cashierId: 'user-1',
      openingCash: 1000, openedAt: 1_700_000_000_000, serverShiftId: 42, status: 'OPEN',
    });
  });

  it('closes for real when nothing is unsynced for this shift', async () => {
    fetchOk({ shift: { id: 42, status: 'CLOSED' }, eod_report: { z_number: 'Z-001' } });

    const outcome = await closeShift(42, 5000, { storeId: 5, register: 'REG-1' });
    expect(outcome.kind).toBe('closed');
  });

  it('goes to pending-close when a sale is still queued for this register', async () => {
    mocks.offlineListPendingSales.mockResolvedValue([
      { id: 's1', payload: { store_id: 5, register: 'REG-1' }, createdAt: 1, attempts: 0 },
    ]);
    globalThis.fetch = jest.fn() as unknown as typeof fetch;

    const outcome = await closeShift(42, 5000, { storeId: 5, register: 'REG-1' });
    expect(outcome).toEqual({ kind: 'pending', closingCash: 5000 });
    expect(mocks.offlineSaveShiftState).toHaveBeenCalledWith(expect.objectContaining({ status: 'PENDING_CLOSE', closingCash: 5000 }));
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe('syncOfflineShiftState', () => {
  it('does nothing when there is no local shift state', async () => {
    mocks.offlineLoadShiftState.mockResolvedValue(null);
    const result = await syncOfflineShiftState({ storeId: 5, register: 'REG-1', currentCashierId: 'user-1' });
    expect(result).toEqual({ shiftOpened: false, cashMovementsSynced: 0, shiftClosed: null, voidsSynced: 0, voidConflicts: [], saleConflicts: [] });
  });

  it('skips records belonging to a different cashier than the current session', async () => {
    mocks.offlineLoadShiftState.mockResolvedValue({
      clientShiftId: 'shift-1', storeId: 5, register: 'REG-1', cashierId: 'user-OTHER',
      openingCash: 1000, openedAt: 1, serverShiftId: null, status: 'PENDING_OPEN',
    });
    globalThis.fetch = jest.fn() as unknown as typeof fetch;

    const result = await syncOfflineShiftState({ storeId: 5, register: 'REG-1', currentCashierId: 'user-1' });

    expect(result).toEqual({ shiftOpened: false, cashMovementsSynced: 0, shiftClosed: null, voidsSynced: 0, voidConflicts: [], saleConflicts: [] });
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(mocks.offlineSaveShiftState).not.toHaveBeenCalled();
  });
});

describe('recordPosSale tracks synced sales', () => {
  it('tracks the real sale after a successful live sale', async () => {
    fetchOk({ sale_id: 777, transac: 'T1', receipt: 'R1', trandate: '2026-07-29T00:00:00Z', amount: 100 });

    await recordPosSale({ store_id: 5, register: 'REG-1', items: [], payments: [] } as unknown as PosSaleRequest);

    expect(mocks.offlineAddSyncedSale).toHaveBeenCalledWith(5, 'REG-1', {
      saleId: 777,
      receipt: 'R1',
      amount: 100,
      trandate: '2026-07-29T00:00:00Z',
    });
  });

  it('queues the sale instead of throwing when it gets a 401 (offline-login session)', async () => {
    fetchFail(401, 'Unauthenticated.');

    const result = await recordPosSale({ store_id: 5, register: 'REG-1', items: [], payments: [] } as unknown as PosSaleRequest);
    expect(result.sale_id).toBe(0);
    expect(mocks.offlineEnqueueSale).toHaveBeenCalledTimes(1);
  });
});

describe('voidPosSale offline fallback', () => {
  beforeEach(() => {
    mocks.offlineLoadShiftState.mockResolvedValue({
      clientShiftId: 'shift-1', storeId: 5, register: 'REG-1', cashierId: 'user-1',
      openingCash: 1000, openedAt: 1_700_000_000_000, serverShiftId: 42, status: 'OPEN',
    });
  });

  it('calls the live endpoint when online', async () => {
    fetchOk({ sale_id: 501, voided_at: '2026-07-29T00:00:00Z' });

    const result = await voidPosSale(501, 'Customer changed mind', {
      storeId: 5, register: 'REG-1', cashierId: 'user-1', approvedByManagerId: 'mgr-1',
    });

    expect(result.queued).toBe(false);
  });

  it('queues the void when the network is unreachable', async () => {
    fetchNetworkError();

    const result = await voidPosSale(501, 'Customer changed mind', {
      storeId: 5, register: 'REG-1', cashierId: 'user-1', approvedByManagerId: 'mgr-1',
    });

    expect(result.queued).toBe(true);
    expect(mocks.offlineEnqueueVoid).toHaveBeenCalledTimes(1);
    const enqueued = mocks.offlineEnqueueVoid.mock.calls[0][0];
    expect(enqueued.originalSaleId).toBe(501);
    expect(enqueued.approvedByManagerId).toBe('mgr-1');
    expect(enqueued.cashierId).toBe('user-1');
  });

  it('queues the void instead of throwing on a 401 (offline-login session)', async () => {
    fetchFail(401, 'Unauthenticated.');

    const result = await voidPosSale(501, null, {
      storeId: 5, register: 'REG-1', cashierId: 'user-1', approvedByManagerId: 'mgr-1',
    });
    expect(result.queued).toBe(true);
  });

  it('throws when queuing offline without an active local shift', async () => {
    mocks.offlineLoadShiftState.mockResolvedValue(null);
    fetchNetworkError();

    await expect(voidPosSale(501, null, {
      storeId: 5, register: 'REG-1', cashierId: 'user-1', approvedByManagerId: 'mgr-1',
    })).rejects.toThrow(/no active shift/i);
  });
});

describe('syncOfflineShiftState syncs pending voids', () => {
  beforeEach(() => {
    mocks.offlineLoadShiftState.mockResolvedValue({
      clientShiftId: 'shift-1', storeId: 5, register: 'REG-1', cashierId: 'user-1',
      openingCash: 1000, openedAt: 1_700_000_000_000, serverShiftId: 42, status: 'OPEN',
    });
  });

  it('removes a conflicting void and reports it instead of retrying forever', async () => {
    mocks.offlineListPendingVoids.mockResolvedValue([{
      id: 'void-1', originalSaleId: 501, reason: null,
      approvedByManagerId: 'mgr-1', cashierId: 'user-1', createdAt: 1_700_000_000_000, attempts: 0,
    }]);
    fetchFail(422, 'This transaction has already been voided.');

    const result = await syncOfflineShiftState({ storeId: 5, register: 'REG-1', currentCashierId: 'user-1' });

    expect(mocks.offlineRemovePendingVoid).toHaveBeenCalledWith('void-1');
    expect(result.voidConflicts).toEqual([{ originalSaleId: 501, message: 'This transaction has already been voided.' }]);
  });

  it('leaves a void queued (not a conflict) on a 401', async () => {
    mocks.offlineListPendingVoids.mockResolvedValue([{
      id: 'void-1', originalSaleId: 501, reason: null,
      approvedByManagerId: 'mgr-1', cashierId: 'user-1', createdAt: 1_700_000_000_000, attempts: 0,
    }]);
    fetchFail(401, 'Unauthenticated.');

    const result = await syncOfflineShiftState({ storeId: 5, register: 'REG-1', currentCashierId: 'user-1' });

    expect(mocks.offlineRemovePendingVoid).not.toHaveBeenCalled();
    expect(result.voidConflicts).toEqual([]);
  });
});

describe('validatePromoter offline fallback', () => {
  it('returns a real invalid verdict when online and the promoter is not found', async () => {
    fetchFail(422, 'Promoter is not assigned to this store.');

    const result = await validatePromoter('PROMO1', 5);
    expect(result.valid).toBe(false);
    expect(result.offline).toBeFalsy();
  });

  it('accepts as offline-unverified rather than throwing when the network is unreachable', async () => {
    fetchNetworkError();

    const result = await validatePromoter('PROMO1', 5);
    expect(result.valid).toBe(false);
    expect(result.offline).toBe(true);
  });

  it('accepts as offline-unverified on a 401 (no valid token, e.g. an offline login)', async () => {
    fetchFail(401, 'Unauthenticated.');

    const result = await validatePromoter('PROMO1', 5);
    expect(result.valid).toBe(false);
    expect(result.offline).toBe(true);
  });
});

describe('validateSerial offline fallback', () => {
  it('returns valid on a successful live check', async () => {
    globalThis.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ success: true }) })) as unknown as typeof fetch;

    const outcome = await validateSerial({ serial_number: 'SN-1', product_id: 7, store_id: 5 });
    expect(outcome).toEqual({ valid: true });
  });

  it('returns valid=false with the server message on a genuine rejection', async () => {
    fetchFail(422, 'Serial not available at this store.');

    const outcome = await validateSerial({ serial_number: 'SN-1', product_id: 7, store_id: 5 });
    expect(outcome).toEqual({ valid: false, message: 'Serial not available at this store.' });
  });

  it('accepts the serial as unverified when the network is unreachable', async () => {
    fetchNetworkError();

    const outcome = await validateSerial({ serial_number: 'SN-1', product_id: 7, store_id: 5 });
    expect(outcome).toEqual({ valid: true, offline: true });
  });

  it('accepts the serial as unverified on a 401 (offline-login session, no valid token)', async () => {
    fetchFail(401, 'Unauthenticated.');

    const outcome = await validateSerial({ serial_number: 'SN-1', product_id: 7, store_id: 5 });
    expect(outcome).toEqual({ valid: true, offline: true });
  });
});

describe('lookupSerial offline messaging', () => {
  const OFFLINE_LOOKUP_MESSAGE =
    "Can't look up by serial while offline — search for the product and enter the serial from there instead.";

  it('throws the actionable offline message when the network is unreachable', async () => {
    fetchNetworkError();
    await expect(lookupSerial({ serial_number: 'SN-1', store_id: 5 })).rejects.toThrow(OFFLINE_LOOKUP_MESSAGE);
  });

  it('throws the actionable offline message on a 401 (offline-login session)', async () => {
    fetchFail(401, 'Unauthenticated.');
    await expect(lookupSerial({ serial_number: 'SN-1', store_id: 5 })).rejects.toThrow(OFFLINE_LOOKUP_MESSAGE);
  });

  it('still throws the server message on a genuine not-found', async () => {
    fetchFail(404, 'Serial not found');
    await expect(lookupSerial({ serial_number: 'NOPE', store_id: 5 })).rejects.toThrow('Serial not found');
  });
});

describe('syncOfflinePendingSales conflict surfacing', () => {
  const pendingRow = {
    id: 'row-1',
    payload: { client_sale_id: 'abc-123-def', store_id: 5, register: 'REG-1' },
    createdAt: 1,
    attempts: 0,
  };

  beforeEach(() => {
    mocks.offlineListPendingSales.mockResolvedValue([pendingRow]);
  });

  it('removes the sale and reports a conflict on a genuine server rejection', async () => {
    fetchFail(422, 'Serial SN-1 has already been sold.');

    const result = await syncOfflinePendingSales();

    expect(result.synced).toBe(0);
    expect(result.saleConflicts).toEqual([{ clientSaleId: 'abc-123-def', message: 'Serial SN-1 has already been sold.' }]);
    expect(mocks.offlineRemovePendingSale).toHaveBeenCalledWith('row-1');
  });

  it('leaves the sale queued (no conflict) on a 401', async () => {
    fetchFail(401, 'Unauthenticated.');

    const result = await syncOfflinePendingSales();

    expect(result).toEqual({ synced: 0, failed: 1, saleConflicts: [] });
    expect(mocks.offlineRemovePendingSale).not.toHaveBeenCalled();
  });

  it('leaves the sale queued (no conflict) on a network failure', async () => {
    fetchNetworkError();

    const result = await syncOfflinePendingSales();

    expect(result).toEqual({ synced: 0, failed: 1, saleConflicts: [] });
    expect(mocks.offlineRemovePendingSale).not.toHaveBeenCalled();
  });
});

describe('computeSaleAmounts', () => {
  const basePayload = {
    store_id: 5,
    register: 'REG-1',
    payments: [],
    items: [{ product_id: 1, name: 'HONOR 200 PRO', sku: 'SKU-1', price: 29_999.10, quantity: 1, is_serialized: false, serials: [] }],
  } as unknown as PosSaleRequest;

  it('nets a discount off the item total — regression for the ₱0.00 pending-sync display bug', () => {
    const { saleAmount } = computeSaleAmounts({ ...basePayload, discount_amt: 2_999.91 });
    expect(saleAmount).toBeCloseTo(26_999.19, 2);
  });

  it('returns the plain item total when there is no discount', () => {
    const { saleAmount } = computeSaleAmounts(basePayload);
    expect(saleAmount).toBeCloseTo(29_999.10, 2);
  });

  it('sums payments for tenderAmount, independent of the item/discount math', () => {
    const { tenderAmount } = computeSaleAmounts({
      ...basePayload,
      payments: [{ method: 'CASH', amount: 20_000 }, { method: 'GCASH', amount: 6_999.19 }],
    } as unknown as PosSaleRequest);
    expect(tenderAmount).toBeCloseTo(26_999.19, 2);
  });

  it('never goes negative when the discount exceeds the item total', () => {
    const { saleAmount } = computeSaleAmounts({ ...basePayload, discount_amt: 999_999 });
    expect(saleAmount).toBe(0);
  });
});
