/**
 * IMEI / serial-number validation utilities.
 *
 * For 15-digit all-numeric strings we apply the Luhn checksum (standard for IMEI).
 * For other lengths / formats we fall back to a minimum-length check only.
 */

/** Returns true when the string passes the Luhn algorithm check. */
export function luhnCheck(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 0) return false;
  let sum = 0;
  let alternate = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10);
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

export interface ImeiValidationResult {
  valid: boolean;
  /** Human-readable error message when invalid, undefined when valid. */
  error?: string;
  /** Non-blocking warning message (e.g., IMEI checksum failed but override allowed). */
  warning?: string;
}

/**
 * Validates a serial / IMEI string.
 * - Must be non-empty (trimmed).
 * - Must be at least 3 characters.
 * - If exactly 15 digits, Luhn failure is a warning (override allowed).
 */
export function validateImei(value: string): ImeiValidationResult {
  const v = value.trim().toUpperCase();
  if (!v) return { valid: false, error: 'Serial number is required.' };
  if (v.length < 3) return { valid: false, error: 'Serial number is too short.' };

  // IMEI-specific: exactly 15 digits → Luhn check
  if (/^\d{15}$/.test(v)) {
    if (!luhnCheck(v)) {
      return { valid: true, warning: 'IMEI checksum looks invalid. You can continue, but please double-check the number.' };
    }
  }

  return { valid: true };
}
