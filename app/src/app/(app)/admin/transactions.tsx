import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TextField } from '@/components/ui/text-field';
import { Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDateTime } from '@/lib/datetime';
import { useMembership } from '@/lib/membership-context';
import { supabase } from '@/lib/supabase';
import { useT } from '@/lib/i18n';
import { paymentMethodLabel } from '@/lib/payment-methods';

type TransactionRow = {
  id: string;
  txn_number: string;
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
// Search finds a row by its transaction number (ATL-…) or by the payment
// reference the member gave (e.g. the M-Pesa code).
export default function AdminTransactionsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const t = useT();
  const { group } = useMembership();
  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!group) return;
    // Only letters, digits and dashes appear in numbers and codes; this also
    // keeps the text safe inside the PostgREST filter below.
    const search = query.replace(/[^A-Za-z0-9-]/g, '');
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      let request = supabase
        .from('transactions')
        .select('id, txn_number, type, amount, status, reference, payment_method, created_at')
        .eq('group_id', group.id);
      if (search) request = request.or(`txn_number.ilike.%${search}%,reference.ilike.%${search}%`);
      request
        .order('created_at', { ascending: false })
        .limit(100)
        .then(({ data }) => {
          if (cancelled) return;
          setRows(data ?? []);
          setLoading(false);
        });
    }, search ? 300 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [group, query]);

  if (!group) return null;

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['bottom']}>
        <FlatList
          data={rows}
          keyExtractor={(t) => t.id}
          refreshing={loading}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <TextField
              label={t('Search')}
              placeholder={t('Transaction No. or payment reference')}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="characters"
              autoCorrect={false}
            />
          }
          ListEmptyComponent={
            !loading ? (
              <ThemedText type="default" themeColor="textSecondary">
                {query.trim() ? t('No transaction matches that number.') : t('No transactions yet.')}
              </ThemedText>
            ) : null
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: '/(app)/admin/transaction/[id]', params: { id: item.id } })}
              style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
              <View style={styles.rowLeft}>
                <ThemedText type="default">{t(item.type.replace('_', ' '))}</ThemedText>
                <ThemedText type="smallBold">{item.txn_number}</ThemedText>
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
  rowLeft: { flex: 1 },
  rowRight: { alignItems: 'flex-end' },
});
