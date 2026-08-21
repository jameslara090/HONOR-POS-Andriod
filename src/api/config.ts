/**
 * API base URL + auth token storage. Ported from the desktop's src/ui/api/config.ts.
 *
 * Desktop persisted these via localStorage (base URL override) and Electron's
 * safeStorage-backed main process (token). On Android there is no synchronous
 * persistent storage, so both are cached in memory and backed by
 * expo-secure-store (Android Keystore-encrypted). Call `initApiConfig()` once
 * at app startup, before rendering anything that reads these — see app/_layout.tsx.
 */
import * as SecureStore from 'expo-secure-store';

const ENV_URL = (process.env.EXPO_PUBLIC_API_BASE_URL ?? '').trim().replace(/\/$/, '');
const DEFAULT_API_BASE_URL = ENV_URL;

const API_BASE_URL_OVERRIDE_KEY = 'pos_api_base_url_override';
export const API_TOKEN_KEY = 'pos_api_token';

function normalizeApiBaseUrl(url: string): string {
  return url.trim().replace(/\/$/, '');
}

/**
 * Approved API hosts for retail builds.
 *
 * - Local dev: localhost / 127.0.0.1 (any port)
 * - Production: Hostinger IP and domain
 */
const ALLOWED_API_HOSTS = new Set<string>([
  'localhost',
  '127.0.0.1',
  '76.13.17.18',
  'honor-pos.itcom880.com',
]);

const API_RECOVERY_PIN = (process.env.EXPO_PUBLIC_API_RECOVERY_PIN ?? '').trim();
const ALLOW_INSECURE_HTTP = (process.env.EXPO_PUBLIC_ALLOW_INSECURE_POS_API_HTTP ?? '').trim() === '1';

/**
 * Temporary exception: production is still served over HTTP for this host.
 * Keep this list as small as possible.
 */
const PROD_INSECURE_HTTP_ALLOW_HOSTS = new Set<string>(['honor-pos.itcom880.com']);

export function isApiRecoveryPinConfigured(): boolean {
  return !!API_RECOVERY_PIN;
}

export function isValidApiRecoveryPin(pin: string): boolean {
  return !!API_RECOVERY_PIN && pin.trim() === API_RECOVERY_PIN;
}

export function isAllowedApiBaseUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const protocolOk = u.protocol === 'http:' || u.protocol === 'https:';
    if (!protocolOk) return false;

    const host = u.hostname.toLowerCase();
    return ALLOWED_API_HOSTS.has(host);
  } catch {
    return false;
  }
}

export function requiresHttpsForApiBaseUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const isLocal = host === 'localhost' || host === '127.0.0.1';
    if (isLocal) return false;
    if (__DEV__) return false;
    return true;
  } catch {
    return false;
  }
}

export function isInsecureHttpBlockedForApiBaseUrl(url: string): boolean {
  try {
    if (!requiresHttpsForApiBaseUrl(url)) return false;
    if (ALLOW_INSECURE_HTTP) return false;
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (!__DEV__ && PROD_INSECURE_HTTP_ALLOW_HOSTS.has(host)) {
      return false;
    }
    return u.protocol === 'http:';
  } catch {
    return false;
  }
}

let cachedBaseUrlOverride: string | null = null;
let cachedApiToken: string | null = null;
let initialized = false;

/** Must be awaited once at app startup before any of the sync getters below are used. */
export async function initApiConfig(): Promise<void> {
  if (initialized) return;
  const [override, token] = await Promise.all([
    SecureStore.getItemAsync(API_BASE_URL_OVERRIDE_KEY),
    SecureStore.getItemAsync(API_TOKEN_KEY),
  ]);
  cachedBaseUrlOverride = override;
  cachedApiToken = token;
  initialized = true;
}

export function getApiBaseUrl(): string {
  if (cachedBaseUrlOverride) return normalizeApiBaseUrl(cachedBaseUrlOverride);
  return DEFAULT_API_BASE_URL;
}

export function setApiBaseUrlOverride(url: string): { changed: boolean; baseUrl: string } {
  const next = normalizeApiBaseUrl(url);
  const previous = getApiBaseUrl();
  cachedBaseUrlOverride = next || null;
  if (next) {
    void SecureStore.setItemAsync(API_BASE_URL_OVERRIDE_KEY, next);
  } else {
    void SecureStore.deleteItemAsync(API_BASE_URL_OVERRIDE_KEY);
  }
  const baseUrl = getApiBaseUrl();
  return { changed: previous !== baseUrl, baseUrl };
}

export function getApiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${getApiBaseUrl()}${p}`;
}

export function getApiToken(): string | null {
  return cachedApiToken;
}

export function setApiToken(token: string): void {
  cachedApiToken = token;
  void SecureStore.setItemAsync(API_TOKEN_KEY, token);
}

export function removeApiToken(): void {
  cachedApiToken = null;
  void SecureStore.deleteItemAsync(API_TOKEN_KEY);
}
