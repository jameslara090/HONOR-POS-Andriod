import { useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import {
  validateAdminCredentials,
  cacheOfflineCredentials,
  shouldOfferOfflineLogin,
  tryOfflineCredentialLogin,
  hasTOTPEnabled,
  getTOTPSecret,
  logout,
} from '../services/authService';
import type { AdminUser } from '../services/authService';
import { apiGetUser, apiCheckLockout, apiCheckUser, getAuthToken, removeAuthToken } from '../services/apiService';
import { setApiBaseUrlOverride } from '../api/config';
import { verifySessionPin } from '../api/pos';

/** Idle time in background before the app requires the password again. */
const SESSION_IDLE_LOCK_MS = 5 * 60_000;
/** If the lock screen stays unattended this long, the session is fully signed out. */
const SESSION_LOCKED_FORCE_LOGOUT_MS = 3 * 60 * 60_000;

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(null);
  const [loginError, setLoginError] = useState<string | undefined>();
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  // Set when this session authenticated via the offline-credential path — that path
  // only proves a password against a local cache, it never obtains a real server
  // token. Every live call from this session keeps getting rejected with 401 until
  // a full logout/login gets a real token; the UI should remind the cashier of that.
  const [loggedInOffline, setLoggedInOffline] = useState(false);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  // Password verified but Google Authenticator hasn't been. Held out of
  // currentUser/isAuthenticated until TOTP succeeds, so the route guard in
  // app/_layout.tsx can't drop a partially-authenticated user into the POS.
  const [pendingUser, setPendingUser] = useState<AdminUser | null>(null);
  const [pendingPassword, setPendingPassword] = useState<string | null>(null);

  useEffect(() => {
    if (!loginError) return;
    const id = setTimeout(() => setLoginError(undefined), 10_000);
    return () => clearTimeout(id);
  }, [loginError]);

  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const id = setInterval(() => {
      setLockoutSeconds((s) => {
        if (s <= 1) {
          clearInterval(id);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [lockoutSeconds]);

  // Restore session on app start if a token exists
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = getAuthToken();
      if (!token) return;
      try {
        const response = await apiGetUser();
        if (cancelled) return;
        if (response.success && response.data) {
          const user = (response.data as any).user ?? response.data;
          const roles: string[] = (response.data as any).roles ?? [];
          const isAdmin = roles.includes('Admin') || roles.includes('Super Admin');
          const resolvedUserId = user?.user_id;
          if (resolvedUserId === undefined || resolvedUserId === null || String(resolvedUserId).trim() === '') {
            removeAuthToken();
            return;
          }
          setCurrentUser({
            id: String(resolvedUserId),
            email: user.email,
            name: user.name,
            roles,
            role: isAdmin ? 'admin' : 'cashier',
            is_sales_person: user.is_sales_person ?? true,
          });
          setIsAuthenticated(true);
        } else {
          removeAuthToken();
        }
      } catch {
        if (!cancelled) removeAuthToken();
      }
    })().finally(() => {
      if (!cancelled) setAuthChecking(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setIsAuthenticated(false);
      setIsLocked(false);
      setCurrentUser(null);
      setLoggedInOffline(false);
    }
  };

  // Lock the session after being backgrounded for SESSION_IDLE_LOCK_MS, and fully
  // sign out if the lock screen is left unattended for SESSION_LOCKED_FORCE_LOGOUT_MS.
  const backgroundedAtRef = useRef<number | null>(null);
  useEffect(() => {
    if (!isAuthenticated) return;
    const onChange = (state: AppStateStatus) => {
      if (state === 'background' || state === 'inactive') {
        backgroundedAtRef.current = Date.now();
        return;
      }
      if (state === 'active' && backgroundedAtRef.current !== null) {
        const elapsed = Date.now() - backgroundedAtRef.current;
        backgroundedAtRef.current = null;
        if (elapsed >= SESSION_IDLE_LOCK_MS) {
          setIsLocked(true);
        }
      }
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !isLocked) return;
    const timer = setTimeout(() => {
      void handleLogout();
    }, SESSION_LOCKED_FORCE_LOGOUT_MS);
    return () => clearTimeout(timer);
  }, [isAuthenticated, isLocked]);

  const handleLogin = async (identifier: string, password: string) => {
    setLoginError(undefined);
    try {
      const { user: adminUser, error, lockoutSeconds: lockSecs, attemptsRemaining: attRemaining, posAccessDenied } =
        await validateAdminCredentials(identifier, password);
      if (!adminUser) {
        const errorMsg = error || 'Invalid credentials. Please try again.';
        // Promoter accounts are blocked server-side — skip offline login entirely
        // to prevent a cached promoter from bypassing the restriction.
        if (posAccessDenied) {
          setLoginError(errorMsg);
          return;
        }
        if (lockSecs !== undefined && lockSecs > 0) {
          setLockoutSeconds(lockSecs);
          setAttemptsRemaining(null);
          setLoginError(errorMsg);
          return;
        }
        if (attRemaining !== undefined) setAttemptsRemaining(attRemaining);
        if (shouldOfferOfflineLogin(errorMsg)) {
          const offline = await tryOfflineCredentialLogin(identifier, password);
          if (offline.user) {
            setLoggedInOffline(true);
            if (hasTOTPEnabled(offline.user.email)) {
              setPendingUser(offline.user);
              setPendingPassword(password);
            } else {
              setCurrentUser(offline.user);
              setIsAuthenticated(true);
            }
            return;
          }
          setLoginError(offline.error || errorMsg);
          return;
        }
        setLoginError(errorMsg);
        return;
      }
      setAttemptsRemaining(null);
      setLoggedInOffline(false);
      if (hasTOTPEnabled(adminUser.email)) {
        setPendingUser(adminUser);
        setPendingPassword(password);
        return;
      }
      void cacheOfflineCredentials(adminUser, adminUser.email, password);
      setCurrentUser(adminUser);
      setIsAuthenticated(true);
    } catch (error) {
      console.error('Login error:', error);
      setLoginError(error instanceof Error ? error.message : 'An error occurred during login. Please try again.');
    }
  };

  /** Called once the TOTP screen accepts the code for `pendingUser`. */
  const completeTOTPVerification = () => {
    if (!pendingUser) return;
    void cacheOfflineCredentials(pendingUser, pendingUser.email, pendingPassword ?? '');
    setCurrentUser(pendingUser);
    setIsAuthenticated(true);
    setPendingUser(null);
    setPendingPassword(null);
  };

  /** Called when the cashier backs out of the TOTP screen — discards the token already issued. */
  const cancelTOTPVerification = async () => {
    setPendingUser(null);
    setPendingPassword(null);
    try {
      await logout();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  /**
   * Dismisses the lock screen — ported from the desktop's App.tsx handleUnlock/
   * unlockLocally. Only ever compares the entered ID against this same
   * already-authenticated user's own id, no password re-entry — a value
   * already held in memory as currentUser.id. verifySessionPin is a live
   * server check (so a locked-out/disabled account can't self-unlock even
   * with the right ID); when it can't reach a real verdict (network failure,
   * or no valid token because this session logged in fully offline) that's
   * not a real "wrong ID" rejection, so it falls back to the local compare.
   */
  const unlock = async (userId: string): Promise<{ success: boolean; message?: string }> => {
    if (!currentUser) return { success: false, message: 'No active session.' };
    const unlockLocally = (): { success: boolean; message?: string } => {
      if (userId.trim() === currentUser.id) {
        setIsLocked(false);
        return { success: true };
      }
      return { success: false, message: 'Incorrect User ID. Please try again.' };
    };
    try {
      const result = await verifySessionPin(userId);
      if (result.unauthenticated) return unlockLocally();
      if (result.success) setIsLocked(false);
      return result;
    } catch {
      return unlockLocally();
    }
  };

  const handleApplyApiBaseUrl = (url: string): string => {
    const { baseUrl } = setApiBaseUrlOverride(url);
    removeAuthToken();
    setLoginError(undefined);
    return baseUrl;
  };

  const handleLockoutDetected = (seconds: number) => {
    setLockoutSeconds((prev) => Math.max(prev, seconds));
  };

  const refreshLockout = async (identifier: string) => {
    const [userResult, lockResult] = await Promise.all([apiCheckUser(identifier), apiCheckLockout(identifier)]);
    const dbSecs = userResult.locked_until
      ? Math.max(0, Math.floor((new Date(userResult.locked_until).getTime() - Date.now()) / 1000))
      : 0;
    const cacheSecs = lockResult.locked_out ? lockResult.retry_after : 0;
    setLockoutSeconds(Math.max(dbSecs, cacheSecs));
  };

  const handleUseEnvApi = (): string => {
    const { baseUrl } = setApiBaseUrlOverride('');
    removeAuthToken();
    setLoginError(undefined);
    return baseUrl;
  };

  return {
    isAuthenticated,
    setIsAuthenticated,
    authChecking,
    setAuthChecking,
    currentUser,
    setCurrentUser,
    loggedInOffline,
    setLoggedInOffline,
    loginError,
    setLoginError,
    lockoutSeconds,
    attemptsRemaining,
    isLocked,
    unlock,
    pendingUser,
    pendingTotpSecret: pendingUser ? getTOTPSecret(pendingUser.email) ?? null : null,
    completeTOTPVerification,
    cancelTOTPVerification,
    handleLogin,
    handleLogout,
    handleLockoutDetected,
    refreshLockout,
    handleApplyApiBaseUrl,
    handleUseEnvApi,
  };
}
