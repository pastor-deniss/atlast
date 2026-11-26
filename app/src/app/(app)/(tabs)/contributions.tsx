import { useFocusEffect, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BarChart } from '@/components/ui/bar-chart';
import { Button } from '@/components/ui/button';
import {
  Card,
  icon,
  ProgressBar,
  Screen,
  ScreenHeader,
  SectionTitle,
} from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSession } from '@/lib/auth/session-context';
import {
  computeGrowthSeries,
  type GrowthBar,
  type GrowthTransaction,
} from '@/lib/contribution-growth';
import { useT } from '@/lib/i18n';
import { useMembership } from '@/lib/membership-context';
import { supabase } from '@/lib/supabase';

type ContributionRow = { id: string; amount: number; created_at: string };

const PERIODS_PER_YEAR: Record<string, number> = {
  daily: 365,
  weekly: 52,
  biweekly: 26,
  monthly: 12,
};

export default function ContributionsScreen() {
  const router = useRouter();
  const t = useT();
  const theme = useTheme();
  const { session } = useSession();
  const { group, membership } = useMembership();
  const [history, setHistory] = useState<ContributionRow[]>([]);
  const [bars, setBars] = useState<GrowthBar[]>([]);
  const [total, setTotal] = useState(0);
  const [shares, setShares] = useState(0);

  const load = useCallback(async () => {
    if (!group || !session) return;

    const { data: totals } = await supabase
      .from('member_contribution_totals')
      .select('total_contributed, total_shares')
      .eq('group_id', group.id)
      .eq('member_id', session.user.id)
      .maybeSingle();
    setTotal(totals?.total_contributed ?? 0);
    setShares(totals?.total_shares ?? 0);

    const { data: contributionRows } = await supabase
      .from('transactions')
      .select('id, amount, created_at')
      .eq('group_id', group.id)
      .eq('member_id', session.user.id)
      .eq('type', 'contribution')
      .order('created_at', { ascending: false });
    setHistory(contributionRows ?? []);

    // Growth chart needs contribution + reversal rows together, to net
    // reversals against the original contribution's period (ticket 16).
    const { data: growthRows } = await supabase
      .from('transactions')
      .select('id, type, amount, created_at, reversed_transaction_id')
      .eq('group_id', group.id)
      .eq('member_id', session.user.id)
      .in('type', ['contribution', 'reversal']);
    setBars(computeGrowthSeries((growthRows ?? []) as GrowthTransaction[], group.contribution_frequency));
  }, [group, session]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (!group) return null;

  // The group's own rule, over a year: e.g. TZS 10,000 weekly -> TZS 520,000.
  const periods = PERIODS_PER_YEAR[group.contribution_frequency.toLowerCase()];
  const yearlyTarget = periods ? periods * group.contribution_amount : null;
  const thisYear = new Date().getFullYear();
  const contributedThisYear = history
    .filter((row) => new Date(row.created_at).getFullYear() === thisYear)
    .reduce((sum, row) => sum + row.amount, 0);
  const progress = yearlyTarget ? contributedThisYear / yearlyTarget : 0;

  return (
    <Screen
      header={
        <ScreenHeader
          title={t('Contributions')}
          subtitle={t('Your savings and contributions')}
          admin={membership?.role === 'group_admin'}
        />
      }>
      <Card>
        <View style={styles.totalRow}>
          <View style={styles.flex}>
            <ThemedText type="small" themeColor="textSecondary">
              {t('Total Contributed')}
            </ThemedText>
            <ThemedText type="title" themeColor="primary" style={styles.total}>
              {group.currency} {total.toLocaleString()}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t('{count} shares', { count: shares })}
            </ThemedText>
          </View>
          {yearlyTarget ? (
            <View style={styles.target}>
              <ThemedText type="small" themeColor="textSecondary">
                {t('Yearly target')}
              </ThemedText>
              <ThemedText type="smallBold">
                {group.currency} {yearlyTarget.toLocaleString()}
              </ThemedText>
            </View>
          ) : null}
        </View>
        {yearlyTarget ? (
          <>
            <ProgressBar value={progress} />
            <ThemedText type="small" themeColor="textSecondary">
              {t('{percent}% of this year’s target', { percent: Math.round(progress * 100) })}
            </ThemedText>
          </>
        ) : null}
      </Card>

      <Button title={`+  ${t('Contribute')}`} onPress={() => router.push('/(app)/contribute')} />

      {bars.length > 0 ? (
        <Card>
          <ThemedText type="small" themeColor="textSecondary">
            {t('Your Growth')}
          </ThemedText>
          <BarChart bars={bars} />
        </Card>
      ) : null}

      <SectionTitle title={t('Contribution History')} iconName={icon('calendar', 'calendar_month')} />

      {history.length === 0 ? (
        <ThemedText type="default" themeColor="textSecondary" style={styles.empty}>
          {t('No contributions yet.')}
        </ThemedText>
      ) : (
        history.map((item) => (
          <Card key={item.id} style={styles.historyRow}>
            <View style={styles.flex}>
              <ThemedText type="smallBold" style={styles.amount}>
                {group.currency} {item.amount.toLocaleString()}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {t('Mobile Money')} • {new Date(item.created_at).toLocaleDateString()}
              </ThemedText>
            </View>
            <View style={[styles.check, { backgroundColor: theme.backgroundSelected }]}>
              <SymbolView name={icon('checkmark', 'check')} size={16} tintColor={theme.primary} />
            </View>
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  totalRow: { flexDirection: 'row', gap: Spacing.three },
  total: { fontSize: 30, lineHeight: 38 },
  target: { alignItems: 'flex-end' },
  historyRow: { flexDirection: 'row', alignItems: 'center' },
  amount: { fontSize: 16 },
  check: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center' },
});
