/**
 * Minimal store/register resolution for Phase 2. The desktop has a full
 * multi-store selector + TerminalConfigModal (planned for this repo's Phase
 * 5) — until that exists, this generates and persists a per-device register
 * id once, and reads a single default store id from env, so shift/catalog
 * calls have stable values to key offline state on.
 */
import * as SecureStore from 'expo-secure-store';

const REGISTER_ID_KEY = 'pos_register_id';
const DEFAULT_STORE_ID = Number(process.env.EXPO_PUBLIC_DEFAULT_STORE_ID ?? '1');

let cachedRegisterId: string | null = null;

function randomRegisterSuffix(): string {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

export async function getRegisterId(): Promise<string> {
  if (cachedRegisterId) return cachedRegisterId;
  const stored = await SecureStore.getItemAsync(REGISTER_ID_KEY);
  if (stored) {
    cachedRegisterId = stored;
    return stored;
  }
  const generated = `REG-${randomRegisterSuffix()}`;
  await SecureStore.setItemAsync(REGISTER_ID_KEY, generated);
  cachedRegisterId = generated;
  return generated;
}

export function getDefaultStoreId(): number {
  return DEFAULT_STORE_ID;
}
