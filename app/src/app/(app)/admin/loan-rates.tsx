import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Card, Divider } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { functionErrorMessage } from '@/lib/function-error';
import { useT } from '@/lib/i18n';
import { fetchLoanRates, formatRate, interestFor } from '@/lib/loans';
import { useMembership } from '@/lib/membership-context';
import { supabase } from '@/lib/supabase';

const EXAMPLE_LOAN = 100000;
const EXAMPLE_OWED = 40000;

function parseRate(value: string) {
  const n = Number(value.replace(',', '.').trim());
  return value.trim() === '' || !Number.isFinite(n) ? null : n;
}

// Group Admin sets the flat loan interest % and the weekly late-penalty %.
export default function LoanRatesScreen() {
  const t = useT();
  const { group, membership } = useMembership();
  const isAdmin = membership?.role === 'group_admin' && membership.status === 'active';

  const [interest, setInterest] = useState('');
  const [penalty, setPenalty] = useState('');
  const [saved, setSaved] = useState<{ interest: number; penalty: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const load = useCallback(async () => {
    if (!group) return;
    const rates = await fetchLoanRates(group.id);
    setSaved({ interest: rates.interestRate, penalty: rates.penaltyWeeklyRate });
    setInterest(String(rates.interestRate));
    setPenalty(String(rates.penaltyWeeklyRate));
  }, [group]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (!group) return null;
  if (!isAdmin) {
    return (
      <ThemedView style={[styles.flex, styles.centerBox]}>
        <ThemedText type="default" themeColor="textSecondary">
          {t('This area is for Group Admins only.')}
        </ThemedText>
      </ThemedView>
    );
  }

  const interestValue = parseRate(interest);
  const penaltyValue = parseRate(penalty);
  const money = (n: number) => `${group.currency} ${Math.round(n).toLocaleString()}`;
  const changed =
    saved !== null && (interestValue !== saved.interest || penaltyValue !== saved.penalty);

  async function save() {
    setError(null);
    setSuccess(false);
    if (interestValue === null || interestValue < 0 || interestValue > 100) {
      setError('Interest must be between 0% and 100%.');
      return;
    }
    if (penaltyValue === null || penaltyValue < 0 || penaltyValue > 20) {
      setError('The weekly penalty must be between 0% and 20%.');
      return;
    }
    setBusy(true);
    const { data, error: fnError } = await supabase.functions.invoke('set-loan-rates', {
      body: { group_id: group!.id, interest_rate: interestValue, penalty_weekly_rate: penaltyValue },
    });
    setBusy(false);
    const message = (data as { error?: string } | null)?.error ?? (await functionErrorMessage(fnError));
    if (message) {
      setError(message);
      return;
    }
    setSuccess(true);
    await load();
  }

  const exampleInterest = interestFor(EXAMPLE_LOAN, interestValue ?? 0);
  const examplePenalty = Math.round((EXAMPLE_OWED * (penaltyValue ?? 0)) / 100);

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          <Card>
            <TextField
              label={t('Loan interest (%) — charged once')}
              value={interest}
              onChangeText={setInterest}
              keyboardType="decimal-pad"
              hint={t('Example: {rate} on a {loan} loan = {interest}, so the member repays {total}.', {
                rate: formatRate(interestValue ?? 0),
                loan: money(EXAMPLE_LOAN),
                interest: money(exampleInterest),
                total: money(EXAMPLE_LOAN + exampleInterest),
              })}
            />
            <Divider />
            <TextField
              label={t('Late penalty (%) — per week late')}
              value={penalty}
              onChangeText={setPenalty}
              keyboardType="decimal-pad"
              hint={t(
                'Example: {rate} per week on {owed} still owed = {penalty} for each full week past the due date.',
                { rate: formatRate(penaltyValue ?? 0), owed: money(EXAMPLE_OWED), penalty: money(examplePenalty) }
              )}
            />
          </Card>

          <Card>
            <ThemedText type="small" themeColor="textSecondary">
              {t('How it works')}
            </ThemedText>
            <ThemedText type="small">
              {'• '}
              {t('New rates apply only to loans requested from now on. Existing loans keep the rates they were given.')}
            </ThemedText>
            <ThemedText type="small">
              {'• '}
              {t('A loan is late after its term ends (payout date + term in weeks). Penalties are charged on what is still owed, never on earlier penalties, and stop when the loan is flagged as defaulted.')}
            </ThemedText>
            <ThemedText type="small">
              {'• '}
              {t('Interest and penalties are paid with normal repayments and go into the group fund.')}
            </ThemedText>
            <ThemedText type="small">
              {'• '}
              {t('Every change is recorded in the Audit Log and all members are notified.')}
            </ThemedText>
          </Card>

          {error ? (
            <ThemedText type="small" themeColor="danger">
              {t(error)}
            </ThemedText>
          ) : null}
          {success ? (
            <ThemedText type="small" themeColor="primary">
              {t('Saved. Members have been notified.')}
            </ThemedText>
          ) : null}
          <Button title={t('Save Rates')} onPress={save} loading={busy} disabled={!changed} />
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centerBox: { alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  content: { flexGrow: 1, padding: Spacing.four, paddingBottom: Spacing.five },
  column: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', gap: Spacing.three },
});
