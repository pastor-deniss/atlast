import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LoanProgressRing } from '@/components/charts/loan-progress-ring';
import { PaymentMethodPicker } from '@/components/payment-method-picker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDateTime } from '@/lib/datetime';
import { useSession } from '@/lib/auth/session-context';
import { useMembership } from '@/lib/membership-context';
import { functionErrorMessage } from '@/lib/function-error';
import { supabase } from '@/lib/supabase';
import { useT } from '@/lib/i18n';
import { defaultRate, fetchLoanDue, formatRate, loanStanding, type LoanDue } from '@/lib/loans';
import { needsReference, paymentMethodLabel, type PaymentMethod } from '@/lib/payment-methods';

type Loan = {
  id: string;
  group_id: string;
  borrower_id: string;
  principal: number;
  purpose: string | null;
  term_weeks: number;
  installment_amount: number;
  status: string;
  disbursed_at: string | null;
  review_mode: 'three_eye' | 'admin_fallback';
};

type Evidence = {
  total_contributed: number;
  previous_loans: number;
  previous_loans_repaid: number;
  defaults: number;
};

// Ticket 17: one screen, content adapts to who's looking and the loan's
// status -- borrower, an assigned reviewer, a Group Admin (admin_fallback),
// or a bystander (any active member, per ticket 12's full loan transparency)
// all land on the same URL.
export default function LoanDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const { group, membership } = useMembership();

  const [loan, setLoan] = useState<Loan | null>(null);
  const [progress, setProgress] = useState<string[] | null>(null);
  const [myReview, setMyReview] = useState<{ decision: string } | null>(null);
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [messages, setMessages] = useState<{ message: string; created_at: string }[]>([]);
  const [due, setDue] = useState<LoanDue | null>(null);
  const [standing, setStanding] = useState<'good' | 'warn' | 'bad'>('good');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [clarificationText, setClarificationText] = useState('');
  const [repayAmount, setRepayAmount] = useState('');
  const [repayReference, setRepayReference] = useState('');
  const [repayMethod, setRepayMethod] = useState<PaymentMethod | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // Synchronous guard: `busy` state only disables the button after the next
  // render, so a fast double-click could still fire two requests.
  const inFlight = useRef(false);
  const theme = useTheme();
  const t = useT();

  // `loading` only blanks the screen on the first load (see the early return
  // below); refreshes after an action keep the current content on screen.
  const load = useCallback(async () => {
    if (!id || !session) return;

    const { data: loanRow } = await supabase.from('loans').select('*').eq('id', id).single();
    setLoan(loanRow);
    if (!loanRow) {
      setLoading(false);
      return;
    }

    const { data: progressRow } = await supabase
      .from('loan_review_progress')
      .select('reviewer_decisions')
      .eq('loan_id', id)
      .maybeSingle();
    setProgress(progressRow?.reviewer_decisions ?? null);

    const { data: myReviewRow } = await supabase
      .from('loan_reviewers')
      .select('decision')
      .eq('loan_id', id)
      .eq('reviewer_id', session.user.id)
      .maybeSingle();
    setMyReview(myReviewRow);

    if (myReviewRow) {
      const { data: totals } = await supabase
        .from('member_contribution_totals')
        .select('total_contributed')
        .eq('group_id', loanRow.group_id)
        .eq('member_id', loanRow.borrower_id)
        .maybeSingle();
      const { data: borrowerLoans } = await supabase
        .from('loans')
        .select('status')
        .eq('group_id', loanRow.group_id)
        .eq('borrower_id', loanRow.borrower_id);
      setEvidence({
        total_contributed: totals?.total_contributed ?? 0,
        previous_loans: (borrowerLoans ?? []).length,
        previous_loans_repaid: (borrowerLoans ?? []).filter((l) => l.status === 'repaid').length,
        defaults: (borrowerLoans ?? []).filter((l) => l.status === 'defaulted').length,
      });
    }

    const { data: messageRows } = await supabase
      .from('loan_clarification_messages')
      .select('message, created_at')
      .eq('loan_id', id)
      .order('created_at', { ascending: false });
    setMessages(messageRows ?? []);

    // Interest, penalties so far and what is still owed, worked out by the
    // database (loan_dues), so every screen agrees with the repayment rules.
    const loanDue = await fetchLoanDue(id);
    setDue(loanDue);
    if (loanRow && loanDue) setStanding(loanStanding(defaultRate(loanRow, loanDue), loanDue.is_overdue));

    setLoading(false);
  }, [id, session]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !loan || !group || !session) return null;

  const isBorrower = loan.borrower_id === session.user.id;
  const isAdmin = membership?.role === 'group_admin';
  const canReview = !!myReview && myReview.decision === 'pending' && loan.status === 'pending_review';
  const canAdminDecide =
    isAdmin && loan.review_mode === 'admin_fallback' && loan.status === 'pending_review';

  // Returns the function's response on success, or null.
  async function invoke(name: string, body: Record<string, unknown>) {
    if (inFlight.current) return null;
    inFlight.current = true;
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke(name, { body });
      const errorMessage =
        (data as { error?: string } | null)?.error ?? (await functionErrorMessage(fnError));
      if (errorMessage) {
        setError(errorMessage);
        return null;
      }
      await load();
      return (data ?? {}) as Record<string, unknown>;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function confirmRepayment() {
    const amount = Number(
      repayAmount || Math.min(loan!.installment_amount, due?.outstanding ?? loan!.installment_amount)
    );
    const reference = repayReference.trim();
    const result = await invoke('record-loan-repayment', {
      loan_id: id,
      amount,
      reference,
      payment_method: repayMethod,
    });
    if (result) {
      const amountText = `${group!.currency} ${amount.toLocaleString()}`;
      const txnNumber = (result.transaction as { txn_number?: string } | null)?.txn_number;
      setRepayAmount('');
      setRepayReference('');
      setRepayMethod(null);
      const message = reference
          ? t('Payment recorded: {amount} (reference {reference}).', { amount: amountText, reference })
          : t('Payment recorded: {amount} ({method}).', {
              amount: amountText,
              method: t(paymentMethodLabel(repayMethod)),
            });
      setSuccess(
        txnNumber ? `${message}\n${t('Transaction No.: {number}', { number: txnNumber })}` : message
      );
    }
  }

  const declineCount = progress?.filter((d) => d === 'decline').length ?? 0;
  const approveCount = progress?.filter((d) => d === 'approve').length ?? 0;

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ThemedText type="title">
            {group.currency} {loan.principal.toLocaleString()}
          </ThemedText>
          {loan.purpose ? (
            <ThemedText type="default" themeColor="textSecondary">
              {loan.purpose} · {t('{count} weeks', { count: loan.term_weeks })}
            </ThemedText>
          ) : null}
          <ThemedText type="small" themeColor="primary">
            {t(loan.status.replace('_', ' '))}
          </ThemedText>

          {due && (due.interest_amount > 0 || due.penalty_weekly_rate > 0) ? (
            <View style={[styles.costBox, { backgroundColor: theme.backgroundElement }]}>
              <View style={styles.costItem}>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('Interest ({rate})', { rate: formatRate(due.interest_rate) })}
                </ThemedText>
                <ThemedText type="smallBold">
                  {group.currency} {due.interest_amount.toLocaleString()}
                </ThemedText>
              </View>
              <View style={styles.costItem}>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('Penalty ({rate}/week)', { rate: formatRate(due.penalty_weekly_rate) })}
                </ThemedText>
                <ThemedText type="smallBold" themeColor={due.penalty > 0 ? 'danger' : 'text'}>
                  {group.currency} {due.penalty.toLocaleString()}
                </ThemedText>
              </View>
              <View style={styles.costItem}>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('Total to repay')}
                </ThemedText>
                <ThemedText type="smallBold">
                  {group.currency} {due.total_due.toLocaleString()}
                </ThemedText>
              </View>
            </View>
          ) : null}

          {error ? (
            <ThemedText type="small" themeColor="danger">
              {t(error)}
            </ThemedText>
          ) : null}

          {success ? (
            <View style={[styles.successBanner, { borderColor: theme.primary }]}>
              <ThemedText type="smallBold" themeColor="primary">
                ✓ {success}
              </ThemedText>
            </View>
          ) : null}

          {/* Under review: anonymized progress, visible to everyone (ticket 12/17) */}
          {loan.status === 'pending_review' && loan.review_mode === 'three_eye' && progress ? (
            <View style={styles.section}>
              <ThemedText type="subtitle">{t('Three-Eye Approval')}</ThemedText>
              {progress.map((decision, i) => (
                <ThemedText key={i} type="default">
                  {t('Reviewer {number}: {decision}', {
                    number: i + 1,
                    decision:
                      decision === 'pending'
                        ? t('Pending')
                        : decision === 'approve'
                          ? t('Approved')
                          : t('Declined'),
                  })}
                </ThemedText>
              ))}
            </View>
          ) : null}

          {loan.status === 'pending_review' && loan.review_mode === 'admin_fallback' && !canAdminDecide ? (
            <ThemedText type="default" themeColor="textSecondary">
              {t('Your loan application is under review. You will be notified of the decision.')}
            </ThemedText>
          ) : null}

          {/* Reviewer action panel */}
          {canReview && evidence ? (
            <View style={styles.section}>
              <ThemedText type="subtitle">{t('Borrower Eligibility')}</ThemedText>
              <ThemedText type="default">{t('Total contributed: {amount}', { amount: `${group.currency} ${evidence.total_contributed.toLocaleString()}` })}</ThemedText>
              <ThemedText type="default">{t('Previous loans: {count}', { count: evidence.previous_loans })}</ThemedText>
              <ThemedText type="default">{t('Previous loans repaid: {count}', { count: evidence.previous_loans_repaid })}</ThemedText>
              <ThemedText type="default">{t('Defaults: {count}', { count: evidence.defaults })}</ThemedText>

              <View style={styles.row}>
                <Button title={t('Approve')} onPress={() => invoke('cast-loan-review-decision', { loan_id: id, decision: 'approve' })} loading={busy} />
                <Button title={t('Decline')} variant="danger" onPress={() => invoke('cast-loan-review-decision', { loan_id: id, decision: 'decline' })} loading={busy} />
              </View>

              <TextField
                label={t('Request Clarification')}
                placeholder={t('Ask the borrower a question')}
                value={clarificationText}
                onChangeText={setClarificationText}
              />
              <Button
                title={t('Send')}
                variant="secondary"
                disabled={!clarificationText.trim()}
                onPress={async () => {
                  const ok = await invoke('send-loan-clarification-request', { loan_id: id, message: clarificationText });
                  if (ok) setClarificationText('');
                }}
              />
            </View>
          ) : null}

          {/* Admin fallback decision panel */}
          {canAdminDecide ? (
            <View style={styles.section}>
              <ThemedText type="subtitle">{t('Admin Review')}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {t('Fewer than 3 eligible reviewers exist — this loan falls back to Admin decision.')}
              </ThemedText>
              <View style={styles.row}>
                <Button title={t('Approve')} onPress={() => invoke('admin-decide-loan', { loan_id: id, decision: 'approve' })} loading={busy} />
                <Button title={t('Decline')} variant="danger" onPress={() => invoke('admin-decide-loan', { loan_id: id, decision: 'decline' })} loading={busy} />
              </View>
            </View>
          ) : null}

          {loan.status === 'approved' ? (
            <View style={styles.section}>
              <ThemedText type="subtitle">{t('Loan Approved!')}</ThemedText>
              <ThemedText type="default" themeColor="textSecondary">
                {t('The money will be sent to your selected payment channel.')}
              </ThemedText>
              {isAdmin || membership?.role === 'treasurer' ? (
                <Button title={t('Money Sent (Disburse)')} onPress={() => invoke('disburse-loan', { loan_id: id })} loading={busy} />
              ) : null}
            </View>
          ) : null}

          {loan.status === 'declined' ? (
            <View style={styles.section}>
              <ThemedText type="subtitle">{t('Loan Declined')}</ThemedText>
              <ThemedText type="default" themeColor="textSecondary">
                {loan.review_mode === 'three_eye'
                  ? t('{declined} of {total} reviewers declined your application.', {
                      declined: declineCount,
                      total:
                        declineCount +
                        approveCount +
                        (progress?.filter((d) => d === 'pending').length ?? 0),
                    })
                  : t('Your application was not approved.')}{' '}
                {t('You may submit a new application.')}
              </ThemedText>
              {isBorrower ? <Button title={t('Apply Again')} onPress={() => router.replace('/(app)/loan/apply')} /> : null}
            </View>
          ) : null}

          {(loan.status === 'disbursed' || loan.status === 'repaying') && due ? (
            <View style={styles.section}>
              <ThemedText type="subtitle">{t('Loan Progress')}</ThemedText>
              <LoanProgressRing
                paid={due.repaid}
                total={due.total_due}
                tone={standing}
                format={(n) => `${group.currency} ${Math.round(n).toLocaleString()}`}
              />
              <ThemedText type="default">
                {t('Paid {paid} of {total}', {
                  paid: `${group.currency} ${due.repaid.toLocaleString()}`,
                  total: `${group.currency} ${due.total_due.toLocaleString()}`,
                })}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {t('Remaining: {amount}', {
                  amount: `${group.currency} ${due.outstanding.toLocaleString()}`,
                })}
              </ThemedText>
              {due.due_at ? (
                <ThemedText type="small" themeColor={due.is_overdue ? 'danger' : 'textSecondary'}>
                  {due.is_overdue
                    ? t('Overdue since {date}. A penalty of {rate} of what is owed is added each full week late.', {
                        date: new Date(due.due_at).toLocaleDateString(),
                        rate: formatRate(due.penalty_weekly_rate),
                      })
                    : t('Due date: {date}', { date: new Date(due.due_at).toLocaleDateString() })}
                </ThemedText>
              ) : null}

              {isBorrower ? (
                <>
                  <TextField
                    label={t('Repayment Amount')}
                    value={repayAmount}
                    onChangeText={setRepayAmount}
                    keyboardType="numeric"
                    placeholder={String(Math.min(loan.installment_amount, due.outstanding))}
                  />
                  <PaymentMethodPicker value={repayMethod} onChange={setRepayMethod} />
                  {repayMethod ? (
                    <TextField
                      label={repayMethod === 'cash' ? t('Receipt number (optional)') : t('Reference')}
                      value={repayReference}
                      onChangeText={setRepayReference}
                      placeholder={
                        repayMethod === 'cash'
                          ? t('If the person you paid gave you a receipt')
                          : t('Mobile money confirmation code')
                      }
                    />
                  ) : null}
                  <Button
                    title={t('Confirm Payment')}
                    onPress={confirmRepayment}
                    loading={busy}
                    disabled={!repayMethod || (needsReference(repayMethod) && !repayReference.trim())}
                  />
                </>
              ) : null}

              {isAdmin ? (
                <Button
                  title={t('Flag Default')}
                  variant="danger"
                  onPress={() => invoke('flag-loan-default', { loan_id: id, reason: 'Manually flagged by Group Admin' })}
                  loading={busy}
                />
              ) : null}
            </View>
          ) : null}

          {loan.status === 'repaid' ? (
            <View style={styles.section}>
              <ThemedText type="subtitle">{t('Loan Fully Repaid!')}</ThemedText>
              <ThemedText type="default" themeColor="textSecondary">
                {t('You have successfully repaid your loan. Ready for next loan.')}
              </ThemedText>
            </View>
          ) : null}

          {loan.status === 'defaulted' ? (
            <ThemedText type="default" themeColor="danger">
              {t('This loan was flagged as defaulted.')}
            </ThemedText>
          ) : null}

          {messages.length > 0 ? (
            <View style={styles.section}>
              <ThemedText type="subtitle">{t('Messages from Reviewers')}</ThemedText>
              {messages.map((m, i) => (
                <View key={i}>
                  <ThemedText type="default">{m.message}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {formatDateTime(m.created_at)}
                  </ThemedText>
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  costBox: { flexDirection: 'row', borderRadius: 14, padding: Spacing.three, gap: Spacing.two },
  costItem: { flex: 1, alignItems: 'center', gap: 2 },
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.two },
  section: { gap: Spacing.two, marginTop: Spacing.three, paddingTop: Spacing.three, borderTopWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', gap: Spacing.two },
  successBanner: { borderWidth: 1, borderRadius: 12, padding: Spacing.three },
});
