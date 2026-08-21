import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useAuthContext } from '../contexts/AuthContext';
import { Button } from './Button';

/**
 * Minimal idle-lock gate — re-proves the current user's password after the
 * app has been backgrounded for a while. The full PIN-pad SessionLockModal
 * (matching the desktop) is planned for a later phase.
 */
export function SessionLockScreen() {
  const { currentUser, unlock, handleLogout } = useAuthContext();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const handleUnlock = async () => {
    if (!password.trim()) return;
    setSubmitting(true);
    setError(undefined);
    const result = await unlock(password.trim());
    setSubmitting(false);
    if (!result.success) {
      setError(result.message);
      setPassword('');
      return;
    }
    setPassword('');
  };

  return (
    <SafeAreaView className="flex-1 items-center justify-center bg-gray-900 p-6">
      <View className="w-full max-w-sm items-center gap-6 rounded-2xl bg-white p-8">
        <Feather name="lock" size={32} color="#111827" />
        <View className="items-center gap-1">
          <Text className="text-xl font-bold text-gray-900">Session Locked</Text>
          <Text className="text-center text-gray-500">{currentUser?.name ?? 'Enter your password to continue'}</Text>
        </View>

        <View className="w-full flex-row items-center rounded-lg border border-gray-300 bg-white px-3">
          <Feather name="lock" size={18} color="#9CA3AF" />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            secureTextEntry
            autoFocus
            editable={!submitting}
            onSubmitEditing={() => void handleUnlock()}
            className="ml-2 flex-1 py-3 text-base text-gray-900"
          />
        </View>

        {error ? <Text className="text-sm text-red-600">{error}</Text> : null}

        <Button onPress={() => void handleUnlock()} loading={submitting} disabled={submitting || !password.trim()}>
          {submitting ? 'Unlocking...' : 'Unlock'}
        </Button>
        <Button variant="outline" onPress={() => void handleLogout()} disabled={submitting}>
          Sign Out
        </Button>
      </View>
    </SafeAreaView>
  );
}
