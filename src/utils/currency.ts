/**
 * Currency formatting utilities for the POS system.
 */

/**
 * Formats a number as Philippine Peso currency string with thousands commas.
 * e.g.  12345.6  →  "₱12,345.60"
 *       0        →  "₱0.00"
 */
export function formatCurrency(value: number): string {
  return '₱' + value.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
