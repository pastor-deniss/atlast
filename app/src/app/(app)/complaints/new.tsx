import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDateTime } from '@/lib/datetime';
import { useSession } from '@/lib/auth/session-context';
import { CATEGORY_LABELS, type ComplaintCategory } from '@/lib/complaints';
import { functionErrorMessage } from '@/lib/function-error';
import { useT } from '@/lib/i18n';
import { useMembership } from '@/lib/membership-context';
import { supabase } from '@/lib/supabase';

type TxOption = { id: string; type: string; amount: number; created_at: string; reference: string | null };

const TX_LABELS: Record<string, string> = {
  contribution: 'Contribution',
  loan_disbursement: 'Loan received',
  repayment: 'Loan repayment',
  reversal: 'Reversal',
  jamii_contribution: 'Jamii contribution',
  jamii_payout: 'Jamii help received',
  group_expense: 'Group expense',
};

const RECENT_TRANSACTIONS = 15;

export default function NewComplaintScreen() {
  const router = useRouter();
  const t = useT();
  const theme = useTheme();
  const { session } = useSession();
  const { group } = useMembership();
  const params = useLocalSearchParams<{ transactionId?: string }>();

  const [category, setCategory] = useState<ComplaintCategory | null>(null);
  const [transactions, setTransactions] = useState<TxOption[]>([]);
  const [transactionId, setTransactionId] = useState<string | null>(params.transactionId ?? null);
  const [subject, setSubject] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!group || !session) return;
    supabase
      .from('transactions')
      .select('id, type, amount, created_at, reference')
      .eq('group_id', group.id)
      .eq('member_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(RECENT_TRANSACTIONS)
      .then(({ data }) => setTransactions((data ?? []) as TxOption[]));
  }, [group, session]);

  async function submit() {
    if (!group) return;
    setError(null);
    if (!category) {
      setError('Choose what the complaint is about.');
      return;
    }
    if (!subject.trim() || !details.trim()) {
      setError('Enter a title and describe the problem.');
      return;
    }
    setBusy(true);
    const { data, error: fnError } = await supabase.functions.invoke('submit-complaint', {
      body: {
        group_id: group.id,
        category,
        transaction_id: transactionId,
        subject: subject.trim(),
        details: details.trim(),
      },
    });
    setBusy(false);
    const message = (data as { error?: string } | null)?.error ?? (await functionErrorMessage(fnError));
    if (message) {
      setError(message);
      return;
    }
    const created = (data as { complaint: { id: string } }).complaint;
    router.replace({ pathname: '/(app)/complaints/[id]', params: { id: created.id } });
  }

  function chip(selected: boolean) {
    return [
      styles.chip,
      { borderColor: selected ? theme.primary : theme.backgroundSelected },
      selected && { backgroundColor: theme.backgroundSelected },
    ];
  }

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          <Card>
            <ThemedText type="smallBold" style={styles.heading}>
              {t('What is it about?')}
            </ThemedText>
            <View style={styles.chips}>
              {(Object.keys(CATEGORY_LABELS) as ComplaintCategory[]).map((c) => (
                <Pressable
                  key={c}
                  accessibilityRole="button"
                  accessibilityState={{ selected: category === c }}
                  onPress={() => setCategory(c)}
                  style={chip(category === c)}>
                  <ThemedText type="smallBold">{t(CATEGORY_LABELS[c])}</ThemedText>
                </Pressable>
              ))}
            </View>
          </Card>

          {transactions.length > 0 ? (
            <Card>
              <ThemedText type="smallBold" style={styles.heading}>
                {t('Which transaction? (optional)')}
              </ThemedText>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: transactionId === null }}
                onPress={() => setTransactionId(null)}
                style={chip(transactionId === null)}>
                <ThemedText type="small">{t('Not about one transaction')}</ThemedText>
              </Pressable>
              {transactions.map((tx) => (
                <Pressable
                  key={tx.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: transactionId === tx.id }}
                  onPress={() => setTransactionId(tx.id)}
                  style={[chip(transactionId === tx.id), styles.txChip]}>
                  <View style={styles.flex}>
                    <ThemedText type="smallBold">{t(TX_LABELS[tx.type] ?? tx.type)}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {formatDateTime(tx.created_at)}
                      {tx.reference ? ` • ${tx.reference}` : ''}
                    </ThemedText>
                  </View>
                  <ThemedText type="smallBold">
                    {group?.currency} {Math.abs(Number(tx.amount)).toLocaleString()}
                  </ThemedText>
                </Pressable>
              ))}
            </Card>
          ) : null}

          <Card>
            <TextField
              label={t('Title')}
              placeholder={t('e.g. My 19 Nov contribution is missing')}
              value={subject}
              onChangeText={setSubject}
              maxLength={120}
            />
            <TextField
              label={t('Describe the problem')}
              placeholder={t('What happened, and what should it be?')}
              value={details}
              onChangeText={setDetails}
              maxLength={2000}
              multiline
              style={styles.detailsInput}
            />
          </Card>

          {error ? (
            <ThemedText type="small" themeColor="danger">
              {t(error)}
            </ThemedText>
          ) : null}
          <Button title={t('Submit Complaint')} variant="danger" onPress={submit} loading={busy} />
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, padding: Spacing.four, paddingBottom: Spacing.five },
  column: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', gap: Spacing.three },
  heading: { fontSize: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  txChip: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  detailsInput: { minHeight: 120, textAlignVertical: 'top' },
});
