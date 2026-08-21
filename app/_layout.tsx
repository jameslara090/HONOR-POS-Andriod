import '../global.css';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router';
import { initApiConfig } from '../src/api/config';
import { AuthProvider, useAuthContext } from '../src/contexts/AuthContext';

function RootNavigator() {
  const { isAuthenticated, authChecking } = useAuthContext();

  if (authChecking) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#111827" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={isAuthenticated}>
        <Stack.Screen name="(pos)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [configReady, setConfigReady] = useState(false);

  useEffect(() => {
    void initApiConfig().finally(() => setConfigReady(true));
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="auto" />
        {configReady ? (
          <AuthProvider>
            <RootNavigator />
          </AuthProvider>
        ) : (
          <View className="flex-1 items-center justify-center bg-white">
            <ActivityIndicator size="large" color="#111827" />
          </View>
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
