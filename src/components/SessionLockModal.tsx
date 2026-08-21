/**
 * Idle-lock screen — ported from the desktop's SessionLockModal.tsx. Unlocks
 * by re-entering the signed-in user's own ID (not their password) — see
 * useAuth's `unlock`, which matches the desktop's handleUnlock/unlockLocally.
 */
import { useEffect, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Button } from './Button';

interface SessionLockModalProps {
  userName: string;
  onUnlock: (userId: string) => Promise<{ success: boolean; message?: string }>;
  /** Shown on the lock screen; must match SESSION_LOCKED_FORCE_LOGOUT_MS in useAuth.ts. */
  forcedLogoutAfterMinutes?: number;
}

export function SessionLockModal({ userName, onUnlock, forcedLogoutAfterMinutes }: SessionLockModalProps) {
  const [userId, setUserId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<TextInput | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async () => {
    if (!userId.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await onUnlock(userId.trim());
      if (!result.success) {
        setError(result.message ?? 'Incorrect User ID.');
        setUserId('');
        inputRef.current?.focus();
      }
    } catch {
      setError('Could not verify. Check your connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 items-center justify-center bg-gray-900 p-6">
      <View className="mb-6 h-16 w-16 items-center justify-center rounded-full border border-gray-700 bg-gray-800">
        <Feather name="lock" size={28} color="#9CA3AF" />
      </View>

      <Text className="mb-1 text-xl font-semibold text-white">Session Locked</Text>
      <Text className={`max-w-sm px-4 text-center text-sm text-gray-400 ${forcedLogoutAfterMinutes ? 'mb-2' : 'mb-8'}`}>
        Locked due to inactivity. Enter your User ID to resume.
      </Text>
      {!!forcedLogoutAfterMinutes && (
        <Text className="mb-8 max-w-sm px-4 text-center text-xs text-gray-500">
          You will be signed out automatically after {forcedLogoutAfterMinutes} minute{forcedLogoutAfterMinutes === 1 ? '' : 's'} on this screen.
        </Text>
      )}

      <View className="w-full max-w-xs gap-3">
        <View>
          <Text className="mb-1 text-xs font-medium uppercase tracking-wider text-gray-400">User ID</Text>
          <TextInput
            ref={inputRef}
            value={userId}
            onChangeText={(v) => {
              setUserId(v.toUpperCase());
              setError(null);
            }}
            onSubmitEditing={() => void handleSubmit()}
            placeholder="Enter your user ID"
            placeholderTextColor="#52525B"
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!loading}
            className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-center text-lg tracking-widest text-white"
          />
        </View>

        {error && <Text className="text-center text-sm text-red-400">{error}</Text>}

        <Button onPress={handleSubmit} loading={loading} disabled={loading || !userId.trim()}>
          {loading ? 'Verifying...' : 'Unlock'}
        </Button>
      </View>

      <Text className="mt-8 text-xs text-gray-600">
        Logged in as <Text className="text-gray-500">{userName}</Text>
      </Text>
    </SafeAreaView>
  );
}
