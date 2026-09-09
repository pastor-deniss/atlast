import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useSession } from '@/lib/auth/session-context';
import { useMembership } from '@/lib/membership-context';
import { supabase } from '@/lib/supabase';

// Ticket 17: requestLoan (Edge Function) rejects over-eligible amounts and
// existing-open-loan attempts server-side -- this form's own validation is a
// UX nicety, same relationship as ticket 16's contribution-amount check.
export default function LoanApplyScreen() {
  const router = useRouter();
  const { session } = useSession();
  const { group } = useMembership();

  const [eligibleAmount, setEligibleAmount] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('');
  const [termWeeks, setTermWeeks] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!group || !session) return;
    supabase
      .from('loan_eligibility')
      .select('eligible_amount')
      .eq('group_id', group.id)
      .eq('member_id', session.user.id)
      .maybeSingle()
      .then(({ data }) => setEligibleAmount(data?.eligible_amount ?? 0));
  }, [group, session]);

  async function handleSubmit() {
    setError(null);
    const numericAmount = Number(amount);
    const numericTerm = Number(termWeeks);

    if (!numericAmount || numericAmount <= 0) {
      setError('Enter an amount.');
      return;
    }
    if (eligibleAmount !== null && numericAmount > eligibleAmount) {
      setError(`Amount exceeds your eligible amount of ${group?.currency} ${eligibleAmount.toLocaleString()}.`);
      return;
    }
    if (!purpose.trim()) {
      setError('Enter a purpose.');
      return;
    }
    if (!numericTerm || numericTerm <= 0) {
      setError('Enter a term in weeks.');
      return;
    }

    setSubmitting(true);
    const { data, error: fnError } = await supabase.functions.invoke('request-loan', {
      body: { group_id: group!.id, principal: numericAmount, purpose: purpose.trim(), term_weeks: numericTerm },
    });
    setSubmitting(false);

    const errorMessage = (data as { error?: string })?.error ?? fnError?.message;
    if (errorMessage) {
      setError(errorMessage);
      return;
    }

    router.replace('/(app)/loan');
  }

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['bottom']}>
        <View style={styles.content}>
          <ThemedText type="title">Loan Application</ThemedText>
          {eligibleAmount !== null ? (
            <ThemedText type="small" themeColor="textSecondary">
              Eligible up to {group?.currency} {eligibleAmount.toLocaleString()}
            </ThemedText>
          ) : null}

          <TextField label="Amount" value={amount} onChangeText={setAmount} keyboardType="numeric" />
          <TextField label="Purpose" value={purpose} onChangeText={setPurpose} placeholder="School expenses" />
          <TextField label="Term (weeks)" value={termWeeks} onChangeText={setTermWeeks} keyboardType="numeric" />

          {error ? (
            <ThemedText type="small" themeColor="danger">
              {error}
            </ThemedText>
          ) : null}

          <Button title="Submit Application" onPress={handleSubmit} loading={submitting} />
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three },
});
