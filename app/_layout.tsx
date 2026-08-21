import '../global.css';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { initApiConfig } from '../src/api/config';
import { initTotpSecrets } from '../src/services/authService';
import { AuthProvider, useAuthContext } from '../src/contexts/AuthContext';
import { CatalogProvider } from '../src/contexts/CatalogContext';
import { CartProvider } from '../src/contexts/CartContext';
import { registerBackgroundSync } from '../src/services/backgroundSync';
import { HONOR_BRAND_FONTS } from '../src/fonts';

void SplashScreen.preventAutoHideAsync();

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
  const [fontsLoaded, fontError] = useFonts(HONOR_BRAND_FONTS);
  const ready = configReady && (fontsLoaded || !!fontError);

  useEffect(() => {
    void Promise.all([initApiConfig(), initTotpSecrets()]).finally(() => setConfigReady(true));
    void registerBackgroundSync();
  }, []);

  const onLayoutRootView = useCallback(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }} onLayout={onLayoutRootView}>
      <SafeAreaProvider>
        <StatusBar style="auto" />
        <AuthProvider>
          <CatalogProvider>
            <CartProvider>
              <RootNavigator />
            </CartProvider>
          </CatalogProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
