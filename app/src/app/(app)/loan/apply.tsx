import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSession } from '@/lib/auth/session-context';
import { useMembership } from '@/lib/membership-context';
import { supabase } from '@/lib/supabase';
import { useT } from '@/lib/i18n';
import { fetchLoanRates, formatRate, interestFor, type LoanRates } from '@/lib/loans';

// Ticket 17: requestLoan (Edge Function) rejects over-eligible amounts and
// existing-open-loan attempts server-side -- this form's own validation is a
// UX nicety, same relationship as ticket 16's contribution-amount check.
export default function LoanApplyScreen() {
  const router = useRouter();
  const { session } = useSession();
  const { group } = useMembership();
  const t = useT();

  const [eligibleAmount, setEligibleAmount] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('');
  const [termWeeks, setTermWeeks] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [rates, setRates] = useState<LoanRates | null>(null);

  useEffect(() => {
    if (!group) return;
    fetchLoanRates(group.id).then(setRates);
  }, [group]);

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
      setError(
        t('Amount exceeds your eligible amount of {amount}.', {
          amount: `${group?.currency} ${eligibleAmount.toLocaleString()}`,
        })
      );
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
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ThemedText type="title">{t('Loan Application')}</ThemedText>
          {eligibleAmount !== null ? (
            <ThemedText type="small" themeColor="textSecondary">
              {t('Eligible up to {amount}', {
                amount: `${group?.currency} ${eligibleAmount.toLocaleString()}`,
              })}
            </ThemedText>
          ) : null}

          <TextField label={t('Amount')} value={amount} onChangeText={setAmount} keyboardType="numeric" />
          <TextField label={t('Purpose')} value={purpose} onChangeText={setPurpose} placeholder={t('School expenses')} />
          <TextField label={t('Term (weeks)')} value={termWeeks} onChangeText={setTermWeeks} keyboardType="numeric" />

          {rates ? (
            <LoanCostPreview
              principal={Number(amount) > 0 ? Number(amount) : 0}
              termWeeks={Number(termWeeks) > 0 ? Math.floor(Number(termWeeks)) : 0}
              rates={rates}
              currency={group?.currency ?? ''}
            />
          ) : null}

          {error ? (
            <ThemedText type="small" themeColor="danger">
              {t(error)}
            </ThemedText>
          ) : null}

          <Button title={t('Submit Application')} onPress={handleSubmit} loading={submitting} />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

/** What the loan will cost, before applying, at the group's current rates. */
function LoanCostPreview({
  principal,
  termWeeks,
  rates,
  currency,
}: {
  principal: number;
  termWeeks: number;
  rates: LoanRates;
  currency: string;
}) {
  const t = useT();
  const theme = useTheme();
  const money = (n: number) => `${currency} ${Math.round(n).toLocaleString()}`;
  const interest = interestFor(principal, rates.interestRate);
  const total = principal + interest;

  if (rates.interestRate === 0 && rates.penaltyWeeklyRate === 0) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        {t('This group charges no interest or late penalties on loans.')}
      </ThemedText>
    );
  }

  return (
    <View style={[styles.preview, { backgroundColor: theme.backgroundElement }]}>
      <View style={styles.previewRow}>
        <ThemedText type="small" themeColor="textSecondary">
          {t('Interest ({rate}, charged once)', { rate: formatRate(rates.interestRate) })}
        </ThemedText>
        <ThemedText type="smallBold">{money(interest)}</ThemedText>
      </View>
      <View style={styles.previewRow}>
        <ThemedText type="small" themeColor="textSecondary">
          {t('Total to repay')}
        </ThemedText>
        <ThemedText type="smallBold">{money(total)}</ThemedText>
      </View>
      {termWeeks > 0 ? (
        <View style={styles.previewRow}>
          <ThemedText type="small" themeColor="textSecondary">
            {t('About {amount} per week for {count} weeks', {
              amount: money(Math.round(total / termWeeks)),
              count: termWeeks,
            })}
          </ThemedText>
        </View>
      ) : null}
      {rates.penaltyWeeklyRate > 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          {t('If you repay late, {rate} of what you still owe is added for each full week past the due date.', {
            rate: formatRate(rates.penaltyWeeklyRate),
          })}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three },
  preview: { borderRadius: 14, padding: Spacing.three, gap: Spacing.two },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two },
});
