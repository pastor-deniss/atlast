import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useAppLock } from '@/lib/auth/app-lock-context';
import { useSession } from '@/lib/auth/session-context';
import { clearPin } from '@/lib/auth/pin';
import { supabase } from '@/lib/supabase';
import { useT } from '@/lib/i18n';

// Ticket 14, Q3: recovery is phone + OTP re-verification — the same identity
// factor Supabase Auth already trusts — then straight into Create PIN.
// No separate recovery infrastructure.
export default function ForgotPinScreen() {
  const { session } = useSession();
  const { refreshPinExists } = useAppLock();
  const t = useT();
  const phone = session?.user.phone ? `+${session.user.phone}` : '';

  const [step, setStep] = useState<'request' | 'verify'>('request');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSendCode() {
    setError(null);
    setSubmitting(true);
    const { error: otpError } = await supabase.auth.signInWithOtp({
      phone,
      options: { shouldCreateUser: false },
    });
    setSubmitting(false);
    if (otpError) {
      setError(otpError.message);
      return;
    }
    setStep('verify');
  }

  async function handleVerify() {
    setError(null);
    if (code.length !== 6) {
      setError('Enter the 6-digit code.');
      return;
    }
    setSubmitting(true);
    const { error: verifyError } = await supabase.auth.verifyOtp({
      phone,
      token: code,
      type: 'sms',
    });
    if (verifyError) {
      setSubmitting(false);
      setError(verifyError.message);
      return;
    }

    // Old PIN invalidated (Q3); pinExists flips false, so the root layout's
    // guard sends us straight to Create PIN.
    await clearPin();
    await refreshPinExists();
    setSubmitting(false);
  }

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ThemedText type="title">{t('Forgot PIN')}</ThemedText>

          {step === 'request' ? (
            <>
              <ThemedText type="default" themeColor="textSecondary">
                {t("We'll send a verification code to {phone} to confirm it's you.", { phone })}
              </ThemedText>
              {error ? (
                <ThemedText type="small" themeColor="danger">
                  {t(error)}
                </ThemedText>
              ) : null}
              <Button title={t('Send Code')} onPress={handleSendCode} loading={submitting} />
            </>
          ) : (
            <>
              <ThemedText type="default" themeColor="textSecondary">
                {t('Enter the 6-digit code sent to {phone}', { phone })}
              </ThemedText>
              <TextField
                label={t('Verification Code')}
                value={code}
                onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
                style={styles.codeInput}
              />
              {error ? (
                <ThemedText type="small" themeColor="danger">
                  {t(error)}
                </ThemedText>
              ) : null}
              <Button title={t('Verify')} onPress={handleVerify} loading={submitting} />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: Spacing.four, gap: Spacing.three },
  codeInput: { fontSize: 24, letterSpacing: 8, textAlign: 'center' },
});
