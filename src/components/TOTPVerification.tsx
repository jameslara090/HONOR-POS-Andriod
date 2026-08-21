import { useEffect, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { validateTOTP } from '../services/totpService';
import { Button } from './Button';

interface TOTPVerificationProps {
  secret: string;
  onVerify: () => void;
  onCancel: () => void;
}

export function TOTPVerification({ secret, onVerify, onCancel }: TOTPVerificationProps) {
  const [totpCode, setTotpCode] = useState<string[]>(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(60);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    const updateTimer = () => {
      const now = Date.now();
      const secondsSinceMinute = Math.floor(now / 1000) % 60;
      setTimeRemaining(60 - secondsSinceMinute);
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleVerify = async (code?: string) => {
    const fullCode = code ?? totpCode.join('');
    if (fullCode.length !== 6) {
      setError('Please enter the complete 6-digit code');
      return;
    }

    setIsVerifying(true);
    setError('');

    const result = await validateTOTP(fullCode, secret);
    if (result.isValid) {
      onVerify();
    } else {
      setError(result.error || 'Invalid code. Please enter the current code from Google Authenticator.');
      setTotpCode(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    }
    setIsVerifying(false);
  };

  const handleChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...totpCode];
    next[index] = digit;
    setTotpCode(next);
    setError('');

    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
    if (index === 5 && digit && next.every((d) => d !== '')) {
      void handleVerify(next.join(''));
    }
  };

  const handleKeyPress = (index: number, key: string) => {
    if (key === 'Backspace' && !totpCode[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const formatTime = (seconds: number) => seconds.toString().padStart(2, '0');

  return (
    <View className="w-full max-w-sm gap-6">
      <View className="items-center gap-1">
        <Text className="text-2xl font-bold text-gray-900">Google Authenticator</Text>
        <Text className="text-center text-gray-600">Enter the 6-digit code from your Google Authenticator app</Text>
      </View>

      <View className="flex-row items-center justify-center gap-2 self-center rounded-lg border border-blue-200 bg-blue-50 px-4 py-2">
        <Feather name="clock" size={16} color="#2563EB" />
        <Text className="text-sm font-medium text-blue-900">
          Code refreshes in: <Text className="font-bold">{formatTime(timeRemaining)}s</Text>
        </Text>
      </View>

      <View>
        <Text className="mb-3 text-center text-sm font-medium text-gray-700">Enter 6-Digit Code</Text>
        <View className="flex-row justify-center gap-2">
          {totpCode.map((digit, index) => (
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
              className={`h-14 w-12 rounded-lg border-2 text-center text-2xl font-bold text-gray-900 ${
                error ? 'border-red-300' : 'border-gray-300'
              }`}
            />
          ))}
        </View>

        {error ? (
          <View className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <Text className="text-center text-sm text-red-700">{error}</Text>
          </View>
        ) : null}

        <View className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <Text className="text-center text-xs text-gray-600">
            The code changes every 60 seconds. If it expires, enter the new code that appears.
          </Text>
        </View>
      </View>

      <View className="gap-3">
        <Button onPress={() => handleVerify()} loading={isVerifying} disabled={isVerifying || totpCode.some((d) => !d)}>
          {isVerifying ? 'Verifying...' : 'Verify Code'}
        </Button>
        <Button variant="outline" onPress={onCancel} disabled={isVerifying}>
          Cancel
        </Button>
      </View>
    </View>
  );
}
