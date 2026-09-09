import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useMembership } from '@/lib/membership-context';
import { supabase } from '@/lib/supabase';

// Ticket 16: Payment Method is fixed to "Mobile Money" — no selector (matches
// ticket 03's mobile-money-centric V1 scope). Live client-side validation of
// the share_value-multiple rule is a UX nicety; reportContribution (ticket
// 13) remains the actual enforcement point.
export default function ContributeScreen() {
  const router = useRouter();
  const { group } = useMembership();

  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!group) return null;

  const numericAmount = Number(amount);
  const isValidAmount =
    amount.length > 0 && Number.isFinite(numericAmount) && numericAmount > 0;
  const isMultiple = isValidAmount && numericAmount % group.share_value === 0;
  const sharesForAmount = isMultiple ? numericAmount / group.share_value : 0;

  async function handleSubmit() {
    setError(null);
    if (!isValidAmount) {
      setError('Enter an amount.');
      return;
    }
    if (!isMultiple) {
      setError(`Must be a multiple of ${group!.currency} ${group!.share_value.toLocaleString()}.`);
      return;
    }
    if (!reference.trim()) {
      setError('Enter the mobile money reference.');
      return;
    }

    setSubmitting(true);
    const { data, error: fnError } = await supabase.functions.invoke('report-contribution', {
      body: { group_id: group!.id, amount: numericAmount, reference: reference.trim() },
    });
    setSubmitting(false);

    const errorMessage = (data as { error?: string })?.error ?? fnError?.message;
    if (errorMessage) {
      setError(errorMessage);
      return;
    }

    const transaction = (data as { transaction: { amount: number; shares_earned: number; reference: string } })
      .transaction;
    router.replace({
      pathname: '/(app)/contribution-receipt',
      params: {
        amount: String(transaction.amount),
        sharesEarned: String(transaction.shares_earned),
        reference: transaction.reference,
      },
    });
  }

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['bottom']}>
        <View style={styles.content}>
          <ThemedText type="title">Make Contribution</ThemedText>

          <TextField
            label="Amount"
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
            hint={
              isValidAmount
                ? isMultiple
                  ? `✓ ${sharesForAmount} share${sharesForAmount === 1 ? '' : 's'}`
                  : `Must be a multiple of ${group.currency} ${group.share_value.toLocaleString()}`
                : undefined
            }
          />

          <View style={styles.field}>
            <ThemedText type="small" themeColor="textSecondary">
              Payment Method
            </ThemedText>
            <ThemedText type="default">Mobile Money</ThemedText>
          </View>

          <TextField
            label="Reference"
            value={reference}
            onChangeText={setReference}
            placeholder="Mobile money confirmation code"
          />

          {error ? (
            <ThemedText type="small" themeColor="danger">
              {error}
            </ThemedText>
          ) : null}

          <Button
            title="Contribute"
            onPress={handleSubmit}
            loading={submitting}
            disabled={!isMultiple || !reference.trim()}
          />
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three },
  field: { gap: Spacing.one },
});
