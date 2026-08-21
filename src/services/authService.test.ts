jest.mock('./apiService', () => ({
  apiLogin: jest.fn(),
  apiGetUser: jest.fn(),
  apiLogout: jest.fn(),
  getAuthToken: jest.fn(() => null),
  setAuthToken: jest.fn(),
  removeAuthToken: jest.fn(),
}));

jest.mock('./offlineAuthStore', () => ({
  verifyOfflineAuthCredentials: jest.fn(),
  saveOfflineAuthCredentials: jest.fn(async () => undefined),
}));

import { apiLogin, apiGetUser } from './apiService';
import { verifyOfflineAuthCredentials, saveOfflineAuthCredentials } from './offlineAuthStore';
import { tryOfflineCredentialLogin, verifyManagerCredentials } from './authService';

const mockVerifyOffline = verifyOfflineAuthCredentials as jest.Mock;
const mockSaveOffline = saveOfflineAuthCredentials as jest.Mock;
const mockApiLogin = apiLogin as jest.Mock;
const mockApiGetUser = apiGetUser as jest.Mock;

beforeEach(() => {
  mockVerifyOffline.mockReset();
  mockSaveOffline.mockReset().mockResolvedValue(undefined);
  mockApiLogin.mockReset();
  mockApiGetUser.mockReset();
});

describe('tryOfflineCredentialLogin', () => {
  it('logs in on a matching cached profile', async () => {
    mockVerifyOffline.mockResolvedValue({
      ok: true,
      profile: {
        email: 'cashier@honor.ph', userId: '1', name: 'Cashier One',
        roles: ['Cashier'], role: 'cashier', is_sales_person: true, savedAt: 1,
      },
    });

    const result = await tryOfflineCredentialLogin('cashier@honor.ph', 'pw');
    expect(result.error).toBeNull();
    expect(result.user?.id).toBe('1');
  });

  it('rejects a cached account with is_sales_person: false', async () => {
    mockVerifyOffline.mockResolvedValue({
      ok: true,
      profile: {
        email: 'x@honor.ph', userId: '2', name: 'X',
        roles: [], role: 'user', is_sales_person: false, savedAt: 1,
      },
    });

    const result = await tryOfflineCredentialLogin('x@honor.ph', 'pw');
    expect(result.user).toBeNull();
    expect(result.error).toMatch(/not authorized/i);
  });

  it('surfaces "no saved account" for not_found', async () => {
    mockVerifyOffline.mockResolvedValue({ ok: false, reason: 'not_found' });
    const result = await tryOfflineCredentialLogin('nobody@honor.ph', 'pw');
    expect(result.user).toBeNull();
    expect(result.error).toMatch(/no saved offline account/i);
  });

  it('surfaces a specific message for an expired cache entry', async () => {
    mockVerifyOffline.mockResolvedValue({ ok: false, reason: 'expired' });
    const result = await tryOfflineCredentialLogin('cashier@honor.ph', 'pw');
    expect(result.error).toMatch(/reconnect/i);
  });

  it('surfaces remaining lockout minutes', async () => {
    mockVerifyOffline.mockResolvedValue({ ok: false, reason: 'locked', retryAfterSeconds: 900 });
    const result = await tryOfflineCredentialLogin('cashier@honor.ph', 'pw');
    expect(result.error).toMatch(/15 minute/i);
  });

  it('surfaces "invalid credentials" for a wrong password', async () => {
    mockVerifyOffline.mockResolvedValue({ ok: false, reason: 'invalid' });
    const result = await tryOfflineCredentialLogin('cashier@honor.ph', 'wrong');
    expect(result.user).toBeNull();
    expect(result.error).toMatch(/no saved offline account/i);
  });
});

describe('verifyManagerCredentials offline path', () => {
  beforeEach(() => {
    mockApiLogin.mockRejectedValue(new TypeError('Failed to fetch'));
  });

  it('does not attempt offline verification when allowOffline is false', async () => {
    const result = await verifyManagerCredentials('mgr@honor.ph', 'pw');
    expect(result.ok).toBe(false);
    expect(mockVerifyOffline).not.toHaveBeenCalled();
  });

  it('falls back to the offline cache when allowOffline is true and the network fails', async () => {
    mockVerifyOffline.mockResolvedValue({
      ok: true,
      profile: {
        email: 'mgr@honor.ph', userId: '7', name: 'Manager Seven',
        roles: ['OIC'], role: 'admin', is_sales_person: true, savedAt: Date.now(),
      },
    });

    const result = await verifyManagerCredentials('mgr@honor.ph', 'pw', true);
    expect(result.ok).toBe(true);
    expect(result.offline).toBe(true);
    expect(result.userId).toBe('7');
    expect(result.managerToken).toBeUndefined();
  });

  it('rejects a cached identity without a manager-level role', async () => {
    mockVerifyOffline.mockResolvedValue({
      ok: true,
      profile: {
        email: 'cashier@honor.ph', userId: '3', name: 'Just A Cashier',
        roles: ['Cashier'], role: 'cashier', is_sales_person: true, savedAt: Date.now(),
      },
    });

    const result = await verifyManagerCredentials('cashier@honor.ph', 'pw', true);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/manager, admin, or oic/i);
  });

  it('surfaces the expired-cache message offline', async () => {
    mockVerifyOffline.mockResolvedValue({ ok: false, reason: 'expired' });
    const result = await verifyManagerCredentials('mgr@honor.ph', 'pw', true);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/reconnect/i);
  });
});

describe('verifyManagerCredentials online path', () => {
  beforeEach(() => {
    mockApiLogin.mockResolvedValue({
      success: true,
      message: 'OK',
      data: {
        token: 'tok-1',
        token_type: 'Bearer',
        user: { id: 7, user_id: 'B2023007', name: 'Manager Seven', email: 'manager7@honor.ph' },
      },
    });
    mockApiGetUser.mockResolvedValue({
      success: true,
      message: 'OK',
      data: { user: { id: 7, name: 'Manager Seven', email: 'manager7@honor.ph' }, roles: ['OIC'] },
    });
  });

  it('approves when the manager logs in with a user ID instead of an email', async () => {
    const result = await verifyManagerCredentials('B2023007', 'pw');
    expect(result.ok).toBe(true);
    expect(result.userId).toBe('B2023007');
  });

  it('caches using the real email from the login response, not the typed user ID', async () => {
    await verifyManagerCredentials('B2023007', 'pw');
    // Best-effort cache call is fire-and-forget (void) — flush microtasks before asserting.
    await Promise.resolve();
    expect(mockSaveOffline).toHaveBeenCalledWith(expect.objectContaining({ email: 'manager7@honor.ph' }));
  });

  it('still approves even if caching the offline credentials fails', async () => {
    mockSaveOffline.mockRejectedValueOnce(new Error('Invalid email'));
    const result = await verifyManagerCredentials('B2023007', 'pw');
    expect(result.ok).toBe(true);
  });
});
