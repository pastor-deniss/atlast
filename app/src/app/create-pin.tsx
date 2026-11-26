import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useAppLock } from '@/lib/auth/app-lock-context';
import { isBiometricSupported, setBiometricEnabled } from '@/lib/auth/biometric';
import { isWeakPin, setPin } from '@/lib/auth/pin';
import { useT } from '@/lib/i18n';

export default function CreatePinScreen() {
  const { completePinSetup } = useAppLock();
  const t = useT();

  const [pin, setPinValue] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricToggle, setBiometricToggle] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    isBiometricSupported().then(setBiometricAvailable);
  }, []);

  async function handleNext() {
    setError(null);

    if (pin.length !== 6 || confirmPin.length !== 6) {
      setError('Enter a 6-digit PIN.');
      return;
    }
    if (pin !== confirmPin) {
      setError('PINs do not match.');
      return;
    }
    if (isWeakPin(pin)) {
      setError('Choose a less predictable PIN.');
      return;
    }

    setSubmitting(true);
    await setPin(pin);
    if (biometricAvailable && biometricToggle) {
      await setBiometricEnabled(true);
    }
    setSubmitting(false);

    completePinSetup();
  }

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ThemedText type="title">{t('Create Your Atlast PIN')}</ThemedText>
          <ThemedText type="default" themeColor="textSecondary">
            {t('This unlocks Atlast on this device — separate from your phone verification.')}
          </ThemedText>

          <TextField
            label={t('Enter a 6-digit PIN')}
            value={pin}
            onChangeText={(v) => setPinValue(v.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={6}
            style={styles.pinInput}
          />
          <TextField
            label={t('Confirm PIN')}
            value={confirmPin}
            onChangeText={(v) => setConfirmPin(v.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={6}
            style={styles.pinInput}
          />

          {biometricAvailable ? (
            <View style={styles.row}>
              <ThemedText type="default">{t('Use Face ID / Fingerprint')}</ThemedText>
              <Switch value={biometricToggle} onValueChange={setBiometricToggle} />
            </View>
          ) : null}

          {error ? (
            <ThemedText type="small" themeColor="danger">
              {t(error)}
            </ThemedText>
          ) : null}

          <Button title={t('Next')} onPress={handleNext} loading={submitting} />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three },
  pinInput: { fontSize: 24, letterSpacing: 8, textAlign: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
