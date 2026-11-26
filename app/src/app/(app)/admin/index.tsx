import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useMembership } from '@/lib/membership-context';
import { supabase } from '@/lib/supabase';
import { useT } from '@/lib/i18n';

type PendingMembership = { id: string; name: string };
type FallbackLoan = { id: string; name: string; principal: number };
type OpenCase = { id: string; provider: string; provider_amount: number };
type DefaultedLoan = { id: string; name: string; principal: number };

function NavRow({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.navRow, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText type="default">{label}</ThemedText>
      <ThemedText type="default" themeColor="textSecondary">
        {'>'}
      </ThemedText>
    </Pressable>
  );
}

// Ticket 19: the mockup's "4 Actions Required" queue -- a client-side merge
// of three targeted reads (pending memberships, admin-fallback loans,
// investigate reconciliation cases), no new table. Defaults are
// informational only (ticket 10 Q6's manual-flagging stance means there's no
// "resolve this default" workflow). Priority order matches the ticket's
// answer: memberships -> admin-fallback loans -> reconciliation cases ->
// default alerts.
export default function AdminControlCentreScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { group, membership } = useMembership();
  const t = useT();

  const [pendingMemberships, setPendingMemberships] = useState<PendingMembership[]>([]);
  const [fallbackLoans, setFallbackLoans] = useState<FallbackLoan[]>([]);
  const [openCases, setOpenCases] = useState<OpenCase[]>([]);
  const [defaultedLoans, setDefaultedLoans] = useState<DefaultedLoan[]>([]);
  const [loading, setLoading] = useState(true);

  const isAdmin = membership?.role === 'group_admin';

  const load = useCallback(async () => {
    if (!group || !isAdmin) return;
    setLoading(true);

    const { data: pendingRows } = await supabase
      .from('memberships')
      .select('id, user_id')
      .eq('group_id', group.id)
      .eq('status', 'pending');
    const { data: motionsForPending } = await supabase
      .from('motions')
      .select('subject_membership_id')
      .in('subject_membership_id', (pendingRows ?? []).map((m) => m.id));
    const alreadyRaised = new Set((motionsForPending ?? []).map((m) => m.subject_membership_id));
    const preScreen = (pendingRows ?? []).filter((m) => !alreadyRaised.has(m.id));
    const preScreenUserIds = preScreen.map((m) => m.user_id);
    const { data: preScreenProfiles } =
      preScreenUserIds.length > 0
        ? await supabase.from('profiles_public').select('id, first_name, last_name').in('id', preScreenUserIds)
        : { data: [] };
    const preScreenNameById = new Map(
      (preScreenProfiles ?? []).map((p) => [p.id, `${p.first_name} ${p.last_name}`])
    );
    setPendingMemberships(
      preScreen.map((m) => ({ id: m.id, name: preScreenNameById.get(m.user_id) ?? 'Applicant' }))
    );

    const { data: fallbackRows } = await supabase
      .from('loans')
      .select('id, borrower_id, principal')
      .eq('group_id', group.id)
      .eq('review_mode', 'admin_fallback')
      .eq('status', 'pending_review');
    const fallbackUserIds = (fallbackRows ?? []).map((l) => l.borrower_id);
    const { data: fallbackProfiles } =
      fallbackUserIds.length > 0
        ? await supabase.from('profiles_public').select('id, first_name, last_name').in('id', fallbackUserIds)
        : { data: [] };
    const fallbackNameById = new Map(
      (fallbackProfiles ?? []).map((p) => [p.id, `${p.first_name} ${p.last_name}`])
    );
    setFallbackLoans(
      (fallbackRows ?? []).map((l) => ({
        id: l.id,
        name: fallbackNameById.get(l.borrower_id) ?? 'Member',
        principal: l.principal,
      }))
    );

    const { data: caseRows } = await supabase
      .from('reconciliation_cases')
      .select('id, provider, provider_amount')
      .eq('group_id', group.id)
      .eq('status', 'investigate')
      .order('created_at', { ascending: false });
    setOpenCases(caseRows ?? []);

    const { data: defaultedRows } = await supabase
      .from('loans')
      .select('id, borrower_id, principal')
      .eq('group_id', group.id)
      .eq('status', 'defaulted');
    const defaultedUserIds = (defaultedRows ?? []).map((l) => l.borrower_id);
    const { data: defaultedProfiles } =
      defaultedUserIds.length > 0
        ? await supabase.from('profiles_public').select('id, first_name, last_name').in('id', defaultedUserIds)
        : { data: [] };
    const defaultedNameById = new Map(
      (defaultedProfiles ?? []).map((p) => [p.id, `${p.first_name} ${p.last_name}`])
    );
    setDefaultedLoans(
      (defaultedRows ?? []).map((l) => ({
        id: l.id,
        name: defaultedNameById.get(l.borrower_id) ?? 'Member',
        principal: l.principal,
      }))
    );

    setLoading(false);
  }, [group, isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  if (!group || !membership) return null;

  if (!isAdmin) {
    return (
      <ThemedView style={styles.flex}>
        <SafeAreaView style={styles.flex} edges={['bottom']}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <ThemedText type="default" themeColor="textSecondary">
              {t('This area is for Group Admins only.')}
            </ThemedText>
          </ScrollView>
        </SafeAreaView>
      </ThemedView>
    );
  }

  const actionsRequired =
    pendingMemberships.length + fallbackLoans.length + openCases.length;

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ThemedText type="title">{t('Admin Control Centre')}</ThemedText>
          {!loading ? (
            <ThemedText type="default" themeColor={actionsRequired > 0 ? 'warning' : 'textSecondary'}>
              {actionsRequired === 1
                ? t('1 action required')
                : t('{count} actions required', { count: actionsRequired })}
            </ThemedText>
          ) : null}

          {pendingMemberships.length > 0 ? (
            <View style={styles.section}>
              <ThemedText type="subtitle">{t('Membership Applications')}</ThemedText>
              {pendingMemberships.map((m) => (
                <Pressable
                  key={m.id}
                  onPress={() =>
                    router.push({ pathname: '/(app)/governance/application/[id]', params: { id: m.id } })
                  }
                  style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
                  <ThemedText type="default">{m.name}</ThemedText>
                  <ThemedText type="small" themeColor="primary">
                    {t('Review →')}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          ) : null}

          {fallbackLoans.length > 0 ? (
            <View style={styles.section}>
              <ThemedText type="subtitle">{t('Loan Applications')}</ThemedText>
              {fallbackLoans.map((l) => (
                <Pressable
                  key={l.id}
                  onPress={() => router.push({ pathname: '/(app)/loan/[id]', params: { id: l.id } })}
                  style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
                  <ThemedText type="default">{l.name}</ThemedText>
                  <ThemedText type="small" themeColor="primary">
                    {group.currency} {l.principal.toLocaleString()} →
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          ) : null}

          {openCases.length > 0 ? (
            <View style={styles.section}>
              <ThemedText type="subtitle">{t('Reconciliation Cases')}</ThemedText>
              {openCases.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() =>
                    router.push({ pathname: '/(app)/admin/reconciliation-case/[id]', params: { id: c.id } })
                  }
                  style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
                  <ThemedText type="default">{c.provider}</ThemedText>
                  <ThemedText type="small" themeColor="warning">
                    {group.currency} {c.provider_amount.toLocaleString()} →
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          ) : null}

          {defaultedLoans.length > 0 ? (
            <View style={styles.section}>
              <ThemedText type="subtitle">{t('Default Alerts')}</ThemedText>
              {defaultedLoans.map((l) => (
                <Pressable
                  key={l.id}
                  onPress={() => router.push({ pathname: '/(app)/loan/[id]', params: { id: l.id } })}
                  style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
                  <ThemedText type="default">{l.name}</ThemedText>
                  <ThemedText type="small" themeColor="danger">
                    {group.currency} {l.principal.toLocaleString()}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          ) : null}

          <View style={styles.section}>
            <ThemedText type="subtitle">{t('Manage')}</ThemedText>
            <NavRow label={t('Financial Dashboard')} onPress={() => router.push('/(app)/admin/financial-dashboard')} />
            <NavRow label={t('Transactions')} onPress={() => router.push('/(app)/admin/transactions')} />
            <NavRow label={t('Reports')} onPress={() => router.push('/(app)/admin/reports')} />
            <NavRow label={t('Audit Log')} onPress={() => router.push('/(app)/admin/audit-log')} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.two },
  section: { gap: Spacing.two, marginTop: Spacing.three },
  card: { gap: Spacing.one, padding: Spacing.three, borderRadius: 10 },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: 10,
  },
});
