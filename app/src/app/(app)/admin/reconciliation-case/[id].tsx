import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useMembership } from '@/lib/membership-context';
import { supabase } from '@/lib/supabase';

type ReconciliationCase = {
  id: string;
  transaction_id: string;
  provider: string;
  provider_reference: string | null;
  provider_amount: number;
  status: string;
  discrepancy_reason: string | null;
  notes: string | null;
  resolved_at: string | null;
};

// Ticket 19: Reconciliation Case / Investigate / Resolved from the mockup,
// all as one screen whose content follows `status`. Resolving here never
// issues the correction itself -- that's a separate reverseTransaction call
// from the transaction detail screen (ticket 13/19).
export default function ReconciliationCaseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { group } = useMembership();

  const [item, setItem] = useState<ReconciliationCase | null>(null);
  const [recordedAmount, setRecordedAmount] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);

    const { data: row } = await supabase
      .from('reconciliation_cases')
      .select(
        'id, transaction_id, provider, provider_reference, provider_amount, status, discrepancy_reason, notes, resolved_at'
      )
      .eq('id', id)
      .single();
    setItem(row);
    setNotes(row?.notes ?? '');

    if (row) {
      const { data: txn } = await supabase
        .from('transactions')
        .select('amount')
        .eq('id', row.transaction_id)
        .maybeSingle();
      setRecordedAmount(txn ? Math.abs(txn.amount) : null);
    }

    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !item || !group) return null;

  async function resolve() {
    setError(null);
    setBusy(true);
    const { data, error: fnError } = await supabase.functions.invoke('resolve-reconciliation-case', {
      body: { case_id: id, status: 'resolved', notes: notes.trim() || undefined },
    });
    setBusy(false);
    const errorMessage = (data as { error?: string })?.error ?? fnError?.message;
    if (errorMessage) {
      setError(errorMessage);
      return;
    }
    await load();
  }

  const difference =
    recordedAmount !== null ? recordedAmount - item.provider_amount : null;

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['bottom']}>
        <View style={styles.content}>
          <ThemedText type="title">
            {item.status === 'investigate' ? 'Reconciliation Case' : 'Reconciliation Resolved'}
          </ThemedText>

          {error ? (
            <ThemedText type="small" themeColor="danger">
              {error}
            </ThemedText>
          ) : null}

          <View style={styles.row}>
            <ThemedText type="default">Provider</ThemedText>
            <ThemedText type="default">{item.provider}</ThemedText>
          </View>
          {item.provider_reference ? (
            <View style={styles.row}>
              <ThemedText type="default">Provider Reference</ThemedText>
              <ThemedText type="default">{item.provider_reference}</ThemedText>
            </View>
          ) : null}
          <View style={styles.row}>
            <ThemedText type="default">Provider Amount</ThemedText>
            <ThemedText type="default">
              {group.currency} {item.provider_amount.toLocaleString()}
            </ThemedText>
          </View>
          <View style={styles.row}>
            <ThemedText type="default">Recorded</ThemedText>
            <ThemedText type="default">
              {group.currency} {(recordedAmount ?? 0).toLocaleString()}
            </ThemedText>
          </View>
          {difference !== null && difference !== 0 ? (
            <View style={styles.row}>
              <ThemedText type="default">Difference</ThemedText>
              <ThemedText type="default" themeColor="warning">
                {group.currency} {Math.abs(difference).toLocaleString()}
              </ThemedText>
            </View>
          ) : null}
          {item.discrepancy_reason ? (
            <ThemedText type="small" themeColor="textSecondary">
              {item.discrepancy_reason}
            </ThemedText>
          ) : null}

          <Button
            title="View Transaction"
            variant="secondary"
            onPress={() =>
              router.push({ pathname: '/(app)/admin/transaction/[id]', params: { id: item.transaction_id } })
            }
          />

          {item.status === 'investigate' ? (
            <View style={styles.section}>
              <TextField
                label="Notes"
                placeholder="Explain what happened and how it was corrected"
                value={notes}
                onChangeText={setNotes}
                multiline
              />
              <Button title="Resolve" onPress={resolve} loading={busy} disabled={!notes.trim()} />
            </View>
          ) : (
            <View style={styles.section}>
              <ThemedText type="default" themeColor="primary">
                Difference explained and corrected.
              </ThemedText>
              {item.notes ? <ThemedText type="default">{item.notes}</ThemedText> : null}
              {item.resolved_at ? (
                <ThemedText type="small" themeColor="textSecondary">
                  Resolved {new Date(item.resolved_at).toLocaleString()}
                </ThemedText>
              ) : null}
            </View>
          )}
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.two },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  section: {
    gap: Spacing.two,
    marginTop: Spacing.three,
    paddingTop: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
