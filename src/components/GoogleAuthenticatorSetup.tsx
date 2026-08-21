/**
 * Google Authenticator (TOTP) enrollment — ported from the desktop's
 * GoogleAuthenticatorSetup.tsx. QR rendering uses react-native-qrcode-svg
 * (no canvas/`qrcode` npm package on RN) — it draws the otpauth:// URI
 * directly, so no data-URL round-trip is needed.
 */
import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import { Feather } from '@expo/vector-icons';
import { generateTOTPSecret, generateTOTPURL, verifyTOTP } from '../services/totpService';
import { Button } from './Button';

interface GoogleAuthenticatorSetupProps {
  email: string;
  onComplete: (secret: string) => void;
  onCancel: () => void;
}

export function GoogleAuthenticatorSetup({ email, onComplete, onCancel }: GoogleAuthenticatorSetupProps) {
  const [secret] = useState(() => generateTOTPSecret());
  const [step, setStep] = useState<'setup' | 'verify'>('setup');
  const [code, setCode] = useState<string[]>(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  const otpAuthUrl = generateTOTPURL(email, secret);

  useEffect(() => {
    if (step === 'verify') {
      const t = setTimeout(() => inputRefs.current[0]?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [step]);

  const handleVerify = async (full?: string) => {
    const value = full ?? code.join('');
    if (value.length !== 6 || !/^\d{6}$/.test(value)) {
      setError('Please enter all 6 digits');
      return;
    }
    setIsVerifying(true);
    setError('');
    const isValid = await verifyTOTP(value, secret);
    if (isValid) {
      onComplete(secret);
    } else {
      setError('Invalid code. Please enter the current code from Google Authenticator.');
      setIsVerifying(false);
      setCode(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    }
  };

  const handleChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...code];
    next[index] = digit;
    setCode(next);
    setError('');
    if (digit && index < 5) inputRefs.current[index + 1]?.focus();
    if (index === 5 && digit && next.every((d) => d !== '')) void handleVerify(next.join(''));
  };

  const handleKeyPress = (index: number, key: string) => {
    if (key === 'Backspace' && !code[index] && index > 0) inputRefs.current[index - 1]?.focus();
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <ScrollView contentContainerClassName="items-center p-6">
        <View className="w-full max-w-sm gap-6 rounded-2xl bg-white p-6">
          <View className="items-center gap-2">
            <View className="h-14 w-14 items-center justify-center rounded-full bg-blue-100">
              <Feather name="shield" size={26} color="#2563EB" />
            </View>
            <Text className="text-xl font-bold text-gray-900">Setup Google Authenticator</Text>
            <Text className="text-center text-sm text-gray-600">Scan the QR code with your Google Authenticator app</Text>
          </View>

          {step === 'setup' ? (
            <>
              <View className="items-center gap-3 rounded-lg border-2 border-gray-200 bg-white p-4">
                <QRCode value={otpAuthUrl} size={220} />
              </View>

              <View className="gap-2 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <Text className="text-sm font-medium text-gray-700">Can&rsquo;t scan? Enter this code manually:</Text>
                <Text className="rounded border border-gray-300 bg-white p-3 font-mono text-sm text-gray-900">{secret}</Text>
                <Text className="text-xs text-gray-500">In Google Authenticator, tap &ldquo;+&rdquo; → &ldquo;Enter a setup key&rdquo; → enter this code.</Text>
              </View>

              <Button onPress={() => setStep('verify')}>I&rsquo;ve scanned the QR code</Button>
              <Button variant="outline" onPress={onCancel}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <View className="rounded-lg border border-green-200 bg-green-50 p-4">
                <Text className="text-sm text-green-800">
                  <Text className="font-bold">Step 2:</Text> Open Google Authenticator and enter the 6-digit code shown for &ldquo;Honor POS&rdquo;
                </Text>
              </View>

              <View>
                <Text className="mb-3 text-center text-sm font-medium text-gray-700">Enter Verification Code</Text>
                <View className="flex-row justify-center gap-2">
                  {code.map((digit, index) => (
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
                      className={`h-14 w-12 rounded-lg border-2 text-center text-2xl font-bold text-gray-900 ${error ? 'border-red-300' : 'border-gray-300'}`}
                    />
                  ))}
                </View>
                {error ? (
                  <View className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                    <Text className="text-center text-sm text-red-700">{error}</Text>
                  </View>
                ) : null}
              </View>

              <Button onPress={() => handleVerify()} loading={isVerifying} disabled={isVerifying || code.some((d) => !d)}>
                {isVerifying ? 'Verifying...' : 'Verify & Complete Setup'}
              </Button>
              <Button variant="outline" onPress={() => setStep('setup')} disabled={isVerifying}>
                Back
              </Button>
              <Button variant="outline" onPress={onCancel} disabled={isVerifying}>
                Cancel
              </Button>
            </>
          )}

          <Text className="text-center text-xs text-gray-500">After setup, you&rsquo;ll need to enter a code from Google Authenticator each time you log in.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
