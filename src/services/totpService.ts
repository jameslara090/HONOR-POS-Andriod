/**
 * TOTP Service for Google Authenticator (RFC 6238).
 *
 * Ported from the desktop's src/ui/services/totpService.ts. The desktop pinned a
 * custom `createDigest` using the browser's Web Crypto API (unavailable in React
 * Native). otplib v13's default crypto plugin (NobleCryptoPlugin, from
 * @noble/hashes) is pure JS and RN-compatible, so this uses the plain functional
 * API instead of a custom digest.
 */
import { generate, verify, generateSecret as otplibGenerateSecret, generateURI } from 'otplib';

const TOTP_OPTIONS = {
  digits: 6 as const,
  period: 60, // 60-second time window, matches the desktop's config
};

/**
 * Generate a new TOTP secret for a user
 * @returns A base32-encoded secret string
 */
export function generateTOTPSecret(): string {
  return otplibGenerateSecret();
}

/**
 * Generate a QR code data URL for Google Authenticator setup
 * @param email - User's email address
 * @param secret - TOTP secret
 * @param issuer - Service name (e.g., "Honor POS")
 * @returns otpauth:// URL string
 */
export function generateTOTPURL(email: string, secret: string, issuer: string = 'Honor POS'): string {
  return generateURI({ issuer, label: email, secret, ...TOTP_OPTIONS });
}

/**
 * Verify a TOTP code
 * @param token - The 6-digit code from Google Authenticator
 * @param secret - User's TOTP secret
 * @returns true if code is valid, false otherwise
 */
export async function verifyTOTP(token: string, secret: string): Promise<boolean> {
  try {
    if (!secret || !secret.trim()) {
      console.error('TOTP verification error: Secret is missing or empty');
      return false;
    }

    const code = token.trim();
    if (!/^\d{6}$/.test(code)) {
      return false;
    }

    const result = await verify({ token: code, secret, ...TOTP_OPTIONS });
    return result.valid;
  } catch (error) {
    console.error('TOTP verification error:', error);
    return false;
  }
}

/**
 * Generate current TOTP code for a secret (for testing/debugging)
 */
export async function generateCurrentTOTP(secret: string): Promise<string> {
  return generate({ secret, ...TOTP_OPTIONS });
}

/**
 * Check if a TOTP code is valid and not expired.
 * TOTP codes are valid for 60 seconds by default.
 */
export async function validateTOTP(token: string, secret: string): Promise<{ isValid: boolean; error?: string }> {
  if (!token || !token.trim()) {
    return { isValid: false, error: 'Please enter the 6-digit code' };
  }

  if (!/^\d{6}$/.test(token.trim())) {
    return { isValid: false, error: 'Code must be 6 digits' };
  }

  const isValid = await verifyTOTP(token, secret);

  if (!isValid) {
    return { isValid: false, error: 'Invalid code. Please enter the current code from Google Authenticator.' };
  }

  return { isValid: true };
}
