/**
 * Ported from the desktop's src/electron/offlineStore.test.ts. Desktop ran this as a real
 * integration test against better-sqlite3 + a temp-dir file DB (no mocking — SQLite bypasses
 * fs/promises entirely). This port does the same against a real SQLite engine: expo-sqlite's
 * native module can't run under Jest, so `expo-sqlite` is mocked here to the same
 * open/run/getAll/getFirst/withTransaction surface backed by Node's built-in `node:sqlite`
 * (in-memory) — a real SQL engine, not a stub. Each test gets a fresh in-memory DB by
 * resetting the module registry (offlineStore.ts caches its db handle at module scope) instead
 * of the desktop's `resetDbForTests()` hook, which this port has no equivalent of.
 */
jest.mock('expo-sqlite', () => {
  const { DatabaseSync: RealDatabaseSync } = require('node:sqlite');

  function wrapDb(raw: InstanceType<typeof RealDatabaseSync>) {
    return {
      execAsync: async (sql: string) => {
        raw.exec(sql);
      },
      runAsync: async (sql: string, params: unknown[] = []) => {
        const info = raw.prepare(sql).run(...params);
        return { lastInsertRowId: info.lastInsertRowid, changes: info.changes };
      },
      getAllAsync: async (sql: string, params: unknown[] = []) => raw.prepare(sql).all(...params),
      getFirstAsync: async (sql: string, params: unknown[] = []) => raw.prepare(sql).get(...params) ?? null,
      withTransactionAsync: async (callback: () => Promise<void>) => {
        raw.exec('BEGIN');
        try {
          await callback();
          raw.exec('COMMIT');
        } catch (error) {
          raw.exec('ROLLBACK');
          throw error;
        }
      },
    };
  }

  return {
    openDatabaseAsync: async (_name: string) => wrapDb(new RealDatabaseSync(':memory:')),
  };
});

import type * as OfflineStore from './offlineStore';

let store: typeof OfflineStore;

beforeEach(() => {
  jest.resetModules();
  store = require('./offlineStore');
});

describe('shift state persistence', () => {
  const state: OfflineStore.LocalShiftState = {
    clientShiftId: 'shift-uuid-1',
    storeId: 5,
    register: 'REG-1',
    cashierId: 'user-1',
    openingCash: 1000,
    openedAt: 1_700_000_000_000,
    serverShiftId: null,
    status: 'PENDING_OPEN',
  };

  it('returns null when nothing has been saved yet', async () => {
    const loaded = await store.offlineLoadShiftState(5, 'REG-1');
    expect(loaded).toBeNull();
  });

  it('saves and loads a shift state for the matching store/register', async () => {
    await store.offlineSaveShiftState(state);
    const loaded = await store.offlineLoadShiftState(5, 'REG-1');
    expect(loaded).toEqual(state);
  });

  it('returns null for a different store/register than what was saved', async () => {
    await store.offlineSaveShiftState(state);
    const loaded = await store.offlineLoadShiftState(5, 'REG-2');
    expect(loaded).toBeNull();
  });

  it('clears shift state for the matching store/register only', async () => {
    await store.offlineSaveShiftState(state);
    await store.offlineClearShiftState(5, 'REG-1');
    expect(await store.offlineLoadShiftState(5, 'REG-1')).toBeNull();
  });
});

