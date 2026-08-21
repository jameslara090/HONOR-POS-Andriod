/**
 * Email OTP Service for sending and verifying OTP codes via email.
 * Ported from the desktop's src/ui/services/emailOtpService.ts — pure fetch, unchanged on RN.
 */
import { getServiceApiBaseUrl } from './apiConfig';

export interface SendOtpResponse {
  success: boolean;
  message: string;
  data?: {
    expires_in: number;
    message: string;
  };
}

export interface VerifyOtpResponse {
  success: boolean;
  message: string;
  data?: {
    verified: boolean;
  };
}

/**
 * Send OTP code to user's email
 */
export async function sendOtp(email: string): Promise<SendOtpResponse> {
  try {
    const response = await fetch(`${getServiceApiBaseUrl()}/api/v1/otp/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ email }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: data.message || 'Failed to send OTP code. Please try again.',
      };
    }

    return {
      success: true,
      message: data.message || 'OTP code sent successfully.',
      data: data.data,
    };
  } catch (error) {
    console.error('Error sending OTP:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Network error. Please check your connection.',
    };
  }
}

/**
 * Verify OTP code
 */
export async function verifyOtp(email: string, code: string): Promise<VerifyOtpResponse> {
  try {
    const response = await fetch(`${getServiceApiBaseUrl()}/api/v1/otp/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ email, code }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: data.message || 'Invalid or expired OTP code.',
      };
    }

    return {
      success: true,
      message: data.message || 'OTP code verified successfully.',
      data: data.data,
    };
  } catch (error) {
    console.error('Error verifying OTP:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Network error. Please check your connection.',
    };
  }
}
