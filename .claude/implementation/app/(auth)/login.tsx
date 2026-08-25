/**
 * Login screen. On tablet the terminal's identity becomes a red poster panel
 * beside the form — store, register, connection and printer, the four things a
 * cashier checks before opening the register. On phone the panel collapses to a
 * header band above the form.
 */
import { KeyboardAvoidingView, Platform, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthContext } from '../../src/contexts/AuthContext';
import { LoginForm } from '../../src/components/LoginForm';
import { TOTPVerification } from '../../src/components/TOTPVerification';
import { DevTestAccountsPanel } from '../../src/components/DevTestAccountsPanel';
import { getDefaultStoreInfo } from '../../src/services/terminalConfig';

const WIDE_LAYOUT_MIN_WIDTH = 700;

function TerminalFact({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text className="font-a-semi text-[11px] tracking-label text-white/80">{label}</Text>
      <Text className="mt-0.5 font-a text-[13px] text-white">{value}</Text>
    </View>
  );
}

export default function LoginScreen() {
  const {
    authChecking,
    loginError,
    lockoutSeconds,
    attemptsRemaining,
    handleLogin,
    handleLockoutDetected,
    pendingUser,
    pendingTotpSecret,
    completeTOTPVerification,
    cancelTOTPVerification,
  } = useAuthContext();
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_LAYOUT_MIN_WIDTH;

  // The register is only known once a shift is open, so pre-auth the poster
  // shows what terminalConfig actually has: store name and location.
  const store = getDefaultStoreInfo();

  if (authChecking) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-mod-bg">
        <Text className="font-a text-[14px] text-mod-neutral-700">Loading…</Text>
      </SafeAreaView>
    );
  }

  const poster = (
    <View className={isWide ? 'w-[480px] bg-mod-accent p-8' : 'bg-mod-accent px-4 pb-8 pt-6'}>
      <Text className="font-a-display text-[22px] tracking-display text-white">HONOR POS</Text>
      {isWide && <View className="flex-1" />}
      <Text className={`font-a-display text-white ${isWide ? 'mt-8 text-[46px] leading-[48px]' : 'mt-6 text-[32px] leading-[35px]'}`}>
        Sign in to open the register.
      </Text>
      <View className="mt-6 h-0.5 bg-white/40" />
      <View className="mt-4 flex-row flex-wrap gap-x-8 gap-y-4">
        <TerminalFact label="STORE" value={store.name} />
        <TerminalFact label="LOCATION" value={store.location} />
      </View>
    </View>
  );

  const form = (
    <View className={isWide ? 'flex-1 justify-center p-8' : 'p-4'}>
      {pendingUser && pendingTotpSecret ? (
        <TOTPVerification secret={pendingTotpSecret} onVerify={completeTOTPVerification} onCancel={() => void cancelTOTPVerification()} />
      ) : (
        <LoginForm
          onLogin={handleLogin}
          error={loginError}
          lockoutSeconds={lockoutSeconds}
          attemptsRemaining={attemptsRemaining}
          onLockoutDetected={handleLockoutDetected}
        />
      )}
      {!pendingUser && <DevTestAccountsPanel />}
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-mod-bg" edges={isWide ? ['top', 'bottom'] : ['bottom']}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {isWide ? (
          <View className="flex-1 flex-row">
            {poster}
            {form}
          </View>
        ) : (
          <ScrollView keyboardShouldPersistTaps="handled">
            {poster}
            {form}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
