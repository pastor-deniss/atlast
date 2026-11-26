import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDateTime } from '@/lib/datetime';
import { useMembership } from '@/lib/membership-context';
import { supabase } from '@/lib/supabase';
import { useT } from '@/lib/i18n';
import { paymentMethodLabel } from '@/lib/payment-methods';

type TransactionRow = {
  id: string;
  type: string;
  amount: number;
  status: string;
  reference: string | null;
  payment_method: string | null;
  created_at: string;
};

function statusColor(status: string): ThemeColor {
  if (status === 'reconciled') return 'primary';
  if (status === 'investigate') return 'warning';
  return 'textSecondary';
}

// Ticket 09 Q4 (full financial transparency) + ticket 19's Treasurer
// "Transactions" screen: the whole group ledger, reverse-chronological.
// Tapping a row opens the per-transaction admin actions (reconcile/reverse).
export default function AdminTransactionsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const t = useT();
  const { group } = useMembership();
  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!group) return;
    setLoading(true);
    supabase
      .from('transactions')
      .select('id, type, amount, status, reference, payment_method, created_at')
      .eq('group_id', group.id)
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => {
        setRows(data ?? []);
        setLoading(false);
      });
  }, [group]);

  if (!group) return null;

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['bottom']}>
        <FlatList
          data={rows}
          keyExtractor={(t) => t.id}
          refreshing={loading}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            !loading ? (
              <ThemedText type="default" themeColor="textSecondary">
                {t('No transactions yet.')}
              </ThemedText>
            ) : null
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: '/(app)/admin/transaction/[id]', params: { id: item.id } })}
              style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
              <View>
                <ThemedText type="default">{t(item.type.replace('_', ' '))}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {formatDateTime(item.created_at)}
                  {item.type === 'contribution' || item.type === 'repayment'
                    ? ` · ${t(paymentMethodLabel(item.payment_method))}`
                    : ''}
                  {item.reference ? ` · ${item.reference}` : ''}
                </ThemedText>
              </View>
              <View style={styles.rowRight}>
                <ThemedText type="default">
                  {group.currency} {item.amount.toLocaleString()}
                </ThemedText>
                <ThemedText type="small" themeColor={statusColor(item.status)}>
                  {t(item.status)}
                </ThemedText>
              </View>
            </Pressable>
          )}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: Spacing.four, gap: Spacing.two },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: 10,
  },
  rowRight: { alignItems: 'flex-end' },
});
