import { getOnHandBadge } from './stockBadge';

describe('getOnHandBadge', () => {
  it('shows a dash and neutral color when stock data is unknown', () => {
    const badge = getOnHandBadge({ stock: 99, hasStockData: false });
    expect(badge.label).toBe('ON HAND —');
    expect(badge.className).toBe('bg-mod-neutral-200 text-mod-neutral-800');
  });

  it('shows the count and neutral color when stock is healthy (>= 10)', () => {
    const badge = getOnHandBadge({ stock: 42, hasStockData: true });
    expect(badge.label).toBe('ON HAND 42');
    expect(badge.className).toBe('bg-mod-neutral-200 text-mod-neutral-800');
  });

  it('shows the count and neutral color at the exact healthy boundary (10)', () => {
    const badge = getOnHandBadge({ stock: 10, hasStockData: true });
    expect(badge.label).toBe('ON HAND 10');
    expect(badge.className).toBe('bg-mod-neutral-200 text-mod-neutral-800');
  });

  it('shows the count and danger tint when stock is low (1-9)', () => {
    const badge = getOnHandBadge({ stock: 5, hasStockData: true });
    expect(badge.label).toBe('ON HAND 5');
    expect(badge.className).toBe('bg-mod-danger-200 text-mod-danger-800');
  });

  it('shows the count and danger tint at the exact low boundary (9)', () => {
    const badge = getOnHandBadge({ stock: 9, hasStockData: true });
    expect(badge.label).toBe('ON HAND 9');
    expect(badge.className).toBe('bg-mod-danger-200 text-mod-danger-800');
  });

  it('shows OUT OF STOCK on solid danger when out of stock (0)', () => {
    const badge = getOnHandBadge({ stock: 0, hasStockData: true });
    expect(badge.label).toBe('OUT OF STOCK');
    expect(badge.className).toBe('bg-mod-danger text-white');
  });
});
