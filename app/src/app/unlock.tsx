import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AtlastLogo } from '@/components/atlast-logo';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useAppLock } from '@/lib/auth/app-lock-context';
import { authenticateWithBiometric, isBiometricEnabled } from '@/lib/auth/biometric';
import { verifyPin } from '@/lib/auth/pin';

export default function UnlockScreen() {
  const router = useRouter();
  const { unlock } = useAppLock();

  const [pin, setPinValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [biometricReady, setBiometricReady] = useState(false);

  useEffect(() => {
    isBiometricEnabled().then((enabled) => {
      setBiometricReady(enabled);
      if (enabled) tryBiometric();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function tryBiometric() {
    const success = await authenticateWithBiometric();
    if (success) unlock();
  }

  async function handleUnlock() {
    setError(null);
    if (pin.length !== 6) {
      setError('Enter your 6-digit PIN.');
      return;
    }
    setChecking(true);
    const valid = await verifyPin(pin);
    setChecking(false);
    if (!valid) {
      setError('Incorrect PIN.');
      setPinValue('');
      return;
    }
    unlock();
  }

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <AtlastLogo width={180} />
          <ThemedText type="default" themeColor="textSecondary">
            Enter your PIN to continue
          </ThemedText>

          <TextField
            label="PIN"
            value={pin}
            onChangeText={(t) => setPinValue(t.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={6}
            autoFocus
            style={styles.pinInput}
          />

          {error ? (
            <ThemedText type="small" themeColor="danger">
              {error}
            </ThemedText>
          ) : null}

          <Button title="Unlock" onPress={handleUnlock} loading={checking} />

          {biometricReady ? (
            <Button title="Use Face ID / Fingerprint" variant="secondary" onPress={tryBiometric} />
          ) : null}

          <Pressable style={styles.forgot} onPress={() => router.push('/forgot-pin')}>
            <ThemedText type="link" themeColor="primary">
              Forgot PIN?
            </ThemedText>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: Spacing.four, gap: Spacing.three },
  pinInput: { fontSize: 24, letterSpacing: 8, textAlign: 'center' },
  forgot: { alignItems: 'center', marginTop: Spacing.two },
});
