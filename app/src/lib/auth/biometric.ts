import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const BIOMETRIC_ENABLED_KEY = 'thrive_biometric_enabled';
const isNative = Platform.OS !== 'web';

export async function isBiometricSupported(): Promise<boolean> {
  if (!isNative) return false; // SecureStore/LocalAuthentication are native-only (ticket 07)
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  if (!hasHardware) return false;
  return LocalAuthentication.isEnrolledAsync();
}

export async function isBiometricEnabled(): Promise<boolean> {
  if (!isNative) return false;
  const flag = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);
  return flag === 'true';
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  if (!isNative) return;
  if (enabled) {
    await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, 'true');
  } else {
    await SecureStore.deleteItemAsync(BIOMETRIC_ENABLED_KEY);
  }
}

export async function authenticateWithBiometric(promptMessage = 'Unlock AtLast'): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage,
    disableDeviceFallback: true, // PIN fallback is AtLast's own screen, not the OS passcode
  });
  return result.success;
}
