import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { COUNTRIES, isValidE164, toE164, type CountryCode } from '@/lib/phone';
import { supabase } from '@/lib/supabase';

export default function SignInScreen() {
  const router = useRouter();
  const theme = useTheme();

  const [localNumber, setLocalNumber] = useState('');
  const [countryCode, setCountryCode] = useState<CountryCode>('TZ');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const country = COUNTRIES.find((c) => c.code === countryCode)!;
  const phone = toE164(country.dialCode, localNumber);

  async function handleContinue() {
    setError(null);

    if (!isValidE164(phone)) {
      setError('Enter a valid phone number.');
      return;
    }

    setSubmitting(true);
    // shouldCreateUser: false (ticket 14, Q1) — Sign In never provisions a
    // new account; only Create Account does that.
    const { error: otpError } = await supabase.auth.signInWithOtp({
      phone,
      options: { shouldCreateUser: false },
    });
    setSubmitting(false);

    if (otpError) {
      const notFound = /user not found|signups not allowed/i.test(otpError.message);
      setError(
        notFound
          ? 'No Thrive account found for this number. Create an account instead?'
          : otpError.message
      );
      return;
    }

    router.push({
      pathname: '/(auth)/verify-phone',
      params: { phone, mode: 'signin' },
    });
  }

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.field}>
            <ThemedText type="small" themeColor="textSecondary">
              Country
            </ThemedText>
            <View style={styles.chipRow}>
              {COUNTRIES.map((c) => {
                const selected = c.code === countryCode;
                return (
                  <Pressable
                    key={c.code}
                    onPress={() => setCountryCode(c.code)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: selected ? theme.primary : theme.backgroundElement,
                        borderColor: selected ? theme.primary : theme.backgroundSelected,
                      },
                    ]}>
                    <ThemedText type="small" style={{ color: selected ? '#fff' : theme.text }}>
                      {c.name} ({c.dialCode})
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <TextField
            label="Phone Number"
            value={localNumber}
            onChangeText={setLocalNumber}
            keyboardType="phone-pad"
            autoComplete="tel"
            placeholder="712 345 678"
            hint={`Will be sent as ${phone || country.dialCode}`}
          />

          {error ? (
            <View style={styles.errorBlock}>
              <ThemedText type="small" themeColor="danger">
                {error}
              </ThemedText>
              {/^No Thrive account/.test(error) ? (
                <Pressable onPress={() => router.replace('/(auth)/create-account')}>
                  <ThemedText type="link" themeColor="primary">
                    Create Account
                  </ThemedText>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <Button title="Continue" onPress={handleContinue} loading={submitting} />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three },
  field: { gap: Spacing.one },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  chip: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  errorBlock: { gap: Spacing.one },
});
