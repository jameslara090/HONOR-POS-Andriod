/**
 * Customer search/create — ported from the desktop's
 * src/ui/components/CustomerSelectModal.tsx (the desktop keeps these fetch
 * calls inline in the component rather than in pos.ts; this port pulls them
 * into their own module to match this repo's api/* convention).
 */
import { getApiUrl, getApiToken } from './config';
import { offlineEnqueueCustomer, offlineListCachedCustomers, offlineUpsertCustomers } from '../services/offlineStore';
import * as Crypto from 'expo-crypto';
import type { PosCustomer } from '../types';

function getHeaders(): Record<string, string> {
  const token = getApiToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function searchCachedCustomers(query: string): Promise<PosCustomer[]> {
  const cached = await offlineListCachedCustomers();
  const needle = query.trim().toLowerCase();
  return cached.filter(
    (c) =>
      c.name.toLowerCase().includes(needle) ||
      (c.phone ?? '').toLowerCase().includes(needle) ||
      (c.company ?? '').toLowerCase().includes(needle)
  );
}

/**
 * Search results come from the live API when reachable. A dropped
 * connection or a 401 falls back to a small local cache of previously-seen
 * real customers instead of showing nothing.
 */
export async function searchCustomers(query: string, limit = 10): Promise<{ customers: PosCustomer[]; offline: boolean }> {
  let res: Response;
  try {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    res = await fetch(getApiUrl(`/api/v1/pos/customers?${params.toString()}`), { headers: getHeaders() });
  } catch {
    return { customers: await searchCachedCustomers(query), offline: true };
  }

  if (res.status === 401) {
    return { customers: await searchCachedCustomers(query), offline: true };
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { customers: await searchCachedCustomers(query), offline: true };
  }

  const customers: PosCustomer[] = body?.data?.customers ?? [];
  if (customers.length > 0) {
    void offlineUpsertCustomers(customers);
  }
  return { customers, offline: false };
}

export interface CreateCustomerInput {
  name: string;
  company?: string;
  phone?: string;
  email?: string;
  address?: string;
  tin?: string;
}

function walkInCustomer(data: CreateCustomerInput): PosCustomer {
  return {
    id: 0,
    name: data.name,
    company: data.company ?? null,
    phone: data.phone ?? null,
    email: data.email ?? null,
    address: data.address ?? null,
    tin: data.tin ?? null,
  };
}

/**
 * On a dropped connection (or 401), no real customer record can be created
 * synchronously. Instead of failing checkout, this queues the full customer
 * profile via offlineEnqueueCustomer (POSTs for real once back online) and
 * hands back a walk-in "pseudo customer" (id: 0, never a real row) for
 * immediate use on this sale only — the sale flows in as free-text
 * customer_name, matching the desktop's behavior exactly.
 */
export async function createCustomer(data: CreateCustomerInput): Promise<{ customer: PosCustomer; offline: boolean }> {
  let res: Response;
  try {
    res = await fetch(getApiUrl('/api/v1/pos/customers'), {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
  } catch {
    await enqueueOfflineCustomer(data);
    return { customer: walkInCustomer(data), offline: true };
  }

  if (res.status === 401) {
    await enqueueOfflineCustomer(data);
    return { customer: walkInCustomer(data), offline: true };
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.message ?? 'Failed to create customer');
  return { customer: body?.data?.customer, offline: false };
}

async function enqueueOfflineCustomer(data: CreateCustomerInput): Promise<void> {
  const id = Crypto.randomUUID();
  await offlineEnqueueCustomer({
    id,
    payload: { ...data, client_customer_uuid: id },
    createdAt: Date.now(),
  });
}
