import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BarChart } from '@/components/ui/bar-chart';
import { Spacing } from '@/constants/theme';
import { useSession } from '@/lib/auth/session-context';
import { computeGrowthSeries, type GrowthBar, type GrowthTransaction } from '@/lib/contribution-growth';
import { useMembership } from '@/lib/membership-context';
import { supabase } from '@/lib/supabase';

type ContributionRow = { id: string; amount: number; created_at: string };

export default function ContributionsScreen() {
  const { session } = useSession();
  const { group } = useMembership();
  const [history, setHistory] = useState<ContributionRow[]>([]);
  const [bars, setBars] = useState<GrowthBar[]>([]);
  const [total, setTotal] = useState(0);
  const [shares, setShares] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!group || !session) return;
    (async () => {
      setLoading(true);

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

      setLoading(false);
    })();
  }, [group, session]);

  if (!group) return null;

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['bottom']}>
        <FlatList
          data={history}
          keyExtractor={(t) => t.id}
          refreshing={loading}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.header}>
              <ThemedText type="small" themeColor="textSecondary">
                Total Contributed
              </ThemedText>
              <ThemedText type="title">
                {group.currency} {total.toLocaleString()}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {shares} shares
              </ThemedText>

              <View style={styles.chart}>
                <BarChart bars={bars} />
              </View>

              <ThemedText type="subtitle" style={styles.historyTitle}>
                History
              </ThemedText>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <ThemedText type="default">{new Date(item.created_at).toLocaleDateString()}</ThemedText>
              <View style={styles.rowRight}>
                <ThemedText type="default">
                  {group.currency} {item.amount.toLocaleString()}
                </ThemedText>
                <ThemedText type="small" themeColor="primary">
                  ✓ Confirmed
                </ThemedText>
              </View>
            </View>
          )}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: Spacing.four, gap: Spacing.two },
  header: { gap: Spacing.one, marginBottom: Spacing.three },
  chart: { marginTop: Spacing.four },
  historyTitle: { marginTop: Spacing.four },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowRight: { alignItems: 'flex-end' },
});
