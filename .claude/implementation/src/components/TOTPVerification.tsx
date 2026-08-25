/**
 * TOTP step — timer, focus advance and validation are unchanged. Modernist
 * styling: six square 2px cells, a left-ruled accent strip for the refresh
 * countdown, flush-left copy.
 */
import { useEffect, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { validateTOTP } from '../services/totpService';
import { Button } from './Button';
import { ACCENT } from '../theme';

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
    <View className="w-full max-w-[520px] gap-6">
      <View className="gap-2">
        <Text className="font-a-display text-[26px] leading-[30px] text-mod-ink">Enter the code from Google Authenticator</Text>
        <Text className="font-a text-[13px] leading-5 text-mod-neutral-700">Six digits, refreshed every 60 seconds.</Text>
      </View>

      <View className="flex-row items-center gap-2 border-l-2 border-mod-accent bg-mod-accent-100 px-3 py-3">
        <Feather name="clock" size={16} color={ACCENT} />
        <Text className="font-a-semi text-[12px] text-mod-accent-800">Refreshes in {formatTime(timeRemaining)}s</Text>
      </View>

      <View>
        <Text className="mb-2 font-a-semi text-[11px] tracking-label text-mod-ink">6-DIGIT CODE</Text>
        <View className="flex-row gap-2">
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
              className={`h-[68px] flex-1 border-2 bg-white text-center font-a-display text-[26px] text-mod-ink ${
                error ? 'border-mod-accent' : digit ? 'border-mod-ink' : 'border-mod-neutral-400'
              }`}
            />
          ))}
        </View>

        {error ? (
          <View className="mt-3 border-l-2 border-mod-accent bg-mod-accent-100 px-4 py-3">
            <Text className="font-a text-[13px] text-mod-accent-800">{error}</Text>
          </View>
        ) : null}

        <Text className="mt-3 font-a text-[12px] leading-5 text-mod-neutral-700">
          The code changes every 60 seconds. If it expires, enter the new code that appears.
        </Text>
      </View>

      <View className="gap-2">
        <Button onPress={() => handleVerify()} loading={isVerifying} disabled={isVerifying || totpCode.some((d) => !d)}>
          {isVerifying ? 'Verifying...' : 'Verify'}
        </Button>
        <Button variant="outline" onPress={onCancel} disabled={isVerifying}>
          Cancel
        </Button>
      </View>
    </View>
  );
}
