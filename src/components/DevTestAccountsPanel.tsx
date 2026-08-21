/**
 * Dev-only panel on the login screen for seeding/reviewing the local test
 * accounts (see devSeed.ts). Renders nothing in a release build (__DEV__).
 */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { DEV_TEST_ACCOUNTS, seedDevTestAccounts } from '../services/devSeed';
import { Button } from './Button';

export function DevTestAccountsPanel() {
  const [expanded, setExpanded] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seeded, setSeeded] = useState(false);

  if (!__DEV__) return null;

  const handleSeed = async () => {
    setSeeding(true);
    try {
      await seedDevTestAccounts();
      setSeeded(true);
    } finally {
      setSeeding(false);
    }
  };

  return (
    <View className="mt-4 w-full max-w-sm">
      <Pressable onPress={() => setExpanded((v) => !v)} className="self-center">
        <Text className="text-xs font-medium text-amber-700">{expanded ? 'Hide' : 'Show'} dev test accounts</Text>
      </Pressable>

      {expanded && (
        <View className="mt-2 gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <Text className="text-xs text-amber-800">
            These only work while the login screen&rsquo;s online attempt fails to reach a backend (no server configured, or it&rsquo;s unreachable) — the app then falls
            back to this device&rsquo;s local offline-login cache.
          </Text>

          <Button onPress={handleSeed} loading={seeding} disabled={seeding}>
            {seeded ? 'Re-seed test accounts' : 'Seed test accounts'}
          </Button>
          {seeded && <Text className="text-center text-xs font-medium text-green-700">Seeded — try logging in with any account below.</Text>}

          <View className="gap-1.5">
            {DEV_TEST_ACCOUNTS.map((account) => (
              <View key={account.email} className="rounded-lg border border-amber-100 bg-white px-3 py-2">
                <Text className="text-xs font-bold text-gray-800">{account.label}</Text>
                <Text className="font-mono text-xs text-gray-600">{account.email}</Text>
                <Text className="font-mono text-xs text-gray-600">{account.password}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}
