import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

const RESEND_COOLDOWN_SECONDS = 30;

export default function VerifyPhoneScreen() {
  const { phone, mode } = useLocalSearchParams<{ phone: string; mode: 'create' | 'signin' }>();

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN_SECONDS);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  // On success, the Supabase session updates and the root layout's
  // Stack.Protected guards take over automatically (create-pin, or straight
  // to the app if a local PIN already exists on this device) — no manual
  // navigation needed here.
  async function handleVerify() {
    setError(null);
    if (code.length !== 6) {
      setError('Enter the 6-digit code.');
      return;
    }
    setVerifying(true);
    const { error: verifyError } = await supabase.auth.verifyOtp({
      phone,
      token: code,
      type: 'sms',
    });
    setVerifying(false);
    if (verifyError) {
      setError(verifyError.message);
    }
  }

  async function handleResend() {
    if (resendCooldown > 0) return;
    setError(null);
    const { error: resendError } = await supabase.auth.signInWithOtp({
      phone,
      options: { shouldCreateUser: mode === 'create' },
    });
    if (resendError) {
      setError(resendError.message);
      return;
    }
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
  }

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ThemedText type="default" themeColor="textSecondary">
            Enter the 6-digit code sent to {phone}
          </ThemedText>

          <TextField
            label="Verification Code"
            value={code}
            onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
            style={styles.codeInput}
          />

          {error ? (
            <ThemedText type="small" themeColor="danger">
              {error}
            </ThemedText>
          ) : null}

          <Button title="Verify" onPress={handleVerify} loading={verifying} />

          <Button
            title={resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : 'Resend code'}
            variant="secondary"
            disabled={resendCooldown > 0}
            onPress={handleResend}
          />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three },
  codeInput: { fontSize: 24, letterSpacing: 8, textAlign: 'center' },
});
