import { useFocusEffect, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Card, Divider, icon, MenuRow, Pill, ProgressBar } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { Brand, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { functionErrorMessage } from '@/lib/function-error';
import { useT } from '@/lib/i18n';
import { useMembership } from '@/lib/membership-context';
import { supabase } from '@/lib/supabase';

type Check = {
  id: string;
  checked_by: string;
  expected_balance: number;
  actual_balance: number;
  difference: number;
  note: string | null;
  created_at: string;
  checker_name: string;
};

type TxRow = {
  id: string;
  type: string;
  amount: number;
  status: string;
  reversed_transaction_id: string | null;
};

type Breakdown = {
  contributions: number;
  loansOut: number;
  repayments: number;
  expected: number;
  verifiedAmount: number;
  unverifiedAmount: number;
  investigateAmount: number;
  unverifiedCount: number;
  investigateCount: number;
};

const HISTORY_SIZE = 10;

/** Reversal-aware totals, the same rule as the balance views: a reversal counts under the type it reverses. */
function summarise(rows: TxRow[]): Breakdown {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const reversedIds = new Set(rows.filter((r) => r.reversed_transaction_id).map((r) => r.reversed_transaction_id));
  const b: Breakdown = {
    contributions: 0,
    loansOut: 0,
    repayments: 0,
    expected: 0,
    verifiedAmount: 0,
    unverifiedAmount: 0,
    investigateAmount: 0,
    unverifiedCount: 0,
    investigateCount: 0,
  };
  for (const r of rows) {
    const amount = Number(r.amount);
    b.expected += amount;
    const type = r.type === 'reversal' ? byId.get(r.reversed_transaction_id ?? '')?.type : r.type;
    if (type === 'contribution') b.contributions += amount;
    else if (type === 'loan_disbursement') b.loansOut += -amount;
    else if (type === 'repayment') b.repayments += amount;

    // Verification status of contributions still standing (reversed ones no longer matter).
    if (r.type === 'contribution' && !reversedIds.has(r.id)) {
      if (r.status === 'reconciled') b.verifiedAmount += amount;
      else if (r.status === 'investigate') {
        b.investigateAmount += amount;
        b.investigateCount += 1;
      } else {
        b.unverifiedAmount += amount;
        b.unverifiedCount += 1;
      }
    }
  }
  return b;
}

// Usuluhishi: does the money the group really holds match what the ledger
// says it should hold? Group-Admin-only, like the rest of Reconciliation.
export default function ReconciliationScreen() {
  const router = useRouter();
  const t = useT();
  const theme = useTheme();
  const { group, membership } = useMembership();
  const isAdmin = membership?.role === 'group_admin' && membership.status === 'active';

  const [breakdown, setBreakdown] = useState<Breakdown | null>(null);
  const [checks, setChecks] = useState<Check[]>([]);
  const [actual, setActual] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!group || !isAdmin) return;
    const [{ data: txRows }, { data: checkRows }] = await Promise.all([
      supabase
        .from('transactions')
        .select('id, type, amount, status, reversed_transaction_id')
        .eq('group_id', group.id),
      supabase
        .from('group_balance_checks')
        .select('id, checked_by, expected_balance, actual_balance, difference, note, created_at')
        .eq('group_id', group.id)
        .order('created_at', { ascending: false })
        .limit(HISTORY_SIZE),
    ]);
    setBreakdown(summarise((txRows ?? []) as TxRow[]));

    const rows = checkRows ?? [];
    const ids = [...new Set(rows.map((c) => c.checked_by))];
    const { data: profiles } =
      ids.length > 0
        ? await supabase.from('profiles_public').select('id, first_name, last_name').in('id', ids)
        : { data: [] };
    const nameById = new Map((profiles ?? []).map((p) => [p.id, `${p.first_name} ${p.last_name}`.trim()]));
    setChecks(
      rows.map((c) => ({
        ...c,
        expected_balance: Number(c.expected_balance),
        actual_balance: Number(c.actual_balance),
        difference: Number(c.difference),
        checker_name: nameById.get(c.checked_by) ?? '',
      }))
    );
  }, [group, isAdmin]);

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

  const money = (n: number) => `${group.currency} ${Math.round(n).toLocaleString()}`;
  const latest = checks[0];

  async function compare() {
    setError(null);
    const value = Number(actual.replace(/[,\s]/g, ''));
    if (!actual.trim() || !Number.isFinite(value) || value < 0) {
      setError('Enter the amount the group actually holds.');
      return;
    }
    setBusy(true);
    const { data, error: fnError } = await supabase.functions.invoke('record-balance-check', {
      body: { group_id: group!.id, actual_balance: value, note: note.trim() },
    });
    setBusy(false);
    const message = (data as { error?: string } | null)?.error ?? (await functionErrorMessage(fnError));
    if (message) {
      setError(message);
      return;
    }
    setActual('');
    setNote('');
    await load();
  }

  const contributionsTotal = breakdown
    ? breakdown.verifiedAmount + breakdown.unverifiedAmount + breakdown.investigateAmount
    : 0;

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          {/* What the ledger says the group should hold */}
          <Card>
            <ThemedText type="smallBold" style={styles.heading}>
              {t('Account Comparison')}
            </ThemedText>
            <Line label={t('Contributions')} value={money(breakdown?.contributions ?? 0)} />
            <Line label={t('Loans paid out')} value={`− ${money(breakdown?.loansOut ?? 0)}`} />
            <Line label={t('Loan repayments')} value={`+ ${money(breakdown?.repayments ?? 0)}`} />
            <Divider />
            <Line label={t('Expected in the account (system)')} value={money(breakdown?.expected ?? 0)} strong />
            {latest ? (
              <Line
                label={t('Actually held (last check, {date})', {
                  date: new Date(latest.created_at).toLocaleDateString(),
                })}
                value={money(latest.actual_balance)}
                strong
              />
            ) : null}
          </Card>

          {/* Result of the latest check */}
          {latest ? (
            latest.difference === 0 ? (
              <View style={[styles.result, styles.resultGood]}>
                <SymbolView name={icon('checkmark.seal', 'verified')} size={40} tintColor={theme.primary} />
                <ThemedText type="subtitle" style={[styles.resultTitle, { color: theme.primary }]}>
                  {t('Balanced')}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.resultText}>
                  {t('The money held matched the system on {date}.', {
                    date: new Date(latest.created_at).toLocaleDateString(),
                  })}
                </ThemedText>
              </View>
            ) : (
              <View style={[styles.result, styles.resultBad]}>
                <SymbolView
                  name={icon('exclamationmark.triangle', 'warning')}
                  size={40}
                  tintColor={Brand.danger}
                />
                <ThemedText type="subtitle" style={[styles.resultTitle, { color: Brand.danger }]}>
                  {t('Difference Found')}
                </ThemedText>
                <ThemedText type="default" style={styles.resultText}>
                  {t('Difference: {amount}', { amount: money(Math.abs(latest.difference)) })}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.resultText}>
                  {latest.difference < 0
                    ? t('The group holds less than the system expects.')
                    : t('The group holds more than the system expects.')}
                </ThemedText>
              </View>
            )
          ) : null}

          {/* Record a new check */}
          <Card>
            <ThemedText type="smallBold" style={styles.heading}>
              {t('Record a New Check')}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t('Count the money the group really holds today: its mobile money or bank statement balance, plus any cash. Then compare it with the system.')}
            </ThemedText>
            <TextField
              label={t('Amount actually held ({currency})', { currency: group.currency })}
              placeholder="0"
              keyboardType="numeric"
              value={actual}
              onChangeText={setActual}
            />
            <TextField
              label={t('Note (optional)')}
              placeholder={t('e.g. M-Pesa statement 26 Nov + cash box')}
              value={note}
              onChangeText={setNote}
              maxLength={1000}
            />
            {error ? (
              <ThemedText type="small" themeColor="danger">
                {t(error)}
              </ThemedText>
            ) : null}
            <Button title={t('Compare')} onPress={compare} loading={busy} />
          </Card>

          {/* How much of the contributions have been verified against the provider */}
          {breakdown ? (
            <Card>
              <ThemedText type="smallBold" style={styles.heading}>
                {t('Contribution Verification')}
              </ThemedText>
              <ProgressBar value={contributionsTotal > 0 ? breakdown.verifiedAmount / contributionsTotal : 0} />
              <Line label={t('Verified')} value={money(breakdown.verifiedAmount)} />
              <Line
                label={t('Not yet verified ({count})', { count: breakdown.unverifiedCount })}
                value={money(breakdown.unverifiedAmount)}
              />
              <Line
                label={t('Under investigation ({count})', { count: breakdown.investigateCount })}
                value={money(breakdown.investigateAmount)}
              />
              <Divider />
              <MenuRow
                iconName={icon('checkmark.rectangle', 'fact_check')}
                title={t('Review Transactions')}
                subtitle={t('Verify each one against the provider, or reverse a mistake')}
                onPress={() => router.push('/(app)/admin/transactions')}
              />
            </Card>
          ) : null}

          {/* Past checks */}
          {checks.length > 0 ? (
            <Card>
              <ThemedText type="smallBold" style={styles.heading}>
                {t('Previous Checks')}
              </ThemedText>
              {checks.map((c, i) => (
                <View key={c.id}>
                  {i > 0 ? <Divider /> : null}
                  <View style={styles.historyRow}>
                    <View style={styles.flex}>
                      <ThemedText type="smallBold">
                        {new Date(c.created_at).toLocaleDateString()}
                        {c.checker_name ? ` • ${c.checker_name}` : ''}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {t('Held {actual} • Expected {expected}', {
                          actual: money(c.actual_balance),
                          expected: money(c.expected_balance),
                        })}
                      </ThemedText>
                      {c.note ? (
                        <ThemedText type="small" themeColor="textSecondary">
                          {c.note}
                        </ThemedText>
                      ) : null}
                    </View>
                    <Pill
                      label={
                        c.difference === 0
                          ? t('Balanced')
                          : `${c.difference > 0 ? '+' : '−'}${Math.abs(c.difference).toLocaleString()}`
                      }
                      tone={c.difference === 0 ? 'good' : 'bad'}
                    />
                  </View>
                </View>
              ))}
            </Card>
          ) : null}

          <ThemedText type="small" themeColor="textSecondary" style={styles.footnote}>
            {t('A check never changes any money. Fix a difference by verifying transactions and reversing mistakes.')}
          </ThemedText>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.line}>
      <ThemedText type="default" themeColor="textSecondary" style={styles.flex}>
        {label}
      </ThemedText>
      <ThemedText type={strong ? 'subtitle' : 'smallBold'} style={strong ? styles.strong : undefined}>
        {value}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centerBox: { alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  content: { flexGrow: 1, padding: Spacing.four, paddingBottom: Spacing.five },
  column: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', gap: Spacing.three },
  heading: { fontSize: 16 },
  line: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  strong: { fontSize: 18, lineHeight: 24 },
  result: {
    alignItems: 'center',
    gap: Spacing.one,
    padding: Spacing.four,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  resultGood: { backgroundColor: 'rgba(34, 197, 94, 0.10)', borderColor: 'rgba(34, 197, 94, 0.45)' },
  resultBad: { backgroundColor: 'rgba(220, 38, 38, 0.08)', borderColor: 'rgba(220, 38, 38, 0.4)' },
  resultTitle: { textAlign: 'center' },
  resultText: { textAlign: 'center' },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two },
  footnote: { textAlign: 'center' },
});
