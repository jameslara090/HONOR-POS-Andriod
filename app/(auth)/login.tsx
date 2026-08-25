/**
 * Login screen: a single centered card holding the sign-in form.
 */
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthContext } from '../../src/contexts/AuthContext';
import { LoginForm } from '../../src/components/LoginForm';
import { TOTPVerification } from '../../src/components/TOTPVerification';

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

  if (authChecking) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-mod-bg">
        <Text className="font-a text-[14px] text-mod-neutral-700">Loading…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-mod-bg">
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <View className="flex-1 items-center justify-center p-6">
            <View className="w-full max-w-[520px] gap-6 border-2 border-mod-ink bg-white p-8">
              <Text className="text-center font-a-display text-[20px] tracking-display text-mod-ink">HONOR POS</Text>

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
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
