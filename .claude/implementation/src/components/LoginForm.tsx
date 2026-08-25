/**
 * Login form — identifier debounce/lockout logic untouched. Modernist styling:
 * uppercase field labels, 2px field borders, and lockout/error states carried
 * by an accent-tinted block with a left rule rather than a rounded red card.
 */
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { apiCheckUser, apiCheckLockout } from '../services/apiService';
import { Button } from './Button';
import { ACCENT, NEUTRAL, PLACEHOLDER } from '../theme';

type IdentifierStatus = 'idle' | 'checking' | 'found' | 'not-found' | 'error';

interface LoginFormProps {
  onLogin: (identifier: string, password: string) => Promise<void> | void;
  error?: string;
  lockoutSeconds?: number;
  attemptsRemaining?: number | null;
  onLockoutDetected?: (seconds: number) => void;
}

function validateFormat(v: string): string {
  const trimmed = v.trim();
  if (trimmed.includes('@') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return 'Please enter a valid email address';
  }
  return '';
}

export function LoginForm({ onLogin, error, lockoutSeconds = 0, attemptsRemaining = null, onLockoutDetected }: LoginFormProps) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formatError, setFormatError] = useState('');
  const [identifierStatus, setIdentifierStatus] = useState<IdentifierStatus>('idle');

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCheckedRef = useRef('');

  const checkIdentifier = (value: string) => {
    const trimmed = value.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!trimmed || validateFormat(trimmed)) {
      setIdentifierStatus('idle');
      lastCheckedRef.current = '';
      return;
    }

    if (trimmed === lastCheckedRef.current) return;

    setIdentifierStatus('checking');
    debounceRef.current = setTimeout(async () => {
      lastCheckedRef.current = trimmed;
      try {
        const [result, lockResult] = await Promise.all([apiCheckUser(trimmed), apiCheckLockout(trimmed)]);
        if (trimmed !== lastCheckedRef.current) return; // stale
        setIdentifierStatus(result.exists ? 'found' : 'not-found');

        const dbSecs = result.locked_until
          ? Math.max(0, Math.floor((new Date(result.locked_until).getTime() - Date.now()) / 1000))
          : 0;
        const cacheSecs = lockResult.locked_out ? lockResult.retry_after : 0;
        const maxSecs = Math.max(dbSecs, cacheSecs);
        if (maxSecs > 0) onLockoutDetected?.(maxSecs);
      } catch {
        setIdentifierStatus('error');
      }
    }, 500);
  };

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const handleIdentifierChange = (value: string) => {
    setIdentifier(value);
    setFormatError(validateFormat(value));
    checkIdentifier(value);
  };

  const handleSubmit = async () => {
    if (!identifier.trim() || !password.trim()) return;
    const err = validateFormat(identifier);
    if (err) {
      setFormatError(err);
      return;
    }
    setIsSubmitting(true);
    try {
      await onLogin(identifier.trim(), password.trim());
    } catch (err) {
      console.error('Login form error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isLocked = lockoutSeconds > 0;
  const lockoutDisplay = (() => {
    const m = Math.floor(lockoutSeconds / 60);
    const s = lockoutSeconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  })();

  const identifierBorderClass = identifierStatus === 'not-found' ? 'border-mod-accent' : 'border-mod-ink';

  return (
    <View className="w-full max-w-[520px] gap-6">
      <Text className="font-a-semi text-[10px] tracking-label text-mod-neutral-700">CASHIER SIGN-IN</Text>

      <View>
        <Text className="mb-2 font-a-semi text-[11px] tracking-label text-mod-ink">USER ID OR EMAIL</Text>
        <View className={`h-[56px] flex-row items-center gap-3 border-2 bg-white px-3 ${identifierBorderClass}`}>
          <Feather name="user" size={18} color={NEUTRAL[600]} />
          <TextInput
            value={identifier}
            onChangeText={handleIdentifierChange}
            placeholder="User ID or email address"
            placeholderTextColor={PLACEHOLDER}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isLocked && !isSubmitting}
            className="h-full flex-1 font-a-med text-[17px] text-mod-ink"
          />
          {identifierStatus === 'checking' && <ActivityIndicator size="small" color={NEUTRAL[600]} />}
          {identifierStatus === 'found' && (
            <View className="flex-row items-center gap-1.5">
              <Feather name="check" size={14} color={ACCENT} />
              <Text className="font-a-semi text-[10px] tracking-label text-mod-accent-700">FOUND</Text>
            </View>
          )}
          {identifierStatus === 'not-found' && <Feather name="x" size={18} color={ACCENT} />}
        </View>
        {formatError ? <Text className="mt-1.5 font-a text-[13px] text-mod-accent-700">{formatError}</Text> : null}
        {!formatError && identifierStatus === 'not-found' && (
          <Text className="mt-1.5 font-a text-[13px] text-mod-accent-700">No account found with that User ID or email.</Text>
        )}
      </View>

      <View>
        <Text className="mb-2 font-a-semi text-[11px] tracking-label text-mod-ink">PASSWORD</Text>
        <View className={`h-[56px] flex-row items-center gap-3 border-2 bg-white px-3 ${error && !isLocked ? 'border-mod-accent' : 'border-mod-ink'}`}>
          <Feather name="lock" size={18} color={NEUTRAL[600]} />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Enter your password"
            placeholderTextColor={PLACEHOLDER}
            secureTextEntry={!showPassword}
            editable={!isLocked && !isSubmitting}
            className="h-full flex-1 font-a-med text-[17px] text-mod-ink"
          />
          <Feather
            name={showPassword ? 'eye-off' : 'eye'}
            size={18}
            color={NEUTRAL[600]}
            onPress={() => setShowPassword((v) => !v)}
            suppressHighlighting
          />
        </View>
      </View>

      {isLocked && (
        <View className="flex-row items-center gap-3 border-l-2 border-mod-accent bg-mod-accent-100 px-4 py-3">
          <Feather name="lock" size={18} color={ACCENT} />
          <Text className="flex-1 font-a text-[13px] text-mod-accent-800">
            Account temporarily locked. Try again in <Text className="font-a-bold">{lockoutDisplay}</Text>
          </Text>
        </View>
      )}

      {!isLocked && error && (
        <View className="gap-1 border-l-2 border-mod-accent bg-mod-accent-100 px-4 py-3">
          <Text className="font-a text-[13px] text-mod-accent-800">{error}</Text>
          {attemptsRemaining !== null && attemptsRemaining > 0 && (
            <Text className="font-a-semi text-[13px] text-mod-accent-800">
              {attemptsRemaining} attempt{attemptsRemaining !== 1 ? 's' : ''} remaining before lockout.
            </Text>
          )}
        </View>
      )}

      <Button
        onPress={handleSubmit}
        loading={isSubmitting}
        disabled={isLocked || isSubmitting || !identifier.trim() || !password.trim() || !!formatError}
        trailing={<Feather name="arrow-right" size={20} color="#fff" />}
      >
        {isSubmitting ? 'Signing in...' : 'Sign in'}
      </Button>

      <View className="border-t border-mod-neutral-300 pt-4">
        <Text className="font-a text-[12px] leading-5 text-mod-neutral-700">
          Offline sign-in is available for cashiers who signed in on this terminal in the last 7 days. 5 attempts before a
          15-minute lockout.
        </Text>
      </View>
    </View>
  );
}
