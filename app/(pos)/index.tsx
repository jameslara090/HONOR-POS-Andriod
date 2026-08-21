import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthContext } from '../../src/contexts/AuthContext';
import { Button } from '../../src/components/Button';

export default function PosHomeScreen() {
  const { currentUser, loggedInOffline, handleLogout } = useAuthContext();

  return (
    <SafeAreaView className="flex-1 items-center justify-center bg-gray-100 p-6">
      <View className="w-full max-w-sm items-center gap-4 rounded-2xl bg-white p-8 shadow-lg">
        <Text className="text-2xl font-bold text-gray-900">Welcome, {currentUser?.name}</Text>
        <Text className="text-gray-500">{currentUser?.role.toUpperCase()}</Text>
        {loggedInOffline && (
          <Text className="text-center text-sm font-medium text-amber-600">
            Signed in offline — reconnect and sign in again to sync live data.
          </Text>
        )}
        <Text className="text-center text-gray-400">
          Product catalog, cart, and checkout land in the next phases of the Android port.
        </Text>
        <Button variant="outline" onPress={() => void handleLogout()}>
          Sign Out
        </Button>
      </View>
    </SafeAreaView>
  );
}
