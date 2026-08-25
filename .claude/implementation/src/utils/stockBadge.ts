export interface OnHandBadge {
  label: string;
  className: string;
}

// Square tags on the Modernist ramps: neutral for healthy stock, accent tint
// under ten, solid accent when out.
const NEUTRAL = 'bg-mod-neutral-200 text-mod-neutral-800';
const LOW = 'bg-mod-accent-200 text-mod-accent-800';
const OUT = 'bg-mod-accent text-white';

export function getOnHandBadge(product: { stock: number; hasStockData: boolean }): OnHandBadge {
  if (!product.hasStockData) {
    return { label: 'ON HAND —', className: NEUTRAL };
  }
  if (product.stock === 0) {
    return { label: 'OUT OF STOCK', className: OUT };
  }
  if (product.stock < 10) {
    return { label: `ON HAND ${product.stock}`, className: LOW };
  }
  return { label: `ON HAND ${product.stock}`, className: NEUTRAL };
}
