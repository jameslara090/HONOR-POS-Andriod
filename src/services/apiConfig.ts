import { getApiBaseUrl } from '../api/config';

export function getServiceApiBaseUrl(): string {
  return getApiBaseUrl();
}

export const API_ENDPOINTS = {
  login: '/api/v1/login',
  logout: '/api/v1/logout',
  user: '/api/v1/user',
  checkUser: '/api/v1/check-user',
  lockoutStatus: '/api/v1/lockout-status',
} as const;
