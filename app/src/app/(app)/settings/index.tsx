import { useRouter } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppLock } from '@/lib/auth/app-lock-context';
import { signOutAndWipeLocalSecrets } from '@/lib/auth/sign-out';
import { useLanguage, useT, type Language } from '@/lib/i18n';
import { useThemePreference, type ThemePreference } from '@/lib/theme-preference';

function SettingsRow({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText type="default">{label}</ThemedText>
      <ThemedText type="default" themeColor="textSecondary">
        {'>'}
      </ThemedText>
    </Pressable>
  );
}

/** A row of equal-width buttons where exactly one is selected. */
function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: theme.backgroundElement }]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[styles.segment, selected && { backgroundColor: theme.primary }]}>
            <ThemedText type="smallBold" style={selected ? styles.segmentSelectedText : undefined}>
              {option.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function SettingsScreen() {
  const t = useT();
  const { preference, setPreference } = useThemePreference();
  const { language, setLanguage } = useLanguage();
  const router = useRouter();
  const { refreshPinExists } = useAppLock();

  function confirmSignOut() {
    Alert.alert(t('Sign Out'), t('You will need to verify your phone and set a new PIN next time.'), [
      { text: t('Cancel'), style: 'cancel' },
      {
        text: t('Sign Out'),
        style: 'destructive',
        onPress: async () => {
          await signOutAndWipeLocalSecrets();
          await refreshPinExists();
        },
      },
    ]);
  }

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <SettingsRow label={t('Profile')} onPress={() => router.push('/(app)/settings/profile')} />
          <SettingsRow label={t('Security')} onPress={() => router.push('/(app)/settings/security')} />

          <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
            {t('Appearance')}
          </ThemedText>
          <Segmented<ThemePreference>
            value={preference}
            onChange={setPreference}
            options={[
              { value: 'light', label: t('Light') },
              { value: 'dark', label: t('Dark') },
              { value: 'system', label: t('Match phone') },
            ]}
          />

          <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
            {t('Language')}
          </ThemedText>
          <Segmented<Language>
            value={language}
            onChange={setLanguage}
            options={[
              { value: 'en', label: 'English' },
              { value: 'sw', label: 'Kiswahili' },
            ]}
          />

          <View style={styles.spacer} />
          <Button title={t('Sign Out')} variant="danger" onPress={confirmSignOut} />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.two },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: 10,
  },
  spacer: { height: Spacing.four },
  sectionLabel: { marginTop: Spacing.three },
  segmented: { flexDirection: 'row', borderRadius: 10, padding: Spacing.half, gap: Spacing.half },
  segment: { flex: 1, alignItems: 'center', paddingVertical: Spacing.two, borderRadius: 8 },
  segmentSelectedText: { color: '#ffffff' },
});
