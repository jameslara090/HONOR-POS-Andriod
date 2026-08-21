/**
 * Offline SQLite store — ported from the desktop's src/electron/{sqliteDb,offlineStore}.ts.
 *
 * Desktop used better-sqlite3 (synchronous, native, main-process-only) with a
 * JSON-file mirror as a fallback if a SQLite call threw, plus a one-time
 * migration from a pre-SQLite JSON store. None of that applies here: there is
 * no legacy JSON store to migrate from or fall back to, and expo-sqlite's
 * `*Async` API is the only storage path — so only the SQLite-branch logic of
 * each desktop function is ported, using the genuinely-async
 * runAsync/getAllAsync/getFirstAsync/withTransactionAsync calls in place of
 * the desktop's synchronous db.prepare().run()/.all()/.get().
 *
 * There is also no IPC layer here (no main/renderer process boundary) — every
 * function below is called directly from src/api/*.ts, in-process.
 */
import * as SQLite from 'expo-sqlite';

const DB_NAME = 'pos-offline.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DB_NAME).then(async (db) => {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS pending_sales (
          id TEXT PRIMARY KEY,
          payload TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          last_error TEXT
        );

        CREATE TABLE IF NOT EXISTS pending_cash_movements (
          id TEXT PRIMARY KEY,
          client_shift_id TEXT NOT NULL,
          cashier_id TEXT NOT NULL,
          payload TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          last_error TEXT
        );

        CREATE TABLE IF NOT EXISTS pending_voids (
          id TEXT PRIMARY KEY,
          original_sale_id INTEGER NOT NULL,
          reason TEXT,
          approved_by_manager_id TEXT NOT NULL,
          cashier_id TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          last_error TEXT
        );

        CREATE TABLE IF NOT EXISTS pending_customers (
          id TEXT PRIMARY KEY,
          payload TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          last_error TEXT
        );

        CREATE TABLE IF NOT EXISTS catalog_meta (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          store_id INTEGER NOT NULL,
          saved_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS catalog_products (
          product_id TEXT PRIMARY KEY,
          data TEXT NOT NULL,
          sort_order INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS cached_customers (
          id INTEGER PRIMARY KEY,
          data TEXT NOT NULL,
          position INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS shift_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          store_id INTEGER NOT NULL,
          register TEXT NOT NULL,
          data TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS cached_promoters (
          store_id INTEGER NOT NULL,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          email TEXT,
          PRIMARY KEY (store_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS pending_floating_stock_events (
          id TEXT PRIMARY KEY,
          action TEXT NOT NULL CHECK (action IN ('OUT', 'IN')),
          payload TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          last_error TEXT
        );
      `);
      return db;
    });
  }
  return dbPromise;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PendingSaleRecord = {
  id: string;
  payload: Record<string, unknown>;
  createdAt: number;
  attempts: number;
  lastError?: string;
};

export type PendingCustomerRecord = PendingSaleRecord;

export type CatalogSnapshot = {
  storeId: number;
  savedAt: number;
  products: unknown[];
};

export type CachedCustomer = {
  id: number;
  name: string;
  company?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  tin?: string | null;
};

export type LocalShiftStatus = 'PENDING_OPEN' | 'OPEN' | 'PENDING_CLOSE';

export type SyncedSaleRecord = {
  saleId: number;
  receipt: string;
  amount: number;
  trandate: string;
};

export type LocalShiftState = {
  clientShiftId: string;
  storeId: number;
  register: string;
  cashierId: string;
  openingCash: number;
  openedAt: number;
  serverShiftId: number | null;
  status: LocalShiftStatus;
  closingCash?: number;
  pendingClosedAt?: number;
  /** Sales that got a real server id during this shift — the offline-void
   * qualification list, and enough display data to void one from Sales
   * History while offline. */
  syncedSales?: SyncedSaleRecord[];
};

export type PendingCashMovementRecord = {
  id: string;
  clientShiftId: string;
  cashierId: string;
  payload: Record<string, unknown>;
  createdAt: number;
  attempts: number;
  lastError?: string;
};

export type PendingVoidRecord = {
  id: string;
  originalSaleId: number;
  reason: string | null;
  approvedByManagerId: string;
  cashierId: string;
  createdAt: number;
  attempts: number;
  lastError?: string;
};

export type CachedPromoter = {
  userId: string;
  name: string;
  email?: string | null;
};

export type PendingFloatingStockEvent = {
  id: string;
  action: 'OUT' | 'IN';
  payload: Record<string, unknown>;
  createdAt: number;
  attempts: number;
  lastError?: string;
};

// ---------------------------------------------------------------------------
// Row shapes (snake_case, as stored) + mappers
// ---------------------------------------------------------------------------

type PendingSaleRow = { id: string; payload: string; created_at: number; attempts: number; last_error: string | null };
function rowToPendingSale(row: PendingSaleRow): PendingSaleRecord {
  return {
    id: row.id,
    payload: JSON.parse(row.payload),
    createdAt: row.created_at,
    attempts: row.attempts,
    lastError: row.last_error ?? undefined,
  };
}

type PendingCashMovementRow = PendingSaleRow & { client_shift_id: string; cashier_id: string };
function rowToPendingCashMovement(row: PendingCashMovementRow): PendingCashMovementRecord {
  return {
    id: row.id,
    clientShiftId: row.client_shift_id,
    cashierId: row.cashier_id,
    payload: JSON.parse(row.payload),
    createdAt: row.created_at,
    attempts: row.attempts,
    lastError: row.last_error ?? undefined,
  };
}

type PendingVoidRow = {
  id: string;
  original_sale_id: number;
  reason: string | null;
  approved_by_manager_id: string;
  cashier_id: string;
  created_at: number;
  attempts: number;
  last_error: string | null;
};
function rowToPendingVoid(row: PendingVoidRow): PendingVoidRecord {
  return {
    id: row.id,
    originalSaleId: row.original_sale_id,
    reason: row.reason,
    approvedByManagerId: row.approved_by_manager_id,
    cashierId: row.cashier_id,
    createdAt: row.created_at,
    attempts: row.attempts,
    lastError: row.last_error ?? undefined,
  };
}

type PendingFloatingStockEventRow = { id: string; action: 'OUT' | 'IN'; payload: string; created_at: number; attempts: number; last_error: string | null };
function rowToPendingFloatingStockEvent(row: PendingFloatingStockEventRow): PendingFloatingStockEvent {
  return {
    id: row.id,
    action: row.action,
    payload: JSON.parse(row.payload),
    createdAt: row.created_at,
    attempts: row.attempts,
    lastError: row.last_error ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Pending sales queue
// ---------------------------------------------------------------------------

export async function offlineEnqueueSale(record: { id: string; payload: Record<string, unknown>; createdAt: number }): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR IGNORE INTO pending_sales (id, payload, created_at, attempts) VALUES (?, ?, ?, 0)',
    [record.id, JSON.stringify(record.payload), record.createdAt]
  );
}

export async function offlineListPendingSales(): Promise<PendingSaleRecord[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<PendingSaleRow>('SELECT * FROM pending_sales ORDER BY created_at ASC', []);
  return rows.map(rowToPendingSale);
}

export async function offlineRemovePendingSale(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM pending_sales WHERE id = ?', [id]);
}

// ---------------------------------------------------------------------------
// Pending customers queue
// ---------------------------------------------------------------------------

export async function offlineEnqueueCustomer(record: { id: string; payload: Record<string, unknown>; createdAt: number }): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR IGNORE INTO pending_customers (id, payload, created_at, attempts) VALUES (?, ?, ?, 0)',
    [record.id, JSON.stringify(record.payload), record.createdAt]
  );
}

export async function offlineListPendingCustomers(): Promise<PendingCustomerRecord[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<PendingSaleRow>('SELECT * FROM pending_customers ORDER BY created_at ASC', []);
  return rows.map(rowToPendingSale);
}

export async function offlineRemovePendingCustomer(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM pending_customers WHERE id = ?', [id]);
}

// ---------------------------------------------------------------------------
// Catalog snapshot
// ---------------------------------------------------------------------------

export async function offlineSaveCatalog(snapshot: CatalogSnapshot): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.execAsync('DELETE FROM catalog_products; DELETE FROM catalog_meta;');
    await db.runAsync('INSERT INTO catalog_meta (id, store_id, saved_at) VALUES (1, ?, ?)', [
      snapshot.storeId,
      snapshot.savedAt,
    ]);
    for (let index = 0; index < snapshot.products.length; index++) {
      const product = snapshot.products[index] as { id?: string } | undefined;
      const productId = product?.id ?? String(index);
      await db.runAsync('INSERT INTO catalog_products (product_id, data, sort_order) VALUES (?, ?, ?)', [
        productId,
        JSON.stringify(product),
        index,
      ]);
    }
  });
}

export async function offlineLoadCatalog(): Promise<CatalogSnapshot | null> {
  const db = await getDb();
  const meta = await db.getFirstAsync<{ store_id: number; saved_at: number }>(
    'SELECT store_id, saved_at FROM catalog_meta WHERE id = 1',
    []
  );
  if (!meta) return null;
  const rows = await db.getAllAsync<{ data: string }>('SELECT data FROM catalog_products ORDER BY sort_order ASC', []);
  return {
    storeId: meta.store_id,
    savedAt: meta.saved_at,
    products: rows.map((row) => JSON.parse(row.data)),
  };
}

/**
 * Applies a local stock deduction to the cached catalog snapshot after a sale
 * (recorded live or queued offline) so the on-disk snapshot never hands out
 * pre-sale counts on a later offline reload. Safe only because this store has
 * exactly one terminal — a single writer, no cross-register race to corrupt.
 * `savedAt` is left untouched.
 */
export async function offlineDecrementCatalogStock(
  storeId: number,
  items: { productId: string; quantity: number }[]
): Promise<void> {
  const db = await getDb();
  const meta = await db.getFirstAsync<{ store_id: number }>('SELECT store_id FROM catalog_meta WHERE id = 1', []);
  if (!meta || meta.store_id !== storeId) return;

  await db.withTransactionAsync(async () => {
    for (const item of items) {
      const row = await db.getFirstAsync<{ data: string }>('SELECT data FROM catalog_products WHERE product_id = ?', [
        item.productId,
      ]);
      if (!row) continue;
      const record = JSON.parse(row.data) as { stock?: unknown };
      if (typeof record.stock !== 'number') continue;
      record.stock = Math.max(0, record.stock - item.quantity);
      await db.runAsync('UPDATE catalog_products SET data = ? WHERE product_id = ?', [
        JSON.stringify(record),
        item.productId,
      ]);
    }
  });
}

// ---------------------------------------------------------------------------
// Cached customers (capped roster for offline customer picking)
// ---------------------------------------------------------------------------

const MAX_CACHED_CUSTOMERS = 50;

export async function offlineUpsertCustomers(customers: CachedCustomer[]): Promise<void> {
  const db = await getDb();
  const existingRows = await db.getAllAsync<{ data: string }>('SELECT data FROM cached_customers ORDER BY position ASC', []);
  const existing = existingRows.map((row) => JSON.parse(row.data) as CachedCustomer);

  const merged: CachedCustomer[] = [];
  const seen = new Set<number>();
  for (const customer of [...customers.filter((c) => c.id > 0), ...existing]) {
    if (seen.has(customer.id)) continue;
    seen.add(customer.id);
    merged.push(customer);
  }
  const capped = merged.slice(0, MAX_CACHED_CUSTOMERS);

  await db.withTransactionAsync(async () => {
    await db.execAsync('DELETE FROM cached_customers;');
    for (let index = 0; index < capped.length; index++) {
      await db.runAsync('INSERT INTO cached_customers (id, data, position) VALUES (?, ?, ?)', [
        capped[index].id,
        JSON.stringify(capped[index]),
        index,
      ]);
    }
  });
}

export async function offlineListCachedCustomers(): Promise<CachedCustomer[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ data: string }>('SELECT data FROM cached_customers ORDER BY position ASC', []);
  return rows.map((row) => JSON.parse(row.data));
}

// ---------------------------------------------------------------------------
// Shift state (single active shift per device, singleton row id=1)
// ---------------------------------------------------------------------------

export async function offlineSaveShiftState(state: LocalShiftState): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT OR REPLACE INTO shift_state (id, store_id, register, data) VALUES (1, ?, ?, ?)', [
    state.storeId,
    state.register,
    JSON.stringify(state),
  ]);
}

export async function offlineLoadShiftState(storeId: number, register: string): Promise<LocalShiftState | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ store_id: number; register: string; data: string }>(
    'SELECT store_id, register, data FROM shift_state WHERE id = 1',
    []
  );
  if (!row || row.store_id !== storeId || row.register !== register) return null;
  return JSON.parse(row.data);
}

export async function offlineClearShiftState(storeId: number, register: string): Promise<void> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ store_id: number; register: string }>(
    'SELECT store_id, register FROM shift_state WHERE id = 1',
    []
  );
  if (!row || row.store_id !== storeId || row.register !== register) return;
  await db.runAsync('DELETE FROM shift_state WHERE id = 1', []);
}

export async function offlineAddSyncedSale(storeId: number, register: string, sale: SyncedSaleRecord): Promise<void> {
  const state = await offlineLoadShiftState(storeId, register);
  if (!state) return;
  const syncedSales = state.syncedSales ?? [];
  const next = syncedSales.some((s) => s.saleId === sale.saleId)
    ? syncedSales.map((s) => (s.saleId === sale.saleId ? sale : s))
    : [...syncedSales, sale];
  await offlineSaveShiftState({ ...state, syncedSales: next });
}

// ---------------------------------------------------------------------------
// Pending cash movements
// ---------------------------------------------------------------------------

export async function offlineEnqueueCashMovement(record: {
  id: string;
  clientShiftId: string;
  cashierId: string;
  payload: Record<string, unknown>;
  createdAt: number;
}): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR IGNORE INTO pending_cash_movements (id, client_shift_id, cashier_id, payload, created_at, attempts) VALUES (?, ?, ?, ?, ?, 0)',
    [record.id, record.clientShiftId, record.cashierId, JSON.stringify(record.payload), record.createdAt]
  );
}

export async function offlineListPendingCashMovements(): Promise<PendingCashMovementRecord[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<PendingCashMovementRow>('SELECT * FROM pending_cash_movements ORDER BY created_at ASC', []);
  return rows.map(rowToPendingCashMovement);
}

export async function offlineRemovePendingCashMovement(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM pending_cash_movements WHERE id = ?', [id]);
}

// ---------------------------------------------------------------------------
// Pending voids
// ---------------------------------------------------------------------------

export async function offlineEnqueueVoid(record: {
  id: string;
  originalSaleId: number;
  reason: string | null;
  approvedByManagerId: string;
  cashierId: string;
  createdAt: number;
}): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR IGNORE INTO pending_voids (id, original_sale_id, reason, approved_by_manager_id, cashier_id, created_at, attempts) VALUES (?, ?, ?, ?, ?, ?, 0)',
    [record.id, record.originalSaleId, record.reason, record.approvedByManagerId, record.cashierId, record.createdAt]
  );
}

export async function offlineListPendingVoids(): Promise<PendingVoidRecord[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<PendingVoidRow>('SELECT * FROM pending_voids ORDER BY created_at ASC', []);
  return rows.map(rowToPendingVoid);
}

export async function offlineRemovePendingVoid(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM pending_voids WHERE id = ?', [id]);
}

// ---------------------------------------------------------------------------
// Cached promoters (per-store roster, refreshed whenever online so a promoter
// id can still be validated for real while offline instead of blindly accepted)
// ---------------------------------------------------------------------------

export async function offlineCachePromoters(storeId: number, promoters: CachedPromoter[]): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM cached_promoters WHERE store_id = ?', [storeId]);
    for (const promoter of promoters) {
      await db.runAsync('INSERT OR REPLACE INTO cached_promoters (store_id, user_id, name, email) VALUES (?, ?, ?, ?)', [
        storeId,
        promoter.userId,
        promoter.name,
        promoter.email ?? null,
      ]);
    }
  });
}

/**
 * Returns `undefined` when the cache has nothing for this store at all —
 * distinct from `null` ("not found in a populated cache") — so the caller can
 * fall back to blind-accept only when there's truly nothing to check against.
 */
export async function offlineFindCachedPromoter(
  storeId: number,
  identifier: string
): Promise<CachedPromoter | null | undefined> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ user_id: string; name: string; email: string | null }>(
    'SELECT user_id, name, email FROM cached_promoters WHERE store_id = ?',
    [storeId]
  );
  if (rows.length === 0) return undefined;
  const id = identifier.trim().toLowerCase();
  const match = rows.find((row) => row.user_id.toLowerCase() === id || (row.email ?? '').toLowerCase() === id);
  if (!match) return null;
  return { userId: match.user_id, name: match.name, email: match.email };
}

export async function offlineListCachedPromoters(storeId: number): Promise<CachedPromoter[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ user_id: string; name: string; email: string | null }>(
    'SELECT user_id, name, email FROM cached_promoters WHERE store_id = ? ORDER BY name ASC',
    [storeId]
  );
  return rows.map((row) => ({ userId: row.user_id, name: row.name, email: row.email }));
}

// ---------------------------------------------------------------------------
// Pending floating-stock punch out/in — an audit-log action, no offline cache
// needed beyond the queue itself: losing this queue only delays a convenience
// log, not real stock data.
// ---------------------------------------------------------------------------

export async function offlineEnqueueFloatingStockEvent(record: {
  id: string;
  action: 'OUT' | 'IN';
  payload: Record<string, unknown>;
  createdAt: number;
}): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR IGNORE INTO pending_floating_stock_events (id, action, payload, created_at, attempts) VALUES (?, ?, ?, ?, 0)',
    [record.id, record.action, JSON.stringify(record.payload), record.createdAt]
  );
}

export async function offlineListPendingFloatingStockEvents(): Promise<PendingFloatingStockEvent[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<PendingFloatingStockEventRow>(
    'SELECT * FROM pending_floating_stock_events ORDER BY created_at ASC',
    []
  );
  return rows.map(rowToPendingFloatingStockEvent);
}

export async function offlineRemovePendingFloatingStockEvent(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM pending_floating_stock_events WHERE id = ?', [id]);
}
