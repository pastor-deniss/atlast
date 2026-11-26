import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { LineChart } from '@/components/charts/line-chart';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Card } from '@/components/ui/screen';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { loadFundHistory, type FundPoint, type FundRange } from '@/lib/fund-history';
import { useT } from '@/lib/i18n';
import { useMembership } from '@/lib/membership-context';
import { supabase } from '@/lib/supabase';

type Totals = { contributions: number; disbursed: number; repayments: number };

const RANGES: { key: FundRange; label: string }[] = [
  { key: '30d', label: '30 days' },
  { key: '6m', label: '6 months' },
  { key: '12m', label: '12 months' },
];

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card style={styles.stat}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallBold" style={styles.statValue}>
        {value}
      </ThemedText>
    </Card>
  );
}

// Ticket 19 headline figures (group_balances "Available Funds" plus ledger
// sums by type), and the Financial Overview chart: the group fund, savings
// paid in and loans paid out over time, from the same ledger.
export default function FinancialDashboardScreen() {
  const { group } = useMembership();
  const t = useT();
  const theme = useTheme();
  const [balance, setBalance] = useState<number | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [range, setRange] = useState<FundRange>('30d');
  const [history, setHistory] = useState<FundPoint[] | null>(null);

  useEffect(() => {
    if (!group) return;
    (async () => {
      const { data: balanceRow } = await supabase
        .from('group_balances')
        .select('balance')
        .eq('group_id', group.id)
        .maybeSingle();
      setBalance(Number(balanceRow?.balance ?? 0));

      const { data: rows } = await supabase
        .from('transactions')
        .select('type, amount')
        .eq('group_id', group.id)
        .in('type', ['contribution', 'loan_disbursement', 'repayment']);
      const sums = { contributions: 0, disbursed: 0, repayments: 0 };
      for (const r of rows ?? []) {
        if (r.type === 'contribution') sums.contributions += Number(r.amount);
        else if (r.type === 'loan_disbursement') sums.disbursed += Math.abs(Number(r.amount));
        else if (r.type === 'repayment') sums.repayments += Number(r.amount);
      }
      setTotals(sums);
    })();
  }, [group]);

  useEffect(() => {
    if (!group) return;
    let live = true;
    loadFundHistory(group.id, range).then((h) => {
      if (live) setHistory(h);
    });
    return () => {
      live = false;
    };
  }, [group, range]);

  if (!group) return null;
  const money = (n: number) => `${group.currency} ${Math.round(n).toLocaleString()}`;

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.column}>
          <View style={styles.grid}>
            <StatCard label={t('Available Funds')} value={money(balance ?? 0)} />
            <StatCard label={t('Total Contributions')} value={money(totals?.contributions ?? 0)} />
            <StatCard label={t('Loans Disbursed')} value={money(totals?.disbursed ?? 0)} />
            <StatCard label={t('Repayments Collected')} value={money(totals?.repayments ?? 0)} />
          </View>

          <Card>
            <ThemedText type="smallBold" style={styles.cardTitle}>
              {t('Financial Overview')}
            </ThemedText>
            <View style={styles.chips}>
              {RANGES.map((r) => {
                const on = r.key === range;
                return (
                  <Pressable
                    key={r.key}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    onPress={() => setRange(r.key)}
                    style={[styles.chip, { backgroundColor: on ? theme.primary : theme.backgroundSelected }]}>
                    <ThemedText type="small" style={{ color: on ? theme.onPrimary : theme.text }}>
                      {t(r.label)}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
            {history ? (
              <LineChart
                labels={history.map((p) => p.label)}
                series={[
                  { key: 'fund', label: t('Group fund'), values: history.map((p) => p.fund) },
                  { key: 'contributions', label: t('Savings paid in'), values: history.map((p) => p.contributions) },
                  { key: 'loans', label: t('Loans paid out'), values: history.map((p) => p.loansOut) },
                ]}
                format={money}
              />
            ) : (
              <View style={styles.placeholder} />
            )}
            <ThemedText type="small" themeColor="textSecondary">
              {t('Tap the chart to see the figures for any day. Savings and loans are totals since the group started; the Jamii pot is not included.')}
            </ThemedText>
          </Card>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, padding: Spacing.four, paddingBottom: Spacing.five },
  column: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', gap: Spacing.three },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  stat: { flexBasis: '48%', flexGrow: 1, gap: 2 },
  statValue: { fontSize: 17 },
  cardTitle: { fontSize: 16 },
  chips: { flexDirection: 'row', gap: Spacing.two },
  chip: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.one + 2, borderRadius: 999 },
  placeholder: { height: 260 },
});
