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
import { useT } from '@/lib/i18n';
import { COUNTRIES, isValidE164, toE164, type CountryCode } from '@/lib/phone';
import { supabase } from '@/lib/supabase';

export default function CreateAccountScreen() {
  const router = useRouter();
  const theme = useTheme();
  const t = useT();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [localNumber, setLocalNumber] = useState('');
  const [countryCode, setCountryCode] = useState<CountryCode>('TZ');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const country = COUNTRIES.find((c) => c.code === countryCode)!;
  const phone = toE164(country.dialCode, localNumber);

  async function handleContinue() {
    setError(null);

    if (!firstName.trim() || !lastName.trim()) {
      setError('Enter your first and last name.');
      return;
    }
    if (!isValidE164(phone)) {
      setError('Enter a valid phone number.');
      return;
    }

    setSubmitting(true);
    // Metadata carries the name through to the handle_new_user trigger,
    // since the profiles row can't exist until auth.users does (ticket 14).
    const { error: otpError } = await supabase.auth.signInWithOtp({
      phone,
      options: {
        shouldCreateUser: true,
        data: { first_name: firstName.trim(), last_name: lastName.trim() },
      },
    });
    setSubmitting(false);

    if (otpError) {
      setError(otpError.message);
      return;
    }

    router.push({
      pathname: '/(auth)/verify-phone',
      params: { phone, mode: 'create' },
    });
  }

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <TextField label={t('First Name')} value={firstName} onChangeText={setFirstName} autoComplete="given-name" />
          <TextField label={t('Last Name')} value={lastName} onChangeText={setLastName} autoComplete="family-name" />

          <View style={styles.field}>
            <ThemedText type="small" themeColor="textSecondary">
              {t('Country')}
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
                    <ThemedText type="small" style={{ color: selected ? theme.onPrimary : theme.text }}>
                      {c.name} ({c.dialCode})
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <TextField
            label={t('Phone Number')}
            value={localNumber}
            onChangeText={setLocalNumber}
            keyboardType="phone-pad"
            autoComplete="tel"
            placeholder="712 345 678"
            hint={t('Will be sent as {phone}', { phone: phone || country.dialCode })}
          />

          {error ? (
            <ThemedText type="small" themeColor="danger">
              {t(error)}
            </ThemedText>
          ) : null}

          <Button title={t('Continue')} onPress={handleContinue} loading={submitting} />
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
});
