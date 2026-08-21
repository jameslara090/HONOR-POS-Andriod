/**
 * Authentication Service for validating admin users, backed by the pos-react API.
 * Ported from the desktop's src/ui/services/authService.ts — window.electron offline-auth
 * calls are replaced by offlineAuthStore (expo-secure-store instead of an Electron main process).
 */
import * as SecureStore from 'expo-secure-store';
import { apiLogin, apiGetUser, apiLogout, getAuthToken, setAuthToken, removeAuthToken } from './apiService';
import {
  saveOfflineAuthCredentials,
  verifyOfflineAuthCredentials,
} from './offlineAuthStore';

export interface AdminUser {
  id: string;
  email: string;
  password?: string; // Not stored after API authentication
  name: string;
  roles: string[];
  role: 'admin' | 'cashier' | 'user';
  is_sales_person?: boolean;
  totpSecret?: string; // TOTP secret for Google Authenticator (optional, set during setup)
}

type OfflineLoginResult = { user: AdminUser | null; error: string | null };

const getApiUserId = (user: any): string | null => {
  const raw = user?.user_id ?? user?.id;
  if (raw === undefined || raw === null) return null;
  const normalized = String(raw).trim();
  return normalized ? normalized : null;
};

const looksLikeConnectivityError = (message: string): boolean =>
  /cannot connect|network error|failed to fetch|network request failed|server is running|fetch/i.test(message);

// Store TOTP secrets locally, keyed by email — same in-memory Map the desktop
// uses (it never persists these to a backend; see the setup screen's dormant
// GoogleAuthenticatorSetup.tsx upstream). Backed by SecureStore here so
// "enabling" 2FA survives an app restart instead of silently resetting —
// initTotpSecrets() must be awaited once at startup (see app/_layout.tsx).
const totpSecrets: Map<string, string> = new Map();
const TOTP_SECRETS_KEY = 'pos_totp_secrets';

