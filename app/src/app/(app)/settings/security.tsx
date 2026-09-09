import { useEffect, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import {
  isBiometricEnabled,
  isBiometricSupported,
  setBiometricEnabled,
} from '@/lib/auth/biometric';
import { isWeakPin, setPin, verifyPin } from '@/lib/auth/pin';

export default function SecuritySettingsScreen() {
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricOn, setBiometricOn] = useState(false);

  const [stage, setStage] = useState<'current' | 'new'>('current');
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    isBiometricSupported().then(setBiometricSupported);
    isBiometricEnabled().then(setBiometricOn);
  }, []);

  async function handleToggleBiometric(value: boolean) {
    setBiometricOn(value);
    await setBiometricEnabled(value);
  }

  async function handleCheckCurrentPin() {
    setError(null);
    if (currentPin.length !== 6) {
      setError('Enter your current 6-digit PIN.');
      return;
    }
    const valid = await verifyPin(currentPin);
    if (!valid) {
      setError('Incorrect PIN.');
      return;
    }
    setStage('new');
  }

  async function handleSetNewPin() {
    setError(null);
    if (newPin.length !== 6 || confirmPin.length !== 6) {
      setError('Enter a 6-digit PIN.');
      return;
    }
    if (newPin !== confirmPin) {
      setError('PINs do not match.');
      return;
    }
    if (isWeakPin(newPin)) {
      setError('Choose a less predictable PIN.');
      return;
    }
    setSubmitting(true);
    await setPin(newPin);
    setSubmitting(false);
    setMessage('PIN updated.');
    setStage('current');
    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
  }

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['bottom']}>
        <View style={styles.content}>
          {biometricSupported ? (
            <View style={styles.row}>
              <ThemedText type="default">Use Face ID / Fingerprint</ThemedText>
              <Switch value={biometricOn} onValueChange={handleToggleBiometric} />
            </View>
          ) : null}

          <ThemedText type="subtitle">Change PIN</ThemedText>

          {stage === 'current' ? (
            <>
              <TextField
                label="Current PIN"
                value={currentPin}
                onChangeText={(t) => setCurrentPin(t.replace(/\D/g, '').slice(0, 6))}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={6}
                style={styles.pinInput}
              />
              <Button title="Continue" onPress={handleCheckCurrentPin} />
            </>
          ) : (
            <>
              <TextField
                label="New PIN"
                value={newPin}
                onChangeText={(t) => setNewPin(t.replace(/\D/g, '').slice(0, 6))}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={6}
                style={styles.pinInput}
              />
              <TextField
                label="Confirm New PIN"
                value={confirmPin}
                onChangeText={(t) => setConfirmPin(t.replace(/\D/g, '').slice(0, 6))}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={6}
                style={styles.pinInput}
              />
              <Button title="Save New PIN" onPress={handleSetNewPin} loading={submitting} />
            </>
          )}

          {error ? (
            <ThemedText type="small" themeColor="danger">
              {error}
            </ThemedText>
          ) : null}
          {message ? <ThemedText type="small">{message}</ThemedText> : null}
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pinInput: { fontSize: 24, letterSpacing: 8, textAlign: 'center' },
});
