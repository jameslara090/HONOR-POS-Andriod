export interface OnHandBadge {
  label: string;
  className: string;
}

const NEUTRAL = 'bg-gray-100 text-gray-600';
const LOW = 'bg-orange-100 text-orange-700';
const OUT = 'bg-red-100 text-red-700';

export function getOnHandBadge(product: { stock: number; hasStockData: boolean }): OnHandBadge {
  if (!product.hasStockData) {
    return { label: 'On-Hand: —', className: NEUTRAL };
  }
  if (product.stock === 0) {
    return { label: `On-Hand: ${product.stock}`, className: OUT };
  }
  if (product.stock < 10) {
    return { label: `On-Hand: ${product.stock}`, className: LOW };
  }
  return { label: `On-Hand: ${product.stock}`, className: NEUTRAL };
}
