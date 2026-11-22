import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useMembership } from '@/lib/membership-context';
import { supabase } from '@/lib/supabase';

type Totals = { contributions: number; disbursed: number; repayments: number };

function StatCard({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="subtitle">{value}</ThemedText>
    </View>
  );
}

// Ticket 19: no new formula -- `group_balances.balance` ("Available Funds")
// is the already-existing derived view (ticket 03/09); the other three cards
// are a single-pass sum of `transactions` by type, same underlying ledger.
export default function FinancialDashboardScreen() {
  const { group } = useMembership();
  const [balance, setBalance] = useState<number | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);

  useEffect(() => {
    if (!group) return;
    (async () => {
      const { data: balanceRow } = await supabase
        .from('group_balances')
        .select('balance')
        .eq('group_id', group.id)
        .maybeSingle();
      setBalance(balanceRow?.balance ?? 0);

      const { data: rows } = await supabase
        .from('transactions')
        .select('type, amount')
        .eq('group_id', group.id)
        .in('type', ['contribution', 'loan_disbursement', 'repayment']);
      const sums = { contributions: 0, disbursed: 0, repayments: 0 };
      for (const r of rows ?? []) {
        if (r.type === 'contribution') sums.contributions += r.amount;
        else if (r.type === 'loan_disbursement') sums.disbursed += Math.abs(r.amount);
        else if (r.type === 'repayment') sums.repayments += r.amount;
      }
      setTotals(sums);
    })();
  }, [group]);

  if (!group) return null;

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ThemedText type="title">Financial Dashboard</ThemedText>

          <StatCard
            label="Available Funds"
            value={`${group.currency} ${(balance ?? 0).toLocaleString()}`}
          />
          <StatCard
            label="Total Contributions"
            value={`${group.currency} ${(totals?.contributions ?? 0).toLocaleString()}`}
          />
          <StatCard
            label="Loans Disbursed"
            value={`${group.currency} ${(totals?.disbursed ?? 0).toLocaleString()}`}
          />
          <StatCard
            label="Repayments Collected"
            value={`${group.currency} ${(totals?.repayments ?? 0).toLocaleString()}`}
          />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.two },
  card: { gap: Spacing.one, padding: Spacing.three, borderRadius: 10 },
});
