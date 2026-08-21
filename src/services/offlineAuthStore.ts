/**
 * Offline auth credential cache — lets a cashier/manager log in without a live
 * server connection, using a password proven once online.
 *
 * Ported from the desktop's main-process file (src/electron/offlineAuthCache.ts +
 * the saveOfflineAuthCredentials/verifyOfflineAuthCredentials IPC handlers in
 * src/electron/main.ts). Desktop hashed with Node's scrypt and stored the file
 * safeStorage-encrypted on disk; there is no main process here, so this stores
 * the same JSON shape directly in expo-secure-store (Android Keystore-encrypted)
 * and hashes with an iterated, salted expo-crypto SHA-256 in place of scrypt —
 * see AGENTS.md plan section 4.5.
 */
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import {
  parseSaveOfflineAuthCredentialsRequest,
  parseVerifyOfflineAuthCredentialsRequest,
  parseOfflineVerifyResult,
  type OfflineAuthUserProfile,
  type OfflineVerifyResult,
  type SaveOfflineAuthCredentialsRequest,
  type VerifyOfflineAuthCredentialsRequest,
} from '../shared/schemas';

export type OfflineAuthCacheRecord = {
  email: string;
  userId: string;
  name: string;
  roles: string[];
  role: 'admin' | 'cashier' | 'user';
  is_sales_person?: boolean;
  savedAt: number;
  passwordSalt: string;
  passwordHash: string;
};

export type OfflineAuthLockoutState = {
  failedAttempts: number;
  lockedUntil: number | null;
};

export type OfflineAuthCacheFile = {
  entries: Record<string, OfflineAuthCacheRecord>;
  lockouts: Record<string, OfflineAuthLockoutState>;
};

export const OFFLINE_AUTH_CACHE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
export const OFFLINE_AUTH_MAX_FAILED_ATTEMPTS = 5;
export const OFFLINE_AUTH_LOCKOUT_MS = 15 * 60 * 1000;
export const OFFLINE_AUTH_LOCKOUT_RESET: OfflineAuthLockoutState = { failedAttempts: 0, lockedUntil: null };

const CACHE_KEY = 'pos_offline_auth_cache';
const HASH_ITERATIONS = 1000;

async function hashOfflinePassword(password: string, saltHex: string): Promise<string> {
  let value = `${saltHex}:${password}`;
  for (let i = 0; i < HASH_ITERATIONS; i++) {
    value = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);
  }
  return value;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function readCacheFile(): Promise<OfflineAuthCacheFile> {
  try {
    const raw = await SecureStore.getItemAsync(CACHE_KEY);
    if (!raw) return { entries: {}, lockouts: {} };
    const parsed = JSON.parse(raw) as Partial<OfflineAuthCacheFile>;
    return {
      entries: parsed.entries ?? {},
      lockouts: parsed.lockouts ?? {},
    };
  } catch {
    return { entries: {}, lockouts: {} };
  }
}

async function writeCacheFile(file: OfflineAuthCacheFile): Promise<void> {
  await SecureStore.setItemAsync(CACHE_KEY, JSON.stringify(file));
}

/** Finds a cached entry by email or POS user_id, case-insensitively. */
function findEntry(
  file: OfflineAuthCacheFile,
  identifier: string
): { key: string; record: OfflineAuthCacheRecord } | null {
  const id = identifier.trim().toLowerCase();
  for (const [key, record] of Object.entries(file.entries)) {
    if (record.email.toLowerCase() === id || record.userId.toLowerCase() === id) {
      return { key, record };
    }
  }
  return null;
}

function isEntryExpired(record: OfflineAuthCacheRecord, now: number): boolean {
  return now - record.savedAt > OFFLINE_AUTH_CACHE_EXPIRY_MS;
}

type LockoutCheck = { locked: false } | { locked: true; retryAfterSeconds: number };

function checkLockout(lockout: OfflineAuthLockoutState | undefined, now: number): LockoutCheck {
  if (!lockout?.lockedUntil || lockout.lockedUntil <= now) return { locked: false };
  return { locked: true, retryAfterSeconds: Math.ceil((lockout.lockedUntil - now) / 1000) };
}