export async function initTotpSecrets(): Promise<void> {
  try {
    const raw = await SecureStore.getItemAsync(TOTP_SECRETS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, string>;
    for (const [email, secret] of Object.entries(parsed)) totpSecrets.set(email, secret);
  } catch {
    // ignore corrupt/missing cache — 2FA setup just needs to be redone
  }
}

function persistTotpSecrets(): void {
  void SecureStore.setItemAsync(TOTP_SECRETS_KEY, JSON.stringify(Object.fromEntries(totpSecrets)));
}

/**
 * Validate admin credentials against pos-react API
 */
export async function validateAdminCredentials(
  identifier: string,
  password: string
): Promise<{ user: AdminUser | null; error: string | null; lockoutSeconds?: number; attemptsRemaining?: number; posAccessDenied?: boolean }> {
  try {
    const response = await apiLogin(identifier, password);

    if (!response.success) {
      const errorMessage = response.message || 'Invalid email or password. Please try again.';
      return {
        user: null,
        error: errorMessage,
        lockoutSeconds: response.locked_out ? (response.retry_after ?? 0) : undefined,
        attemptsRemaining: response.attempts_remaining,
        posAccessDenied: response.pos_access_denied,
      };
    }

    if (!response.data) {
      return { user: null, error: 'Invalid response from server. Please try again.' };
    }

    const { user } = response.data;

    if (!user) {
      return { user: null, error: 'User data not found in response. Please try again.' };
    }

    const userRes = await apiGetUser();
    const roles = userRes.success && userRes.data ? (userRes.data.roles ?? []) : [];
    const isAdmin = roles.includes('Admin') || roles.includes('Super Admin');

    const userId = getApiUserId(user);
    if (!userId) {
      return { user: null, error: 'User ID (user_id) is missing from server response.' };
    }

    return {
      user: {
        id: userId,
        email: user.email,
        name: user.name,
        roles,
        role: isAdmin ? 'admin' : 'cashier',
        is_sales_person: user.is_sales_person ?? true,
      },
      error: null,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Network error occurred. Please check your connection.';
    console.error('Authentication error:', error);
    return { user: null, error: errorMessage };
  }
}

export function shouldOfferOfflineLogin(errorMessage: string | null | undefined): boolean {
  return !!errorMessage && looksLikeConnectivityError(errorMessage);
}

export async function cacheOfflineCredentials(user: AdminUser, email: string, password: string): Promise<void> {
  await saveOfflineAuthCredentials({
    email: email.toLowerCase().trim(),
    userId: user.id,
    name: user.name,
    roles: user.roles,
    role: user.role,
    is_sales_person: user.is_sales_person ?? true,
    password,
  });
}

function offlineVerifyFailureMessage(result: { reason: string; retryAfterSeconds?: number }): string {
  switch (result.reason) {
    case 'expired':
      return 'Reconnect to refresh this account’s offline credentials.';
    case 'locked': {
      const minutes = Math.max(1, Math.ceil((result.retryAfterSeconds ?? 0) / 60));
      return `Too many attempts — try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
    }
    case 'not_found':
    case 'invalid':
    default:
      return 'No saved offline account matched those credentials. Connect to the internet and sign in once first.';
  }
}

export async function tryOfflineCredentialLogin(identifier: string, password: string): Promise<OfflineLoginResult> {
  const result = await verifyOfflineAuthCredentials({ identifier: identifier.trim(), password });

  if (!result.ok) {
    return { user: null, error: offlineVerifyFailureMessage(result) };
  }

  const profile = result.profile;

  if (profile.is_sales_person === false) {
    return {
      user: null,
      error: 'This account is not authorized to access the Point of Sale.',
    };
  }

  return {
    user: {
      id: profile.userId,
      email: profile.email,
      name: profile.name,
      roles: profile.roles,
      role: profile.role,
      is_sales_person: profile.is_sales_person ?? true,
    },
    error: null,
  };
}

/**
 * Get admin user by email from API
 */
export async function getAdminByEmail(email: string): Promise<AdminUser | null> {
  const token = getAuthToken();
  if (!token) {
    return null;
  }

  try {
    const response = await apiGetUser();
    if (response.success && response.data) {
      const { user, roles: dataRoles } = response.data;
      const roles = dataRoles ?? [];
      const isAdmin = roles.includes('Admin') || roles.includes('Super Admin');
      if (user.email.toLowerCase() === email.toLowerCase().trim()) {
        const userId = getApiUserId(user);
        if (!userId) return null;
        return {
          id: userId,
          email: user.email,
          name: user.name,
          roles,
          role: isAdmin ? 'admin' : 'cashier',
        };
      }
    }
    return null;
  } catch (error) {
    console.error('Error fetching user:', error);
    return null;
  }
}

/**
 * Validate Admin / Super Admin / OIC credentials for manager-only flows (e.g. discount approval)
 * without replacing the cashier's session token. When `allowOffline` is true and the live call
 * fails on what looks like a connectivity error, falls back to this device's cached manager
 * credentials (see `cacheOfflineCredentials`).
 */
export async function verifyManagerCredentials(
  email: string,
  password: string,
  allowOffline: boolean = false
): Promise<{ ok: boolean; message?: string; name?: string; userId?: string | null; managerToken?: string; offline?: boolean }> {
  const previousToken = getAuthToken();

  try {
    const loginRes = await apiLogin(email, password);
    if (!loginRes.success || !loginRes.data?.token) {
      const message = loginRes.message || 'Invalid credentials.';
      if (allowOffline && looksLikeConnectivityError(message)) {
        return verifyManagerCredentialsOffline(email, password);
      }
      return { ok: false, message };
    }

    const managerName = loginRes.data.user?.name ?? email;
    const managerId = getApiUserId(loginRes.data.user);
    const managerEmail = loginRes.data.user?.email ?? email;

    const meRes = await apiGetUser();
    const roles = meRes.success && meRes.data ? (meRes.data.roles ?? []) : [];
    const isManager = roles.includes('Admin') || roles.includes('Super Admin') || roles.includes('OIC');
    if (!isManager) {
      return { ok: false, message: 'Manager, Admin, or OIC account required.' };
    }

    const managerToken = getAuthToken() ?? undefined;

    void cacheOfflineCredentials(
      {
        id: String(managerId ?? email),
        email: managerEmail,
        name: managerName,
        roles,
        role: roles.includes('Admin') || roles.includes('Super Admin') ? 'admin' : 'cashier',
      },
      managerEmail,
      password
    ).catch((err) => console.error('Failed to cache manager credentials for offline approval', err));

    return { ok: true, name: managerName, userId: managerId, managerToken };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to verify manager credentials.';
    if (allowOffline && looksLikeConnectivityError(message)) {
      return verifyManagerCredentialsOffline(email, password);
    }
    return { ok: false, message };
  } finally {
    if (previousToken) {
      setAuthToken(previousToken);
    } else {
      removeAuthToken();
    }
  }
}

async function verifyManagerCredentialsOffline(
  email: string,
  password: string
): Promise<{ ok: boolean; message?: string; name?: string; userId?: string | null; offline?: boolean }> {
  const result = await verifyOfflineAuthCredentials({ identifier: email.trim(), password });

  if (!result.ok) {
    return { ok: false, message: offlineVerifyFailureMessage(result) };
  }

  const { profile } = result;
  const isManager = profile.roles.includes('Admin') || profile.roles.includes('Super Admin') || profile.roles.includes('OIC');
  if (!isManager) {
    return { ok: false, message: 'Manager, Admin, or OIC account required.' };
  }

  return { ok: true, name: profile.name, userId: profile.userId, offline: true };
}

/** Validate Super Admin credentials without switching the current logged-in session. */
export async function verifySuperAdminCredentials(email: string, password: string): Promise<{ ok: boolean; message?: string }> {
  const previousToken = getAuthToken();

  try {
    const loginRes = await apiLogin(email, password);
    if (!loginRes.success || !loginRes.data?.token) {
      return { ok: false, message: loginRes.message || 'Invalid credentials.' };
    }

    const meRes = await apiGetUser();
    const roles = meRes.success && meRes.data ? (meRes.data.roles ?? []) : [];
    if (!roles.includes('Super Admin')) {
      return { ok: false, message: 'Super Admin account required.' };
    }

    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Failed to verify Super Admin credentials.' };
  } finally {
    if (previousToken) {
      setAuthToken(previousToken);
    } else {
      removeAuthToken();
    }
  }
}

export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

export function setTOTPSecret(email: string, secret: string): void {
  totpSecrets.set(email.toLowerCase().trim(), secret);
  persistTotpSecrets();
}

/** Turns off Google Authenticator for this account on this device. */
export function clearTOTPSecret(email: string): void {
  totpSecrets.delete(email.toLowerCase().trim());
  persistTotpSecrets();
}

export function hasTOTPEnabled(email: string): boolean {
  return totpSecrets.has(email.toLowerCase().trim());
}

export function getTOTPSecret(email: string): string | undefined {
  return totpSecrets.get(email.toLowerCase().trim());
}

/**
 * Logout and clear authentication
 */
export async function logout(): Promise<void> {
  try {
    await apiLogout();
  } catch (error) {
    console.error('Logout error:', error);
  } finally {
    removeAuthToken();
    // Not clearing totpSecrets here (desktop does): entries are keyed by email
    // and durably persisted (see initTotpSecrets), so wiping the in-memory
    // cache on every logout would just force the next login for the SAME user
    // in this same app session to redo 2FA setup, with no privacy benefit —
    // a different user's login only ever reads their own email's entry.
  }
}
