/**
 * Ported from the desktop's src/electron/offlineAuthCache.test.ts. The desktop test exercises
 * exported pure helpers (parseOfflineAuthCacheFile, findOfflineAuthEntry, checkOfflineAuthLockout,
 * nextLockoutStateAfterFailure) directly — this port's offlineAuthStore.ts keeps that logic private
 * (no legacy single-record migration needed on a greenfield app either), so the same behavior is
 * exercised through the public save/verify API instead, against a mocked expo-secure-store.
 */
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
  };
});

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA256' },
  digestStringAsync: jest.fn(async (_algorithm: string, data: string) => {
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      hash = (hash * 31 + data.charCodeAt(i)) | 0;
    }
    return `h${hash}`;
  }),
  getRandomBytesAsync: jest.fn(async (size: number) => new Uint8Array(size).fill(7)),
}));

import {
  saveOfflineAuthCredentials,
  verifyOfflineAuthCredentials,
  clearOfflineAuthCredentials,
  OFFLINE_AUTH_MAX_FAILED_ATTEMPTS,
} from './offlineAuthStore';

const BASE_NOW = 1_700_000_000_000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const FIFTEEN_MIN_MS = 15 * 60 * 1000;

async function seedManager(now: number) {
  jest.spyOn(Date, 'now').mockReturnValue(now);
  await saveOfflineAuthCredentials({
    email: 'Manager@Honor.PH',
    userId: '42',
    name: 'Manager One',
    roles: ['OIC'],
    role: 'admin',
    is_sales_person: true,
    password: 'correct-pw',
  });
}

beforeEach(async () => {
  jest.restoreAllMocks();
  await clearOfflineAuthCredentials();
});

describe('verifyOfflineAuthCredentials', () => {
  it('returns not_found when nothing has been cached', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(BASE_NOW);
    const result = await verifyOfflineAuthCredentials({ identifier: 'nobody@honor.ph', password: 'pw' });
    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });

  it('matches the cached entry by email, case-insensitively', async () => {
    await seedManager(BASE_NOW);
    const result = await verifyOfflineAuthCredentials({ identifier: 'MANAGER@honor.ph', password: 'correct-pw' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.profile.userId).toBe('42');
  });

  it('matches the cached entry by userId', async () => {
    await seedManager(BASE_NOW);
    const result = await verifyOfflineAuthCredentials({ identifier: '42', password: 'correct-pw' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.profile.email).toBe('manager@honor.ph');
  });

  it('rejects a wrong password as invalid', async () => {
    await seedManager(BASE_NOW);
    const result = await verifyOfflineAuthCredentials({ identifier: 'manager@honor.ph', password: 'wrong-pw' });
    expect(result).toMatchObject({ ok: false, reason: 'invalid' });
  });

  it('is not expired within the 7-day window', async () => {
    await seedManager(BASE_NOW);
    jest.spyOn(Date, 'now').mockReturnValue(BASE_NOW + SEVEN_DAYS_MS - 1);
    const result = await verifyOfflineAuthCredentials({ identifier: 'manager@honor.ph', password: 'correct-pw' });
    expect(result.ok).toBe(true);
  });

  it('is expired past the 7-day window', async () => {
    await seedManager(BASE_NOW);
    jest.spyOn(Date, 'now').mockReturnValue(BASE_NOW + SEVEN_DAYS_MS + 1);
    const result = await verifyOfflineAuthCredentials({ identifier: 'manager@honor.ph', password: 'correct-pw' });
    expect(result).toEqual({ ok: false, reason: 'expired' });
  });

  it('locks the account after the max number of failed attempts', async () => {
    await seedManager(BASE_NOW);
    let last;
    for (let i = 0; i < OFFLINE_AUTH_MAX_FAILED_ATTEMPTS; i++) {
      last = await verifyOfflineAuthCredentials({ identifier: 'manager@honor.ph', password: 'wrong-pw' });
    }
    expect(last).toMatchObject({ ok: false, reason: 'locked' });
    if (last && !last.ok && last.reason === 'locked') {
      expect(last.retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  it('stays locked until the lockout window passes, then allows a fresh attempt', async () => {
    await seedManager(BASE_NOW);
    for (let i = 0; i < OFFLINE_AUTH_MAX_FAILED_ATTEMPTS; i++) {
      await verifyOfflineAuthCredentials({ identifier: 'manager@honor.ph', password: 'wrong-pw' });
    }

    jest.spyOn(Date, 'now').mockReturnValue(BASE_NOW + FIFTEEN_MIN_MS - 1);
    const stillLocked = await verifyOfflineAuthCredentials({ identifier: 'manager@honor.ph', password: 'correct-pw' });
    expect(stillLocked).toMatchObject({ ok: false, reason: 'locked' });

    jest.spyOn(Date, 'now').mockReturnValue(BASE_NOW + FIFTEEN_MIN_MS + 1);
    const unlocked = await verifyOfflineAuthCredentials({ identifier: 'manager@honor.ph', password: 'correct-pw' });
    expect(unlocked.ok).toBe(true);
  });
});
