import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { apiCheckUser, apiCheckLockout } from '../services/apiService';
import { Button } from './Button';

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

  const identifierBorderClass =
    identifierStatus === 'found' ? 'border-green-400' : identifierStatus === 'not-found' ? 'border-red-400' : 'border-gray-300';

  return (
    <View className="w-full max-w-sm gap-6">
      {/* User ID / Email */}
      <View>
        <Text className="mb-2 text-sm font-medium text-gray-700">User ID or Email</Text>
        <View className={`flex-row items-center rounded-lg border bg-white px-3 ${identifierBorderClass}`}>
          <Feather name="user" size={18} color="#9CA3AF" />
          <TextInput
            value={identifier}
            onChangeText={handleIdentifierChange}
            placeholder="User ID or email address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isLocked && !isSubmitting}
            className="ml-2 flex-1 py-3 text-base text-gray-900"
          />
          {identifierStatus === 'checking' && <ActivityIndicator size="small" color="#9CA3AF" />}
          {identifierStatus === 'found' && <Feather name="check" size={18} color="#22C55E" />}
          {identifierStatus === 'not-found' && <Feather name="x" size={18} color="#EF4444" />}
        </View>
        {formatError ? <Text className="mt-1 text-sm text-red-600">{formatError}</Text> : null}
        {!formatError && identifierStatus === 'not-found' && (
          <Text className="mt-1 text-sm text-red-600">No account found with that User ID or email.</Text>
        )}
      </View>

      {/* Password */}
      <View>
        <Text className="mb-2 text-sm font-medium text-gray-700">Password</Text>
        <View className={`flex-row items-center rounded-lg border bg-white px-3 ${error && !isLocked ? 'border-red-400' : 'border-gray-300'}`}>
          <Feather name="lock" size={18} color="#9CA3AF" />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Enter your password"
            secureTextEntry={!showPassword}
            editable={!isLocked && !isSubmitting}
            className="ml-2 flex-1 py-3 text-base text-gray-900"
          />
          <Feather
            name={showPassword ? 'eye-off' : 'eye'}
            size={18}
            color="#9CA3AF"
            onPress={() => setShowPassword((v) => !v)}
            suppressHighlighting
          />
        </View>
      </View>

      {/* Lockout banner */}
      {isLocked && (
        <View className="flex-row items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <Feather name="lock" size={18} color="#EF4444" />
          <Text className="flex-1 text-sm text-red-700">
            Account temporarily locked. Try again in <Text className="font-bold">{lockoutDisplay}</Text>
          </Text>
        </View>
      )}

      {/* Login error + attempts warning */}
      {!isLocked && error && (
        <View className="gap-1 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <Text className="text-sm text-red-700">{error}</Text>
          {attemptsRemaining !== null && attemptsRemaining > 0 && (
            <Text className="text-sm font-medium text-amber-700">
              Warning: {attemptsRemaining} attempt{attemptsRemaining !== 1 ? 's' : ''} remaining before lockout.
            </Text>
          )}
        </View>
      )}

      <Button
        onPress={handleSubmit}
        loading={isSubmitting}
        disabled={isLocked || isSubmitting || !identifier.trim() || !password.trim() || !!formatError}
      >
        {isSubmitting ? 'Logging in...' : 'Login'}
      </Button>
    </View>
  );
}
