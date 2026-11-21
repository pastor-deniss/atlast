import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Device-local Atlast PIN (ticket 07 / 14). Never touches the database —
 * only a SHA-256 hash lives in SecureStore, keyed per-device. Losing the
 * device or signing out wipes it (ticket 14, Q6).
 */
const PIN_HASH_KEY = 'thrive_pin_hash';

// A handful of trivially-guessable PINs rejected at Create PIN (ticket 14) —
// a UX nicety, not a security boundary (a 6-digit local PIN's real
// protection is the device lock + rate limiting, not entropy).
const WEAK_PINS = new Set([
  '000000',
  '111111',
  '123456',
  '654321',
  '112233',
  '121212',
]);

export function isWeakPin(pin: string): boolean {
  return WEAK_PINS.has(pin);
}

async function hashPin(pin: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, pin);
}

// SecureStore has no web implementation, and ticket 07 explicitly scoped the
// PIN/biometric AppLockGate as native-only — web skips the lock gate
// entirely (see AppLockProvider), so these are never called there in
// practice. Guarded anyway so nothing throws if that ever changes.
const isNative = Platform.OS !== 'web';

export async function hasPin(): Promise<boolean> {
  if (!isNative) return true;
  const hash = await SecureStore.getItemAsync(PIN_HASH_KEY);
  return hash !== null;
}

export async function setPin(pin: string): Promise<void> {
  if (!isNative) return;
  const hash = await hashPin(pin);
  await SecureStore.setItemAsync(PIN_HASH_KEY, hash);
}

export async function verifyPin(pin: string): Promise<boolean> {
  if (!isNative) return false; // unreachable in practice — unlock is skipped on web
  const stored = await SecureStore.getItemAsync(PIN_HASH_KEY);
  if (!stored) return false;
  const candidate = await hashPin(pin);
  return candidate === stored;
}

export async function clearPin(): Promise<void> {
  if (!isNative) return;
  await SecureStore.deleteItemAsync(PIN_HASH_KEY);
}