describe('pending cash movement queue', () => {
  it('starts empty', async () => {
    expect(await store.offlineListPendingCashMovements()).toEqual([]);
  });

  it('enqueues and lists a cash movement', async () => {
    await store.offlineEnqueueCashMovement({
      id: 'mv-1',
      clientShiftId: 'shift-uuid-1',
      cashierId: 'user-1',
      payload: { type: 'IN', amount: 500 },
      createdAt: 1_700_000_000_000,
    });
    const pending = await store.offlineListPendingCashMovements();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      id: 'mv-1',
      clientShiftId: 'shift-uuid-1',
      cashierId: 'user-1',
      attempts: 0,
    });
  });

  it('does not enqueue a duplicate id', async () => {
    const record = {
      id: 'mv-2',
      clientShiftId: 'shift-uuid-1',
      cashierId: 'user-1',
      payload: { type: 'OUT', amount: 100 },
      createdAt: 1_700_000_000_000,
    };
    await store.offlineEnqueueCashMovement(record);
    await store.offlineEnqueueCashMovement(record);
    expect(await store.offlineListPendingCashMovements()).toHaveLength(1);
  });

  it('removes a pending cash movement by id', async () => {
    await store.offlineEnqueueCashMovement({
      id: 'mv-3',
      clientShiftId: 'shift-uuid-1',
      cashierId: 'user-1',
      payload: { type: 'IN', amount: 200 },
      createdAt: 1_700_000_000_000,
    });
    await store.offlineRemovePendingCashMovement('mv-3');
    expect(await store.offlineListPendingCashMovements()).toEqual([]);
  });
});

describe('tracking synced sale ids on shift state', () => {
  const state: OfflineStore.LocalShiftState = {
    clientShiftId: 'shift-uuid-2',
    storeId: 8,
    register: 'REG-2',
    cashierId: 'user-2',
    openingCash: 500,
    openedAt: 1_700_000_000_000,
    serverShiftId: 42,
    status: 'OPEN',
  };

  const sale501 = { saleId: 501, receipt: 'R-501', amount: 1000, trandate: '2026-08-03T00:00:00Z' };
  const sale502 = { saleId: 502, receipt: 'R-502', amount: 2000, trandate: '2026-08-03T00:05:00Z' };

  it('does nothing when no shift state exists for the store/register', async () => {
    await store.offlineAddSyncedSale(8, 'REG-2', sale501);
    expect(await store.offlineLoadShiftState(8, 'REG-2')).toBeNull();
  });

  it('appends a synced sale to an existing shift state', async () => {
    await store.offlineSaveShiftState(state);
    await store.offlineAddSyncedSale(8, 'REG-2', sale501);
    await store.offlineAddSyncedSale(8, 'REG-2', sale502);
    const loaded = await store.offlineLoadShiftState(8, 'REG-2');
    expect(loaded?.syncedSales).toEqual([sale501, sale502]);
  });

  it('does not add a duplicate sale id', async () => {
    await store.offlineSaveShiftState(state);
    await store.offlineAddSyncedSale(8, 'REG-2', sale501);
    await store.offlineAddSyncedSale(8, 'REG-2', sale501);
    const loaded = await store.offlineLoadShiftState(8, 'REG-2');
    expect(loaded?.syncedSales).toEqual([sale501]);
  });
});

describe('pending void queue', () => {
  it('starts empty', async () => {
    expect(await store.offlineListPendingVoids()).toEqual([]);
  });

  it('enqueues and lists a pending void', async () => {
    await store.offlineEnqueueVoid({
      id: 'void-1',
      originalSaleId: 501,
      reason: 'Customer changed mind',
      approvedByManagerId: 'mgr-1',
      cashierId: 'user-2',
      createdAt: 1_700_000_000_000,
    });
    const pending = await store.offlineListPendingVoids();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      id: 'void-1',
      originalSaleId: 501,
      approvedByManagerId: 'mgr-1',
      cashierId: 'user-2',
      attempts: 0,
    });
  });

  it('does not enqueue a duplicate id', async () => {
    const record = {
      id: 'void-2', originalSaleId: 502, reason: null,
      approvedByManagerId: 'mgr-1', cashierId: 'user-2', createdAt: 1_700_000_000_000,
    };
    await store.offlineEnqueueVoid(record);
    await store.offlineEnqueueVoid(record);
    expect(await store.offlineListPendingVoids()).toHaveLength(1);
  });

  it('removes a pending void by id', async () => {
    await store.offlineEnqueueVoid({
      id: 'void-3', originalSaleId: 503, reason: null,
      approvedByManagerId: 'mgr-1', cashierId: 'user-2', createdAt: 1_700_000_000_000,
    });
    await store.offlineRemovePendingVoid('void-3');
    expect(await store.offlineListPendingVoids()).toEqual([]);
  });
});

