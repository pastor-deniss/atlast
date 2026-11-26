import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card, Divider, icon, MenuRow, Screen, ScreenHeader } from '@/components/ui/screen';
import { Brand, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppLock } from '@/lib/auth/app-lock-context';
import { useSession } from '@/lib/auth/session-context';
import { signOutAndWipeLocalSecrets } from '@/lib/auth/sign-out';
import { fetchIsAtlastAdmin } from '@/lib/group-rules';
import { useLanguage, useT, type Language } from '@/lib/i18n';
import { useMembership } from '@/lib/membership-context';
import { supabase } from '@/lib/supabase';
import { useThemePreference, type ThemePreference } from '@/lib/theme-preference';

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
    <View style={[styles.segmented, { backgroundColor: theme.backgroundSelected }]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[styles.segment, selected && { backgroundColor: theme.primary }]}>
            <ThemedText type="smallBold" style={selected ? { color: theme.onPrimary } : undefined}>
              {option.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function MoreScreen() {
  const router = useRouter();
  const t = useT();
  const { session } = useSession();
  const { membership } = useMembership();
  const { refreshPinExists } = useAppLock();
  const { preference, setPreference } = useThemePreference();
  const { language, setLanguage } = useLanguage();
  const [fullName, setFullName] = useState<string | null>(null);
  const [isAtlast, setIsAtlast] = useState(false);

  const isAdmin = membership?.role === 'group_admin';
  const isActive = membership?.status === 'active';

  useEffect(() => {
    if (!session) return;
    supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => setFullName(data ? `${data.first_name} ${data.last_name}` : null));
    fetchIsAtlastAdmin(session.user.id).then(setIsAtlast);
  }, [session]);

  async function signOut() {
    await signOutAndWipeLocalSecrets();
    await refreshPinExists();
  }

  function confirmSignOut() {
    const message = t('You will need to verify your phone and set a new PIN next time.');
    // react-native-web has no Alert dialog, so the browser's own confirm is used there.
    if (Platform.OS === 'web') {
      if (window.confirm(message)) signOut();
      return;
    }
    Alert.alert(t('Sign Out'), message, [
      { text: t('Cancel'), style: 'cancel' },
      { text: t('Sign Out'), style: 'destructive', onPress: signOut },
    ]);
  }

  return (
    <Screen
      header={
        <ScreenHeader
          title={t('More')}
          subtitle={fullName ?? undefined}
          admin={isAdmin}
        />
      }>
      {isAtlast ? (
        <Card>
          <MenuRow
            iconName={icon('globe', 'public')}
            title={t('Atlast Console')}
            subtitle={t('Oversee every group: lock rules, run votes, read audit logs')}
            onPress={() => router.push('/(app)/atlast')}
          />
        </Card>
      ) : null}

      <Card>
        <MenuRow
          iconName={icon('bell', 'notifications')}
          title={t('Notifications')}
          subtitle={t('Votes, loans, announcements and complaints')}
          onPress={() => router.push('/(app)/notifications')}
        />
      </Card>

      {isActive ? (
        <Card>
          <MenuRow
            iconName={icon('building.columns', 'account_balance')}
            title={t('Loans')}
            subtitle={t('Apply, repay, interest and late penalties')}
            onPress={() => router.push('/(app)/loan')}
          />
          <Divider />
          <MenuRow
            iconName={icon('exclamationmark.bubble', 'report')}
            title={t('Complaints')}
            subtitle={isAdmin ? t('Member complaints to answer') : t('Report a problem with your records')}
            onPress={() => router.push('/(app)/complaints')}
          />          <Divider />
          <MenuRow
            iconName={icon('megaphone', 'campaign')}
            title={t('Announcements')}
            subtitle={isAdmin ? t('Send messages to members') : t('Messages from your group')}
            onPress={() => router.push('/(app)/announcements')}
          />
          <Divider />
          <MenuRow
            iconName={icon('doc.text', 'description')}
            title={t('Group Info')}
            subtitle={t('Group rules, your account statement and members')}
            onPress={() => router.push('/(app)/group-dashboard')}
          />
        </Card>
      ) : null}

      {isAdmin ? (
        <Card>
          <MenuRow
            iconName={icon('checkmark.shield', 'admin_panel_settings')}
            title={t('Admin Control Centre')}
            subtitle={t('Applications, loan decisions and actions')}
            onPress={() => router.push('/(app)/admin')}
          />
          <Divider />
          <MenuRow
            iconName={icon('chart.bar', 'bar_chart')}
            title={t('Reports')}
            subtitle={t('Monthly, quarterly and yearly reports')}
            onPress={() => router.push('/(app)/admin/reports')}
          />
          <Divider />
          <MenuRow
            iconName={icon('scalemass', 'balance')}
            title={t('Reconciliation')}
            subtitle={t('Compare the money held with the system')}
            onPress={() => router.push('/(app)/admin/reconciliation')}
          />          <Divider />
          <MenuRow
            iconName={icon('checkmark.rectangle', 'fact_check')}
            title={t('Transactions')}
            subtitle={t('Reconcile and correct the ledger')}
            onPress={() => router.push('/(app)/admin/transactions')}
          />
          <Divider />
          <MenuRow
            iconName={icon('list.bullet.rectangle', 'receipt_long')}
            title={t('Audit Log')}
            subtitle={t('Record of admin actions')}
            onPress={() => router.push('/(app)/admin/audit-log')}
          />
        </Card>
      ) : null}

      <Card>
        <MenuRow
          iconName={icon('person', 'person')}
          title={t('Profile')}
          subtitle={t('Your name')}
          onPress={() => router.push('/(app)/settings/profile')}
        />
        <Divider />
        <MenuRow
          iconName={icon('lock', 'lock')}
          title={t('Security')}
          subtitle={t('PIN and Face ID / Fingerprint')}
          onPress={() => router.push('/(app)/settings/security')}
        />
      </Card>

      <Card>
        <ThemedText type="small" themeColor="textSecondary">
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
        <ThemedText type="small" themeColor="textSecondary" style={styles.spacedLabel}>
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
      </Card>

      <Pressable
        accessibilityRole="button"
        onPress={confirmSignOut}
        style={({ pressed }) => [styles.signOut, { opacity: pressed ? 0.75 : 1 }]}>
        <SymbolView
          name={icon('rectangle.portrait.and.arrow.right', 'logout')}
          size={20}
          tintColor={Brand.danger}
        />
        <ThemedText type="smallBold" style={styles.signOutText}>
          {t('Sign Out')}
        </ThemedText>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  segmented: { flexDirection: 'row', borderRadius: 12, padding: Spacing.half, gap: Spacing.half },
  segment: { flex: 1, alignItems: 'center', paddingVertical: Spacing.two, borderRadius: 10 },
  spacedLabel: { marginTop: Spacing.two },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.45)',
    backgroundColor: 'rgba(220, 38, 38, 0.06)',
  },
  signOutText: { color: Brand.danger, fontSize: 16 },
});
