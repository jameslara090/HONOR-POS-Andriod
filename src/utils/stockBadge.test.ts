import { getOnHandBadge } from './stockBadge';

describe('getOnHandBadge', () => {
  it('shows a dash and neutral color when stock data is unknown', () => {
    const badge = getOnHandBadge({ stock: 99, hasStockData: false });
    expect(badge.label).toBe('On-Hand: —');
    expect(badge.className).toBe('bg-gray-100 text-gray-600');
  });

  it('shows the count and neutral color when stock is healthy (>= 10)', () => {
    const badge = getOnHandBadge({ stock: 42, hasStockData: true });
    expect(badge.label).toBe('On-Hand: 42');
    expect(badge.className).toBe('bg-gray-100 text-gray-600');
  });

  it('shows the count and neutral color at the exact healthy boundary (10)', () => {
    const badge = getOnHandBadge({ stock: 10, hasStockData: true });
    expect(badge.label).toBe('On-Hand: 10');
    expect(badge.className).toBe('bg-gray-100 text-gray-600');
  });

  it('shows the count and orange color when stock is low (1-9)', () => {
    const badge = getOnHandBadge({ stock: 5, hasStockData: true });
    expect(badge.label).toBe('On-Hand: 5');
    expect(badge.className).toBe('bg-orange-100 text-orange-700');
  });

  it('shows the count and orange color at the exact low boundary (9)', () => {
    const badge = getOnHandBadge({ stock: 9, hasStockData: true });
    expect(badge.label).toBe('On-Hand: 9');
    expect(badge.className).toBe('bg-orange-100 text-orange-700');
  });

  it('shows the count and red color when out of stock (0)', () => {
    const badge = getOnHandBadge({ stock: 0, hasStockData: true });
    expect(badge.label).toBe('On-Hand: 0');
    expect(badge.className).toBe('bg-red-100 text-red-700');
  });
});