describe('catalog stock decrement', () => {
  const snapshot = {
    storeId: 5,
    savedAt: 1_700_000_000_000,
    products: [
      { id: '1001', name: 'HONOR 200 PRO', stock: 15 },
      { id: '1002', name: 'HONOR Watch', stock: 3 },
    ],
  };

  it('does nothing when no snapshot has been saved for that store', async () => {
    await store.offlineDecrementCatalogStock(5, [{ productId: '1001', quantity: 1 }]);
    expect(await store.offlineLoadCatalog()).toBeNull();
  });

  it('does nothing when the snapshot is for a different store', async () => {
    await store.offlineSaveCatalog(snapshot);
    await store.offlineDecrementCatalogStock(9, [{ productId: '1001', quantity: 1 }]);
    const loaded = await store.offlineLoadCatalog();
    expect(loaded?.products).toEqual(snapshot.products);
  });

  it('subtracts sold quantity from the matching product', async () => {
    await store.offlineSaveCatalog(snapshot);
    await store.offlineDecrementCatalogStock(5, [{ productId: '1001', quantity: 2 }]);
    const loaded = await store.offlineLoadCatalog();
    expect(loaded?.products).toEqual([
      { id: '1001', name: 'HONOR 200 PRO', stock: 13 },
      { id: '1002', name: 'HONOR Watch', stock: 3 },
    ]);
  });

  it('aggregates multiple line items for the same product', async () => {
    await store.offlineSaveCatalog(snapshot);
    await store.offlineDecrementCatalogStock(5, [
      { productId: '1002', quantity: 1 },
      { productId: '1002', quantity: 1 },
    ]);
    const loaded = await store.offlineLoadCatalog();
    expect((loaded?.products as { id: string }[] | undefined)?.find((p) => p.id === '1002')).toEqual({
      id: '1002', name: 'HONOR Watch', stock: 1,
    });
  });

  it('clamps stock at 0 instead of going negative', async () => {
    await store.offlineSaveCatalog(snapshot);
    await store.offlineDecrementCatalogStock(5, [{ productId: '1002', quantity: 10 }]);
    const loaded = await store.offlineLoadCatalog();
    expect((loaded?.products as { id: string }[] | undefined)?.find((p) => p.id === '1002')).toEqual({
      id: '1002', name: 'HONOR Watch', stock: 0,
    });
  });

  it('leaves products with no matching sold id untouched', async () => {
    await store.offlineSaveCatalog(snapshot);
    await store.offlineDecrementCatalogStock(5, [{ productId: '9999', quantity: 1 }]);
    const loaded = await store.offlineLoadCatalog();
    expect(loaded?.products).toEqual(snapshot.products);
  });

  it('preserves savedAt — the decrement is a delta, not a fresh server read', async () => {
    await store.offlineSaveCatalog(snapshot);
    await store.offlineDecrementCatalogStock(5, [{ productId: '1001', quantity: 1 }]);
    const loaded = await store.offlineLoadCatalog();
    expect(loaded?.savedAt).toBe(snapshot.savedAt);
  });
});

describe('pending sales queue', () => {
  it('starts empty', async () => {
    expect(await store.offlineListPendingSales()).toEqual([]);
  });

  it('enqueues and lists a pending sale', async () => {
    await store.offlineEnqueueSale({ id: 'sale-1', payload: { total: 100 }, createdAt: 1_700_000_000_000 });
    const pending = await store.offlineListPendingSales();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ id: 'sale-1', payload: { total: 100 }, attempts: 0 });
  });

  it('does not enqueue a duplicate id', async () => {
    const record = { id: 'sale-2', payload: { total: 200 }, createdAt: 1_700_000_000_000 };
    await store.offlineEnqueueSale(record);
    await store.offlineEnqueueSale(record);
    expect(await store.offlineListPendingSales()).toHaveLength(1);
  });

  it('removes a pending sale by id', async () => {
    await store.offlineEnqueueSale({ id: 'sale-3', payload: { total: 300 }, createdAt: 1_700_000_000_000 });
    await store.offlineRemovePendingSale('sale-3');
    expect(await store.offlineListPendingSales()).toEqual([]);
  });
});

