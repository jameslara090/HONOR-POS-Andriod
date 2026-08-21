/**
 * Products API — ported from the desktop's src/ui/api/products.ts. Plain
 * fetch calls, unchanged on RN; only the API-config imports point at this
 * repo's src/api/config.ts instead of the desktop's equivalent.
 */
import { getApiUrl, getApiToken } from './config';
import type { Product, ProductCategory } from '../types';

export interface ApiProduct {
  id: number;
  pd_prodid?: number | null;
  pd_desc?: string | null;
  pd_postext?: string | null;
  pd_price?: number | null;
  pd_cat1?: string | null;
  pd_vendor?: string | null;
  is_serialized?: boolean;
  pd_forsale?: boolean;
  pd_active?: boolean;
  image?: string | null;
  image_url?: string | null;
  product_image?: string | null;
  pd_image?: string | null;
  thumbnail?: string | null;
  /** From POS inventory API: current on-hand in the user's store */
  on_hand?: number | null;
  [key: string]: unknown;
}

export interface ApiInventoryResponse {
  success?: boolean;
  message?: string;
  data?: {
    products: ApiProduct[];
    meta?: { store_id: number; total: number; per_page: number; current_page: number; last_page: number };
  };
}

export interface FetchProductsResult {
  products: Product[];
  meta?: { total: number; perPage: number; lastPage: number };
}

export interface FetchProductsError {
  status: number;
  message: string;
}

function mapCategory(pdCat1: string | null | undefined): ProductCategory {
  const trimmed = (pdCat1 ?? '').trim();
  return trimmed || 'Uncategorized';
}

function resolveProductImageUrl(value: string | null | undefined): string | undefined {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return undefined;
  if (/^(https?:|data:|blob:)/i.test(trimmed)) return trimmed;
  if (/res\.cloudinary\.com/i.test(trimmed)) return `https://${trimmed.replace(/^\/+/, '')}`;

  let path = trimmed.replace(/\\/g, '/').replace(/^\/+/, '');
  path = path.replace(/^public\/storage\//, '').replace(/^storage\//, '');
  return getApiUrl(`/storage/${path}`);
}

function mapApiProductToProduct(api: ApiProduct): Product {
  const name = api.pd_desc?.trim() || api.pd_postext?.trim() || `Product ${api.id}`;
  const sku = String(api.pd_prodid ?? api.pd_vendor ?? api.id);
  const hasStockData = api.on_hand !== null && api.on_hand !== undefined;
  const stock = hasStockData ? Math.max(0, Math.floor(api.on_hand as number)) : 99;
  const image = resolveProductImageUrl(api.image ?? api.image_url ?? api.product_image ?? api.pd_image ?? api.thumbnail);

  return {
    id: String(api.id),
    name,
    category: mapCategory(api.pd_cat1),
    price: api.pd_price ?? 0,
    image,
    stock,
    hasStockData,
    sku,
    isSerialized: !!api.is_serialized,
  };
}

/**
 * Fetch products from the current user's store inventory (with real stock).
 * When the user has multiple stores, pass storeId.
 */
export async function fetchProducts(options?: {
  search?: string;
  perPage?: number;
  storeId?: number | null;
}): Promise<FetchProductsResult> {
  const params = new URLSearchParams();
  if (options?.search) params.set('search', options.search);
  params.set('per_page', String(options?.perPage ?? 100));
  if (options?.storeId != null) params.set('store_id', String(options.storeId));

  const token = getApiToken();
  const headers: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(getApiUrl(`/api/v1/pos/inventory?${params.toString()}`), {
      method: 'GET',
      headers,
      cache: 'no-store',
    });
  } catch (error) {
    if (error instanceof TypeError) {
      const err: FetchProductsError = {
        status: 0,
        message: 'Cannot connect to API server. Please check your connection.',
      };
      throw err;
    }
    throw error;
  }

  const body = (await res.json().catch(() => ({}))) as ApiInventoryResponse;

  if (!res.ok) {
    const message =
      res.status === 401 ? 'Session expired. Please log in again.' : body.message ?? res.statusText ?? 'Failed to load products';
    const err: FetchProductsError = { status: res.status, message };
    throw err;
  }

  const apiProducts = body.data?.products ?? [];
  const meta = body.data?.meta;
  return {
    products: apiProducts.map(mapApiProductToProduct),
    meta: meta ? { total: meta.total, perPage: meta.per_page, lastPage: meta.last_page } : undefined,
  };
}
