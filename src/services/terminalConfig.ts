/**
 * Store/register/terminal resolution. Auto-generates and persists a per-device
 * register id once (so shift/catalog calls have a stable value to key offline
 * state on), settable via Phase 5's TerminalConfigModal — ported from the
 * desktop's TerminalConfigModal.tsx, which stores the equivalent fields in
 * localStorage. A single default store id is still read from env; no
 * multi-store selector is built yet (out of Phase 5's scope — see memory).
 */
import * as SecureStore from 'expo-secure-store';

const REGISTER_ID_KEY = 'pos_register_id';
const POS_SERIAL_NUMBER_KEY = 'pos_serial_number';
const MIN_NUMBER_KEY = 'pos_min_number';
const DEFAULT_STORE_ID = Number(process.env.EXPO_PUBLIC_DEFAULT_STORE_ID ?? '1');
const DEFAULT_STORE_NAME = process.env.EXPO_PUBLIC_DEFAULT_STORE_NAME ?? 'HONOR POS';
const DEFAULT_STORE_LOCATION = process.env.EXPO_PUBLIC_DEFAULT_STORE_LOCATION ?? '';

let cachedRegisterId: string | null = null;
let cachedPosSerialNumber: string | null = null;
let cachedMinNumber: string | null = null;

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

/** Lets an admin override the auto-generated register id (TerminalConfigModal). */
export async function setRegisterId(value: string): Promise<void> {
  cachedRegisterId = value;
  await SecureStore.setItemAsync(REGISTER_ID_KEY, value);
}

export async function getPosSerialNumber(): Promise<string> {
  if (cachedPosSerialNumber !== null) return cachedPosSerialNumber;
  cachedPosSerialNumber = (await SecureStore.getItemAsync(POS_SERIAL_NUMBER_KEY)) ?? '';
  return cachedPosSerialNumber;
}

export async function setPosSerialNumber(value: string): Promise<void> {
  cachedPosSerialNumber = value;
  await SecureStore.setItemAsync(POS_SERIAL_NUMBER_KEY, value);
}

export async function getMinNumber(): Promise<string> {
  if (cachedMinNumber !== null) return cachedMinNumber;
  cachedMinNumber = (await SecureStore.getItemAsync(MIN_NUMBER_KEY)) ?? '';
  return cachedMinNumber;
}

export async function setMinNumber(value: string): Promise<void> {
  cachedMinNumber = value;
  await SecureStore.setItemAsync(MIN_NUMBER_KEY, value);
}

export function getDefaultStoreId(): number {
  return DEFAULT_STORE_ID;
}

/** No company/store-info API is ported yet (out of scope so far) — receipts use this env-configured name/location until a real multi-store selection lands. */
export function getDefaultStoreInfo(): { name: string; location: string } {
  return { name: DEFAULT_STORE_NAME, location: DEFAULT_STORE_LOCATION };
}
