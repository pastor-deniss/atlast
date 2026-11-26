import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useMembership } from '@/lib/membership-context';
import { supabase } from '@/lib/supabase';
import { useT } from '@/lib/i18n';
import { paymentMethodLabel } from '@/lib/payment-methods';

type Transaction = {
  id: string;
  member_id: string;
  type: string;
  amount: number;
  status: string;
  reference: string | null;
  payment_method: string | null;
  reversed_transaction_id: string | null;
  created_at: string;
};

// Ticket 13/19: the two discretionary Admin actions over a ledger entry --
// submitReconciliationRecord (manual provider-statement entry) and
// reverseTransaction -- live on the same screen, but are deliberately
// separate calls (ticket 19's own answer: "an actual correction is a
// separate reverseTransaction call, not part of [the resolve] flow").
export default function AdminTransactionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { group } = useMembership();
  const t = useT();

  const [txn, setTxn] = useState<Transaction | null>(null);
  const [memberName, setMemberName] = useState<string | null>(null);
  const [alreadyReversed, setAlreadyReversed] = useState(false);
  const [openCaseId, setOpenCaseId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [provider, setProvider] = useState('mpesa');
  const [providerReference, setProviderReference] = useState('');
  const [providerAmount, setProviderAmount] = useState('');
  const [reverseReason, setReverseReason] = useState('');
  const [showReverseForm, setShowReverseForm] = useState(false);
  const [matchResult, setMatchResult] = useState<'matched' | 'investigate' | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);

    const { data: row } = await supabase
      .from('transactions')
      .select('id, member_id, type, amount, status, reference, payment_method, reversed_transaction_id, created_at')
      .eq('id', id)
      .single();
    setTxn(row);
    // Check it against the provider the member said they paid with.
    if (row?.payment_method && row.payment_method !== 'cash') setProvider(row.payment_method);
    if (!row) {
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from('profiles_public')
      .select('first_name, last_name')
      .eq('id', row.member_id)
      .maybeSingle();
    setMemberName(profile ? `${profile.first_name} ${profile.last_name}` : null);

    const { data: reversalRow } = await supabase
      .from('transactions')
      .select('id')
      .eq('reversed_transaction_id', id)
      .maybeSingle();
    setAlreadyReversed(!!reversalRow);

    const { data: caseRow } = await supabase
      .from('reconciliation_cases')
      .select('id')
      .eq('transaction_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setOpenCaseId(caseRow?.id ?? null);

    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !txn || !group) return null;

  async function submitReconciliation() {
    setError(null);
    setBusy(true);
    const { data, error: fnError } = await supabase.functions.invoke('submit-reconciliation-record', {
      body: {
        transaction_id: id,
        provider: provider.trim(),
        provider_reference: providerReference.trim() || undefined,
        provider_amount: Number(providerAmount),
      },
    });
    setBusy(false);
    const errorMessage = (data as { error?: string })?.error ?? fnError?.message;
    if (errorMessage) {
      setError(errorMessage);
      return;
    }
    const created = (data as { reconciliation_case: { id: string; status: string } }).reconciliation_case;
    setMatchResult(created.status as 'matched' | 'investigate');
    await load();
  }

  async function submitReversal() {
    setError(null);
    setBusy(true);
    const { data, error: fnError } = await supabase.functions.invoke('reverse-transaction', {
      body: { transaction_id: id, reason: reverseReason.trim() || undefined },
    });
    setBusy(false);
    const errorMessage = (data as { error?: string })?.error ?? fnError?.message;
    if (errorMessage) {
      setError(errorMessage);
      return;
    }
    setShowReverseForm(false);
    await load();
  }

  const canReconcile = txn.status === 'posted' && txn.type !== 'reversal';
  const canReverse = txn.type !== 'reversal' && !alreadyReversed;

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ThemedText type="title">
            {group.currency} {txn.amount.toLocaleString()}
          </ThemedText>
          <ThemedText type="default" themeColor="textSecondary">
            {t(txn.type.replace('_', ' '))} · {new Date(txn.created_at).toLocaleString()}
          </ThemedText>
          {memberName ? <ThemedText type="default">{memberName}</ThemedText> : null}
          {txn.type === 'contribution' || txn.type === 'repayment' ? (
            <ThemedText type="small" themeColor="textSecondary">
              {t('Paid by: {method}', { method: t(paymentMethodLabel(txn.payment_method)) })}
            </ThemedText>
          ) : null}
          {txn.reference ? (
            <ThemedText type="small" themeColor="textSecondary">
              {t('Reference: {reference}', { reference: txn.reference })}
            </ThemedText>
          ) : null}
          <ThemedText type="small" themeColor="primary">
            {t('Status: {status}', { status: t(txn.status) })}
          </ThemedText>

          {error ? (
            <ThemedText type="small" themeColor="danger">
              {t(error)}
            </ThemedText>
          ) : null}

          {openCaseId ? (
            <Button
              title={t('View Reconciliation Case')}
              variant="secondary"
              onPress={() =>
                router.push({ pathname: '/(app)/admin/reconciliation-case/[id]', params: { id: openCaseId } })
              }
            />
          ) : null}

          {canReconcile ? (
            <View style={styles.section}>
              <ThemedText type="subtitle">{t('Submit Reconciliation Record')}</ThemedText>
              {matchResult === 'matched' ? (
                <ThemedText type="default" themeColor="primary">
                  {t('✓ Matched — reconciled.')}
                </ThemedText>
              ) : (
                <>
                  <TextField label={t('Provider')} value={provider} onChangeText={setProvider} />
                  <TextField
                    label={t('Provider Reference')}
                    value={providerReference}
                    onChangeText={setProviderReference}
                  />
                  <TextField
                    label={t('Provider Amount')}
                    value={providerAmount}
                    onChangeText={setProviderAmount}
                    keyboardType="numeric"
                    placeholder={String(Math.abs(txn.amount))}
                  />
                  <Button
                    title={t('Submit')}
                    onPress={submitReconciliation}
                    loading={busy}
                    disabled={!provider.trim() || !providerAmount.trim()}
                  />
                </>
              )}
            </View>
          ) : null}

          {canReverse ? (
            <View style={styles.section}>
              <ThemedText type="subtitle">{t('Reverse Transaction')}</ThemedText>
              {showReverseForm ? (
                <>
                  <TextField label={t('Reason')} value={reverseReason} onChangeText={setReverseReason} />
                  <View style={styles.row}>
                    <Button title={t('Confirm Reversal')} variant="danger" onPress={submitReversal} loading={busy} />
                    <Button title={t('Cancel')} variant="secondary" onPress={() => setShowReverseForm(false)} />
                  </View>
                </>
              ) : (
                <Button title={t('Reverse Transaction')} variant="danger" onPress={() => setShowReverseForm(true)} />
              )}
            </View>
          ) : alreadyReversed ? (
            <ThemedText type="small" themeColor="textSecondary">
              {t('This transaction has already been reversed.')}
            </ThemedText>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.two },
  section: {
    gap: Spacing.two,
    marginTop: Spacing.three,
    paddingTop: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  row: { flexDirection: 'row', gap: Spacing.two },
});
