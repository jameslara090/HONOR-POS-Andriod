jest.mock('./config', () => ({
  getApiUrl: (path: string) => `http://fake-api${path}`,
  getApiToken: () => 'fake-token',
}));

import { mapApiProductToProduct, type ApiProduct } from './products';

function baseApiProduct(overrides: Partial<ApiProduct> = {}): ApiProduct {
  return {
    id: 1,
    pd_prodid: 1001,
    pd_desc: 'Test Product',
    pd_price: 100,
    pd_cat1: 'Phones',
    is_serialized: false,
    ...overrides,
  };
}

describe('mapApiProductToProduct — hasStockData', () => {
  it('sets hasStockData true and uses the real on_hand value when present', () => {
    const product = mapApiProductToProduct(baseApiProduct({ on_hand: 7 }));
    expect(product.hasStockData).toBe(true);
    expect(product.stock).toBe(7);
  });

  it('sets hasStockData true even when on_hand is 0', () => {
    const product = mapApiProductToProduct(baseApiProduct({ on_hand: 0 }));
    expect(product.hasStockData).toBe(true);
    expect(product.stock).toBe(0);
  });

  it('sets hasStockData false and falls back to 99 when on_hand is null', () => {
    const product = mapApiProductToProduct(baseApiProduct({ on_hand: null }));
    expect(product.hasStockData).toBe(false);
    expect(product.stock).toBe(99);
  });

  it('sets hasStockData false and falls back to 99 when on_hand is undefined', () => {
    const product = mapApiProductToProduct(baseApiProduct({ on_hand: undefined }));
    expect(product.hasStockData).toBe(false);
    expect(product.stock).toBe(99);
  });
});
