/**
 * API Service for making HTTP requests to pos-react backend.
 * Ported from the desktop's src/ui/services/apiService.ts — fetch works unchanged on RN.
 */
import { getServiceApiBaseUrl, API_ENDPOINTS } from './apiConfig';
import { getApiToken, setApiToken, removeApiToken } from '../api/config';

const DEBUG_API_LOGS = __DEV__;

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  errors?: Record<string, string[]>;
  locked_out?: boolean;
  retry_after?: number;
  attempts_remaining?: number;
  pos_access_denied?: boolean;
}

export interface LoginResponse {
  token: string;
  token_type: string;
  user: {
    id: number;
    /** POS identifier (often alphanumeric) from `users.user_id` */
    user_id?: string | null;
    name: string;
    email: string;
    is_sales_person?: boolean;
    company_id?: number | null;
  };
}

export function getAuthToken(): string | null {
  return getApiToken();
}

export function setAuthToken(token: string): void {
  setApiToken(token);
}

export function removeAuthToken(): void {
  removeApiToken();
}

/**
 * Make an API request
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const token = getAuthToken();

  // Important: Laravel needs both Accept and X-Requested-With to return JSON responses
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  };

  if (options.headers) {
    if (options.headers instanceof Headers) {
      options.headers.forEach((value, key) => {
        headers[key] = value;
      });
    } else if (Array.isArray(options.headers)) {
      options.headers.forEach(([key, value]) => {
        headers[key] = value;
      });
    } else {
      Object.assign(headers, options.headers);
    }
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const url = `${getServiceApiBaseUrl()}${endpoint}`;
    const fetchOptions: RequestInit = {
      ...options,
      method: options.method || 'GET',
      headers,
    };

    if (fetchOptions.method === 'GET' || fetchOptions.method === 'HEAD') {
      delete fetchOptions.body;
    }

    const response = await fetch(url, fetchOptions);

    if (DEBUG_API_LOGS) {
      console.log('API response received:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
      });
    }

    const contentType = response.headers.get('content-type');
    let data;

    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      console.error('Non-JSON response:', text);
      try {
        data = JSON.parse(text);
      } catch {
        return {
          success: false,
          message: `Server returned non-JSON response: ${response.statusText}`,
        };
      }
    }

    if (!response.ok) {
      let errorMessage = 'An error occurred';

      if (data && typeof data === 'object') {
        if (data.message) {
          errorMessage = data.message;
        } else if (data.errors) {
          const errorValues = Object.values(data.errors).flat();
          if (errorValues.length > 0) {
            errorMessage = Array.isArray(errorValues[0]) ? errorValues[0][0] : String(errorValues[0]);
          }
        } else if (data.error) {
          errorMessage = data.error;
        }
      }

      // If the backend rejects our auth token (common when switching API base URLs/backends),
      // clear the stored token so the user can log in again.
      if (response.status === 401) {
        removeAuthToken();
      }

      return {
        success: false,
        message: errorMessage,
        errors: data?.errors,
        locked_out: data?.locked_out,
        retry_after: data?.retry_after,
        attempts_remaining: data?.attempts_remaining,
        pos_access_denied: data?.pos_access_denied,
      };
    }

    if (data && typeof data === 'object' && !('success' in data)) {
      return {
        success: true,
        message: 'Success',
        data: data,
      } as ApiResponse<T>;
    }

    return data;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Network error occurred. Please check if the API server is running.';

    if (error instanceof TypeError && error.message.includes('Network request failed')) {
      return {
        success: false,
        message: 'Cannot connect to API server. Please ensure the server is running.',
      };
    }

    return {
      success: false,
      message: errorMessage,
    };
  }
}

/**
 * Login to the API
 */
export async function apiLogin(
  identifier: string,
  password: string,
  deviceName: string = 'HONOR-POS-Android'
): Promise<ApiResponse<LoginResponse>> {
  const id = identifier.trim();
  const requestBody = id.includes('@')
    ? { email: id, password, device_name: deviceName }
    : { user_id: id, password, device_name: deviceName };

  const loginOptions: RequestInit = {
    method: 'POST',
    body: JSON.stringify(requestBody),
  };

  const response = await apiRequest<LoginResponse>(API_ENDPOINTS.login, loginOptions);

  if (response.success && response.data?.token) {
    setAuthToken(response.data.token);
  }

  return response;
}

/**
 * Logout from the API
 */
export async function apiLogout(): Promise<ApiResponse> {
  const response = await apiRequest(API_ENDPOINTS.logout, {
    method: 'POST',
  });

  if (response.success) {
    removeAuthToken();
  }

  return response;
}

/**
 * Get the current authenticated user
 */
export async function apiGetUser(): Promise<
  ApiResponse<{
    user: LoginResponse['user'];
    roles?: string[];
    permissions?: string[];
    is_super_admin?: boolean;
  }>
> {
  return apiRequest<{
    user: LoginResponse['user'];
    roles?: string[];
    permissions?: string[];
    is_super_admin?: boolean;
  }>(API_ENDPOINTS.user);
}

/**
 * Check if a user exists by email or user_id (unauthenticated).
 * Returns { exists, name } on success, or exists: false when not found.
 */
export async function apiCheckUser(
  identifier: string
): Promise<{ exists: boolean; name?: string; account_locked?: boolean; locked_until?: string | null }> {
  const id = identifier.trim();
  const body = id.includes('@') ? { email: id } : { user_id: id };
  const response = await apiRequest<{ exists: boolean; name?: string; account_locked?: boolean; locked_until?: string | null }>(
    API_ENDPOINTS.checkUser,
    { method: 'POST', body: JSON.stringify(body) }
  );
  if (response.success && response.data) return response.data;
  return { exists: false };
}

/**
 * Check whether the given identifier is currently locked out on the server.
 * Call this on identifier entry to restore the lockout countdown after a refresh.
 */
export async function apiCheckLockout(identifier: string): Promise<{ locked_out: boolean; retry_after: number }> {
  const id = identifier.trim();
  const response = await apiRequest<{ locked_out: boolean; retry_after: number }>(API_ENDPOINTS.lockoutStatus, {
    method: 'POST',
    body: JSON.stringify({ identifier: id }),
  });
  if (response.success && response.data) return response.data;
  return { locked_out: false, retry_after: 0 };
}

/**
 * Test API connectivity
 */
export async function testApiConnection(): Promise<boolean> {
  try {
    await fetch(`${getServiceApiBaseUrl()}/api/v1`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });
    return true;
  } catch {
    return false;
  }
}
