/**
 * Email OTP verification — ported from the desktop's EmailOtpVerification.tsx.
 * The desktop de-dupes a resend within the OTP TTL via sessionStorage (survives
 * a page reload but not a real restart — roughly "this browser tab session").
 * There's no RN equivalent of a page reload independent of an app restart, so
 * a module-level Map approximates the same "this app run" scope.
 */
import { useEffect, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { sendOtp, verifyOtp } from '../services/emailOtpService';
import { Button } from './Button';

interface EmailOtpVerificationProps {
  email: string;
  onVerify: () => void;
  onCancel: () => void;
}

const OTP_TTL_SECONDS = 60;
const lastSentAt = new Map<string, number>();

export function EmailOtpVerification({ email, onVerify, onCancel }: EmailOtpVerificationProps) {
  const key = email.toLowerCase().trim();
  const [otpCode, setOtpCode] = useState<string[]>(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(OTP_TTL_SECONDS);
  const [canResend, setCanResend] = useState(false);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  const sendOtpCode = async () => {
    if (isSending) return;
    setIsSending(true);
    setError('');
    setCanResend(false);
    setTimeRemaining(OTP_TTL_SECONDS);
    lastSentAt.set(key, Date.now());

    const response = await sendOtp(email);
    if (!response.success) {
      setError(response.message || 'Failed to send OTP code. Please try again.');
      lastSentAt.delete(key);
    }
    setIsSending(false);
  };

  useEffect(() => {
    (() => {
      const last = lastSentAt.get(key) ?? 0;
      const elapsedSec = last ? Math.floor((Date.now() - last) / 1000) : null;
      if (elapsedSec !== null && elapsedSec >= 0 && elapsedSec < OTP_TTL_SECONDS) {
        const remaining = Math.max(0, OTP_TTL_SECONDS - elapsedSec);
        setTimeRemaining(remaining);
        setCanResend(remaining === 0);
      } else {
        void sendOtpCode();
      }
    })();
    const t = setTimeout(() => inputRefs.current[0]?.focus(), 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (timeRemaining <= 0 || canResend) return;
    const id = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          setCanResend(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [timeRemaining, canResend]);

  const handleVerify = async (code?: string) => {
    const value = code ?? otpCode.join('');
    if (value.length !== 6 || !/^\d{6}$/.test(value)) {
      setError('Please enter all 6 digits');
      return;
    }
    setIsVerifying(true);
    setError('');
    const response = await verifyOtp(email, value);
    if (response.success) {
      onVerify();
    } else {
      setError(response.message || 'Invalid or expired OTP code. Please request a new one.');
      setIsVerifying(false);
      setOtpCode(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    }
  };

  const handleChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...otpCode];
    next[index] = digit;
    setOtpCode(next);
    setError('');
    if (digit && index < 5) inputRefs.current[index + 1]?.focus();
    if (index === 5 && digit && next.every((d) => d !== '')) void handleVerify(next.join(''));
  };

  const handleKeyPress = (index: number, keyName: string) => {
    if (keyName === 'Backspace' && !otpCode[index] && index > 0) inputRefs.current[index - 1]?.focus();
  };

  return (
    <SafeAreaView className="flex-1 items-center justify-center bg-gray-900 p-6">
      <View className="w-full max-w-sm gap-6 rounded-2xl bg-white p-8">
        <View className="items-center gap-2">
          <View className="h-12 w-12 items-center justify-center rounded-2xl bg-blue-50">
            <Feather name="mail" size={22} color="#2563EB" />
          </View>
          <Text className="text-[11px] font-bold uppercase tracking-widest text-blue-600">Security check</Text>
          <Text className="text-2xl font-bold text-gray-900">Email verification</Text>
          <Text className="text-center text-sm text-gray-600">
            We sent a 6-digit code to <Text className="font-bold text-gray-900">{email}</Text>
          </Text>
        </View>

        <View>
          <Text className="mb-3 text-center text-sm font-medium text-gray-700">Enter verification code</Text>
          <View className="flex-row justify-center gap-2">
            {otpCode.map((digit, index) => (
              <TextInput
                key={index}
                ref={(el) => {
                  inputRefs.current[index] = el;
                }}
                value={digit}
                onChangeText={(v) => handleChange(index, v)}
                onKeyPress={({ nativeEvent }) => handleKeyPress(index, nativeEvent.key)}
                keyboardType="number-pad"
                maxLength={1}
                editable={!isVerifying}
                className={`h-14 w-12 rounded-xl border-2 bg-blue-50/60 text-center text-2xl font-bold text-blue-800 ${error ? 'border-red-400' : 'border-blue-100'}`}
              />
            ))}
          </View>

          {!canResend && timeRemaining > 0 && (
            <Text className="mb-2 mt-3 text-center text-sm text-gray-600">
              Code expires in <Text className="font-bold text-blue-700">{timeRemaining}</Text> seconds
            </Text>
          )}

          {error ? (
            <View className="mb-4 mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <Text className="text-center text-sm text-red-700">{error}</Text>
            </View>
          ) : null}

          {canResend && (
            <Button variant="outline" onPress={() => void sendOtpCode()} disabled={isSending}>
              {isSending ? 'Sending...' : 'Resend code'}
            </Button>
          )}
        </View>

        <View className="gap-3">
          <Button onPress={() => handleVerify()} loading={isVerifying} disabled={isVerifying || otpCode.join('').length !== 6}>
            {isVerifying ? 'Verifying...' : 'Verify code'}
          </Button>
          <Button variant="outline" onPress={onCancel} disabled={isVerifying}>
            Cancel
          </Button>
        </View>

        <Text className="text-center text-xs text-gray-500">Check your inbox and spam folder for the message from Honor POS.</Text>
      </View>
    </SafeAreaView>
  );
}
