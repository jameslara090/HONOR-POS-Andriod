import { Stack } from 'expo-router';
import { useAuthContext } from '../../src/contexts/AuthContext';
import { SessionLockScreen } from '../../src/components/SessionLockScreen';

export default function PosLayout() {
  const { isLocked } = useAuthContext();

  if (isLocked) {
    return <SessionLockScreen />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