function nextLockoutStateAfterFailure(lockout: OfflineAuthLockoutState | undefined, now: number): OfflineAuthLockoutState {
  const failedAttempts = (lockout?.failedAttempts ?? 0) + 1;
  const lockedUntil = failedAttempts >= OFFLINE_AUTH_MAX_FAILED_ATTEMPTS ? now + OFFLINE_AUTH_LOCKOUT_MS : null;
  return { failedAttempts, lockedUntil };
}

function toProfile(record: OfflineAuthCacheRecord): OfflineAuthUserProfile {
  return {
    email: record.email,
    userId: record.userId,
    name: record.name,
    roles: record.roles,
    role: record.role,
    is_sales_person: record.is_sales_person,
    savedAt: record.savedAt,
  };
}

/** Caches this device's local proof of a successful online login, for later offline use. */
export async function saveOfflineAuthCredentials(payload: SaveOfflineAuthCredentialsRequest): Promise<void> {
  const req = parseSaveOfflineAuthCredentialsRequest(payload);
  const saltBytes = await Crypto.getRandomBytesAsync(16);
  const salt = Array.from(saltBytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  const hash = await hashOfflinePassword(req.password, salt);
  const key = req.email.toLowerCase().trim();

  const file = await readCacheFile();
  file.entries[key] = {
    email: key,
    userId: req.userId,
    name: req.name,
    roles: req.roles,
    role: req.role,
    is_sales_person: req.is_sales_person,
    savedAt: Date.now(),
    passwordSalt: salt,
    passwordHash: hash,
  };
  file.lockouts[key] = OFFLINE_AUTH_LOCKOUT_RESET;
  await writeCacheFile(file);
}

export async function verifyOfflineAuthCredentials(payload: VerifyOfflineAuthCredentialsRequest): Promise<OfflineVerifyResult> {
  const req = parseVerifyOfflineAuthCredentialsRequest(payload);
  const file = await readCacheFile();
  const found = findEntry(file, req.identifier);
  if (!found) {
    return parseOfflineVerifyResult({ ok: false, reason: 'not_found' });
  }
  const { key, record } = found;
  const now = Date.now();

  const lockoutCheck = checkLockout(file.lockouts[key], now);
  if (lockoutCheck.locked) {
    return parseOfflineVerifyResult({ ok: false, reason: 'locked', retryAfterSeconds: lockoutCheck.retryAfterSeconds });
  }

  if (isEntryExpired(record, now)) {
    return parseOfflineVerifyResult({ ok: false, reason: 'expired' });
  }

  const actual = await hashOfflinePassword(req.password, record.passwordSalt);
  const matches = constantTimeEqual(record.passwordHash, actual);

  if (!matches) {
    const nextLockout = nextLockoutStateAfterFailure(file.lockouts[key], now);
    file.lockouts[key] = nextLockout;
    await writeCacheFile(file);
    if (nextLockout.lockedUntil) {
      return parseOfflineVerifyResult({
        ok: false,
        reason: 'locked',
        retryAfterSeconds: Math.ceil((nextLockout.lockedUntil - now) / 1000),
      });
    }
    return parseOfflineVerifyResult({ ok: false, reason: 'invalid' });
  }

  file.lockouts[key] = OFFLINE_AUTH_LOCKOUT_RESET;
  await writeCacheFile(file);
  return parseOfflineVerifyResult({ ok: true, profile: toProfile(record) });
}

export async function getOfflineAuthUserProfile(): Promise<OfflineAuthUserProfile | null> {
  const file = await readCacheFile();
  const records = Object.values(file.entries);
  if (records.length === 0) return null;
  const latest = records.reduce((a, b) => (b.savedAt > a.savedAt ? b : a));
  return toProfile(latest);
}

export async function clearOfflineAuthCredentials(): Promise<void> {
  await SecureStore.deleteItemAsync(CACHE_KEY);
}
