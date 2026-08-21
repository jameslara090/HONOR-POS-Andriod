import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthContext } from '../../src/contexts/AuthContext';
import { LoginForm } from '../../src/components/LoginForm';
import { TOTPVerification } from '../../src/components/TOTPVerification';
import { DevTestAccountsPanel } from '../../src/components/DevTestAccountsPanel';

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
      <SafeAreaView className="flex-1 items-center justify-center bg-gray-100">
        <Text className="text-gray-600">Loading…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-100">
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="flex-1 items-center justify-center p-6" keyboardShouldPersistTaps="handled">
          <View className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg">
            <View className="mb-8 items-center">
              <Text className="text-2xl font-bold text-gray-900">HONOR POS</Text>
              {!pendingUser && <Text className="mt-1 text-gray-500">Sign in to continue</Text>}
            </View>

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

          {!pendingUser && <DevTestAccountsPanel />}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