describe('cached customers', () => {
  it('starts empty', async () => {
    expect(await store.offlineListCachedCustomers()).toEqual([]);
  });

  it('caches only customers with a real positive id', async () => {
    await store.offlineUpsertCustomers([
      { id: 1, name: 'Real Customer' },
      { id: 0, name: 'Walk-in' },
    ]);
    const cached = await store.offlineListCachedCustomers();
    expect(cached).toEqual([{ id: 1, name: 'Real Customer' }]);
  });

  it('moves most-recently-seen customers to the front', async () => {
    await store.offlineUpsertCustomers([{ id: 1, name: 'A' }, { id: 2, name: 'B' }]);
    await store.offlineUpsertCustomers([{ id: 2, name: 'B' }]);
    const cached = await store.offlineListCachedCustomers();
    expect(cached.map((c) => c.id)).toEqual([2, 1]);
  });

  it('caps the cache at 50 entries', async () => {
    const batch = Array.from({ length: 60 }, (_, i) => ({ id: i + 1, name: `Customer ${i + 1}` }));
    await store.offlineUpsertCustomers(batch);
    expect(await store.offlineListCachedCustomers()).toHaveLength(50);
  });
});

describe('cached promoters', () => {
  it('returns undefined for a store with no cached roster at all', async () => {
    expect(await store.offlineFindCachedPromoter(5, 'promo@honor.ph')).toBeUndefined();
  });

  it('returns null for a populated roster with no match', async () => {
    await store.offlineCachePromoters(5, [{ userId: 'P1', name: 'Promo One', email: 'p1@honor.ph' }]);
    expect(await store.offlineFindCachedPromoter(5, 'nobody@honor.ph')).toBeNull();
  });

  it('matches by userId or email, case-insensitively', async () => {
    await store.offlineCachePromoters(5, [{ userId: 'P1', name: 'Promo One', email: 'P1@Honor.PH' }]);
    expect(await store.offlineFindCachedPromoter(5, 'p1')).toEqual({ userId: 'P1', name: 'Promo One', email: 'P1@Honor.PH' });
    expect(await store.offlineFindCachedPromoter(5, 'p1@honor.ph')).toEqual({ userId: 'P1', name: 'Promo One', email: 'P1@Honor.PH' });
  });

  it('scopes the roster by store', async () => {
    await store.offlineCachePromoters(5, [{ userId: 'P1', name: 'Promo One' }]);
    expect(await store.offlineFindCachedPromoter(9, 'P1')).toBeUndefined();
  });

  it('replaces the whole roster for that store on re-cache', async () => {
    await store.offlineCachePromoters(5, [{ userId: 'P1', name: 'Promo One' }]);
    await store.offlineCachePromoters(5, [{ userId: 'P2', name: 'Promo Two' }]);
    expect(await store.offlineListCachedPromoters(5)).toEqual([{ userId: 'P2', name: 'Promo Two', email: null }]);
  });
});

describe('held carts', () => {
  it('starts empty', async () => {
    expect(await store.offlineListHeldCarts()).toEqual([]);
  });

  it('saves and lists a held cart, oldest first', async () => {
    const cartA = { id: 'cart-a', heldAt: '2026-08-03T00:00:00.000Z', items: [] } as any;
    const cartB = { id: 'cart-b', heldAt: '2026-08-03T00:05:00.000Z', items: [] } as any;
    await store.offlineSaveHeldCart(cartB);
    await store.offlineSaveHeldCart(cartA);
    const held = await store.offlineListHeldCarts();
    expect(held.map((c) => c.id)).toEqual(['cart-a', 'cart-b']);
  });

  it('removes a held cart by id', async () => {
    const cart = { id: 'cart-c', heldAt: '2026-08-03T00:00:00.000Z', items: [] } as any;
    await store.offlineSaveHeldCart(cart);
    await store.offlineRemoveHeldCart('cart-c');
    expect(await store.offlineListHeldCarts()).toEqual([]);
  });
});
