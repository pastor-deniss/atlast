import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
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

type Loan = {
  id: string;
  group_id: string;
  borrower_id: string;
  principal: number;
  purpose: string | null;
  term_weeks: number;
  installment_amount: number;
  status: string;
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
  const [outstanding, setOutstanding] = useState<{ total_repaid: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [clarificationText, setClarificationText] = useState('');
  const [repayAmount, setRepayAmount] = useState('');
  const [repayReference, setRepayReference] = useState('');

  const load = useCallback(async () => {
    if (!id || !session) return;
    setLoading(true);

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

    if (loanRow.status === 'disbursed' || loanRow.status === 'repaying' || loanRow.status === 'repaid') {
      const { data: balance } = await supabase
        .from('loan_balances')
        .select('total_repaid')
        .eq('loan_id', id)
        .maybeSingle();
      setOutstanding(balance ?? { total_repaid: 0 });
    }

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

  async function invoke(name: string, body: Record<string, unknown>) {
    setError(null);
    setBusy(true);
    const { data, error: fnError } = await supabase.functions.invoke(name, { body });
    setBusy(false);
    const errorMessage = (data as { error?: string })?.error ?? fnError?.message;
    if (errorMessage) {
      setError(errorMessage);
      return false;
    }
    await load();
    return true;
  }

  const declineCount = progress?.filter((d) => d === 'decline').length ?? 0;
  const approveCount = progress?.filter((d) => d === 'approve').length ?? 0;

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['bottom']}>
        <View style={styles.content}>
          <ThemedText type="title">
            {group.currency} {loan.principal.toLocaleString()}
          </ThemedText>
          {loan.purpose ? (
            <ThemedText type="default" themeColor="textSecondary">
              {loan.purpose} · {loan.term_weeks} weeks
            </ThemedText>
          ) : null}
          <ThemedText type="small" themeColor="primary">
            {loan.status.replace('_', ' ')}
          </ThemedText>

          {error ? (
            <ThemedText type="small" themeColor="danger">
              {error}
            </ThemedText>
          ) : null}

          {/* Under review: anonymized progress, visible to everyone (ticket 12/17) */}
          {loan.status === 'pending_review' && loan.review_mode === 'three_eye' && progress ? (
            <View style={styles.section}>
              <ThemedText type="subtitle">Three-Eye Approval</ThemedText>
              {progress.map((decision, i) => (
                <ThemedText key={i} type="default">
                  Reviewer {i + 1}: {decision === 'pending' ? 'Pending' : decision === 'approve' ? 'Approved' : 'Declined'}
                </ThemedText>
              ))}
            </View>
          ) : null}

          {loan.status === 'pending_review' && loan.review_mode === 'admin_fallback' && !canAdminDecide ? (
            <ThemedText type="default" themeColor="textSecondary">
              Your loan application is under review. You will be notified of the decision.
            </ThemedText>
          ) : null}

          {/* Reviewer action panel */}
          {canReview && evidence ? (
            <View style={styles.section}>
              <ThemedText type="subtitle">Borrower Eligibility</ThemedText>
              <ThemedText type="default">Total contributed: {group.currency} {evidence.total_contributed.toLocaleString()}</ThemedText>
              <ThemedText type="default">Previous loans: {evidence.previous_loans}</ThemedText>
              <ThemedText type="default">Previous loans repaid: {evidence.previous_loans_repaid}</ThemedText>
              <ThemedText type="default">Defaults: {evidence.defaults}</ThemedText>

              <View style={styles.row}>
                <Button title="Approve" onPress={() => invoke('cast-loan-review-decision', { loan_id: id, decision: 'approve' })} loading={busy} />
                <Button title="Decline" variant="danger" onPress={() => invoke('cast-loan-review-decision', { loan_id: id, decision: 'decline' })} loading={busy} />
              </View>

              <TextField
                label="Request Clarification"
                placeholder="Ask the borrower a question"
                value={clarificationText}
                onChangeText={setClarificationText}
              />
              <Button
                title="Send"
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
              <ThemedText type="subtitle">Admin Review</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Fewer than 3 eligible reviewers exist — this loan falls back to Admin decision.
              </ThemedText>
              <View style={styles.row}>
                <Button title="Approve" onPress={() => invoke('admin-decide-loan', { loan_id: id, decision: 'approve' })} loading={busy} />
                <Button title="Decline" variant="danger" onPress={() => invoke('admin-decide-loan', { loan_id: id, decision: 'decline' })} loading={busy} />
              </View>
            </View>
          ) : null}

          {loan.status === 'approved' ? (
            <View style={styles.section}>
              <ThemedText type="subtitle">Loan Approved!</ThemedText>
              <ThemedText type="default" themeColor="textSecondary">
                The money will be sent to your selected payment channel.
              </ThemedText>
              {isAdmin ? (
                <Button title="Money Sent (Disburse)" onPress={() => invoke('disburse-loan', { loan_id: id })} loading={busy} />
              ) : null}
            </View>
          ) : null}

          {loan.status === 'declined' ? (
            <View style={styles.section}>
              <ThemedText type="subtitle">Loan Declined</ThemedText>
              <ThemedText type="default" themeColor="textSecondary">
                {loan.review_mode === 'three_eye'
                  ? `${declineCount} of ${declineCount + approveCount + (progress?.filter((d) => d === 'pending').length ?? 0)} reviewers declined your application.`
                  : 'Your application was not approved.'}{' '}
                You may submit a new application.
              </ThemedText>
              {isBorrower ? <Button title="Apply Again" onPress={() => router.replace('/(app)/loan/apply')} /> : null}
            </View>
          ) : null}

          {(loan.status === 'disbursed' || loan.status === 'repaying') && outstanding ? (
            <View style={styles.section}>
              <ThemedText type="subtitle">Loan Progress</ThemedText>
              <ThemedText type="default">
                Paid {group.currency} {outstanding.total_repaid.toLocaleString()} of {group.currency} {loan.principal.toLocaleString()}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Remaining: {group.currency} {(loan.principal - outstanding.total_repaid).toLocaleString()}
              </ThemedText>

              {isBorrower ? (
                <>
                  <TextField
                    label="Repayment Amount"
                    value={repayAmount}
                    onChangeText={setRepayAmount}
                    keyboardType="numeric"
                    placeholder={String(loan.installment_amount)}
                  />
                  <TextField label="Reference" value={repayReference} onChangeText={setRepayReference} />
                  <Button
                    title="Confirm Payment"
                    onPress={() =>
                      invoke('record-loan-repayment', {
                        loan_id: id,
                        amount: Number(repayAmount || loan.installment_amount),
                        reference: repayReference,
                      })
                    }
                    loading={busy}
                    disabled={!repayReference.trim()}
                  />
                </>
              ) : null}

              {isAdmin ? (
                <Button
                  title="Flag Default"
                  variant="danger"
                  onPress={() => invoke('flag-loan-default', { loan_id: id, reason: 'Manually flagged by Group Admin' })}
                  loading={busy}
                />
              ) : null}
            </View>
          ) : null}

          {loan.status === 'repaid' ? (
            <View style={styles.section}>
              <ThemedText type="subtitle">Loan Fully Repaid!</ThemedText>
              <ThemedText type="default" themeColor="textSecondary">
                You have successfully repaid your loan. Ready for next loan.
              </ThemedText>
            </View>
          ) : null}

          {loan.status === 'defaulted' ? (
            <ThemedText type="default" themeColor="danger">
              This loan was flagged as defaulted.
            </ThemedText>
          ) : null}

          {messages.length > 0 ? (
            <View style={styles.section}>
              <ThemedText type="subtitle">Messages from Reviewers</ThemedText>
              {messages.map((m, i) => (
                <ThemedText key={i} type="default">
                  {m.message}
                </ThemedText>
              ))}
            </View>
          ) : null}
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.two },
  section: { gap: Spacing.two, marginTop: Spacing.three, paddingTop: Spacing.three, borderTopWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', gap: Spacing.two },
});
