import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useSession } from '@/lib/auth/session-context';
import { useMembership } from '@/lib/membership-context';
import { supabase } from '@/lib/supabase';
import { useT } from '@/lib/i18n';
import { fetchLoanRates, formatRate, type LoanRates } from '@/lib/loans';

const OPEN_LOAN_STATUSES = ['pending_review', 'approved', 'disbursed', 'repaying'];

// Ticket 15, Q1/Q2: group-wide info page. "Loan availability" is a
// per-member computed flag (does the viewer have any open loan in this
// group?), not a group-level fund-capacity check.
export default function GroupDashboardScreen() {
  const router = useRouter();
  const { session } = useSession();
  const { membership, group } = useMembership();
  const t = useT();
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [rates, setRates] = useState<LoanRates | null>(null);
  useEffect(() => {
    if (group) fetchLoanRates(group.id).then(setRates);
  }, [group]);
  const [loanAvailable, setLoanAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    if (!group) return;
    supabase
      .from('memberships')
      .select('*', { count: 'exact', head: true })
      .eq('group_id', group.id)
      .eq('status', 'active')
      .then(({ count }) => setMemberCount(count ?? 0));
  }, [group]);

  useEffect(() => {
    if (!group || !session) return;
    supabase
      .from('loans')
      .select('id')
      .eq('group_id', group.id)
      .eq('borrower_id', session.user.id)
      .in('status', OPEN_LOAN_STATUSES)
      .then(({ data }) => setLoanAvailable((data?.length ?? 0) === 0));
  }, [group, session]);

  if (!group || !membership) return null;

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ThemedText type="title">{group.name}</ThemedText>
          {group.description ? (
            <ThemedText type="default" themeColor="textSecondary">
              {group.description}
            </ThemedText>
          ) : null}

          <View style={styles.row}>
            <ThemedText type="default">{t('Members')}</ThemedText>
            <ThemedText type="default">{memberCount ?? '—'}</ThemedText>
          </View>
          <View style={styles.row}>
            <ThemedText type="default">
              {t('{frequency} contribution', {
                frequency: t(
                  group.contribution_frequency[0].toUpperCase() + group.contribution_frequency.slice(1)
                ),
              })}
            </ThemedText>
            <ThemedText type="default">
              {group.currency} {group.contribution_amount.toLocaleString()}
            </ThemedText>
          </View>
          <View style={styles.row}>
            <ThemedText type="default">{t('Share value')}</ThemedText>
            <ThemedText type="default">
              {group.currency} {group.share_value.toLocaleString()}
            </ThemedText>
          </View>
          {rates ? (
            <>
              <View style={styles.row}>
                <ThemedText type="default">{t('Loan interest')}</ThemedText>
                <ThemedText type="default">{formatRate(rates.interestRate)}</ThemedText>
              </View>
              <View style={styles.row}>
                <ThemedText type="default">{t('Late penalty per week')}</ThemedText>
                <ThemedText type="default">{formatRate(rates.penaltyWeeklyRate)}</ThemedText>
              </View>
            </>
          ) : null}
          <View style={styles.row}>
            <ThemedText type="default">{t('Loan availability')}</ThemedText>
            <ThemedText type="default" themeColor={loanAvailable ? 'primary' : 'textSecondary'}>
              {loanAvailable === null ? '—' : loanAvailable ? t('Available') : t('Unavailable')}
            </ThemedText>
          </View>
          <View style={styles.row}>
            <ThemedText type="default">{t('Your Status')}</ThemedText>
            <ThemedText type="default">
              {membership.role === 'group_admin' ? t('Group Admin') : t('Active Member')}
            </ThemedText>
          </View>

          <View style={styles.spacer} />
          <Button title={t('Member Directory')} onPress={() => router.push('/members')} />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, padding: Spacing.four, gap: Spacing.three },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.one,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  spacer: { flex: 1 },
});
