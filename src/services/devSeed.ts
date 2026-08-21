/**
 * Dev-only local test accounts — lets you exercise every role-gated UI path
 * (Settings hidden for a pure Cashier, manager bypass for OIC/Admin/Super
 * Admin on discount/void approval, the Super Admin-only API URL gate in
 * SettingsModal) without a reachable backend.
 *
 * These do NOT live in the SQLite offline store (that's sales/catalog/shift
 * queues — see offlineStore.ts) — they're written straight into the same
 * expo-secure-store-backed cache a real online login populates
 * (offlineAuthStore.ts), keyed by email. Login still tries the real backend
 * first; it only falls back to this cache when that call fails in a
 * connectivity-shaped way (see shouldOfferOfflineLogin in authService.ts) —
 * which is exactly what happens with no backend configured/reachable.
 */
import { saveOfflineAuthCredentials } from './offlineAuthStore';

export interface DevTestAccount {
  label: string;
  email: string;
  password: string;
  userId: string;
  name: string;
  role: 'admin' | 'cashier';
  roles: string[];
}

export const DEV_TEST_ACCOUNTS: DevTestAccount[] = [
  { label: 'Cashier', email: 'cashier@test.local', password: 'test1234', userId: 'CASHIER1', name: 'Cara Cashier', role: 'cashier', roles: ['Cashier'] },
  { label: 'OIC', email: 'oic@test.local', password: 'test1234', userId: 'OIC1', name: 'Oscar OIC', role: 'cashier', roles: ['OIC'] },
  { label: 'Admin', email: 'admin@test.local', password: 'test1234', userId: 'ADMIN1', name: 'Ada Admin', role: 'admin', roles: ['Admin'] },
  { label: 'Super Admin', email: 'superadmin@test.local', password: 'test1234', userId: 'SUPERADMIN1', name: 'Sam Super', role: 'admin', roles: ['Admin', 'Super Admin'] },
];

/** Writes all four test accounts into the offline-auth cache. Safe to call more than once. */
export async function seedDevTestAccounts(): Promise<void> {
  for (const account of DEV_TEST_ACCOUNTS) {
    await saveOfflineAuthCredentials({
      email: account.email,
      userId: account.userId,
      name: account.name,
      roles: account.roles,
      role: account.role,
      is_sales_person: true,
      password: account.password,
    });
  }
}
