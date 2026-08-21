import { Stack } from 'expo-router';
import { useAuthContext } from '../../src/contexts/AuthContext';
import { SessionLockModal } from '../../src/components/SessionLockModal';

export default function PosLayout() {
  const { isLocked, currentUser, unlock } = useAuthContext();

  if (isLocked) {
    return <SessionLockModal userName={currentUser?.name ?? ''} onUnlock={unlock} forcedLogoutAfterMinutes={180} />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
