import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSession } from '@/lib/auth/session-context';
import { useMembership } from '@/lib/membership-context';
import { supabase } from '@/lib/supabase';

const OPEN_LOAN_STATUSES = ['pending_review', 'approved', 'disbursed', 'repaying'];

type LoanSummary = {
  id: string;
  principal: number;
  status: string;
  created_at: string;
};

type ReviewNeeded = { loan_id: string; principal: number };

// Ticket 17: "My Loan / Eligibility" entry point, plus a "Reviews Needed"
// section -- any member could simultaneously be a borrower on their own
// loan and a reviewer on someone else's, so both live on the same hub.
export default function LoanHubScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { session } = useSession();
  const { group } = useMembership();

  const [eligibleAmount, setEligibleAmount] = useState<number | null>(null);
  const [openLoan, setOpenLoan] = useState<LoanSummary | null>(null);
  const [history, setHistory] = useState<LoanSummary[]>([]);
  const [reviewsNeeded, setReviewsNeeded] = useState<ReviewNeeded[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!group || !session) return;
    (async () => {
      setLoading(true);

      const { data: eligibility } = await supabase
        .from('loan_eligibility')
        .select('eligible_amount')
        .eq('group_id', group.id)
        .eq('member_id', session.user.id)
        .maybeSingle();
      setEligibleAmount(eligibility?.eligible_amount ?? 0);

      const { data: loans } = await supabase
        .from('loans')
        .select('id, principal, status, created_at')
        .eq('group_id', group.id)
        .eq('borrower_id', session.user.id)
        .order('created_at', { ascending: false });

      const open = (loans ?? []).find((l) => OPEN_LOAN_STATUSES.includes(l.status)) ?? null;
      setOpenLoan(open);
      setHistory((loans ?? []).filter((l) => l.id !== open?.id));

      const { data: pendingReviews } = await supabase
        .from('loan_reviewers')
        .select('loan_id, loans(principal)')
        .eq('reviewer_id', session.user.id)
        .eq('decision', 'pending');
      setReviewsNeeded(
        ((pendingReviews ?? []) as unknown as { loan_id: string; loans: { principal: number } }[]).map(
          (r) => ({ loan_id: r.loan_id, principal: r.loans.principal })
        )
      );

      setLoading(false);
    })();
  }, [group, session]);

  if (!group) return null;

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['bottom']}>
        <FlatList
          data={reviewsNeeded}
          keyExtractor={(r) => r.loan_id}
          refreshing={loading}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.header}>
              {openLoan ? (
                // A filled, bordered card with an explicit call to action, so
                // it reads as tappable (repayments live on the detail screen).
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/(app)/loan/[id]', params: { id: openLoan.id } })}
                  style={({ pressed }) => [
                    styles.openLoanCard,
                    {
                      backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
                      borderColor: theme.primary,
                    },
                  ]}>
                  <ThemedText type="subtitle">My Loan</ThemedText>
                  <ThemedText type="title">
                    {group.currency} {openLoan.principal.toLocaleString()}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    Status: {openLoan.status.replace('_', ' ')}
                  </ThemedText>
                  <ThemedText type="smallBold" themeColor="primary">
                    {openLoan.status === 'disbursed' || openLoan.status === 'repaying'
                      ? 'View details & make a repayment →'
                      : 'View details →'}
                  </ThemedText>
                </Pressable>
              ) : (
                <View style={styles.card}>
                  <ThemedText type="subtitle">Eligible Amount</ThemedText>
                  <ThemedText type="title">
                    {group.currency} {(eligibleAmount ?? 0).toLocaleString()}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    Your eligibility is based on your group rules and standing.
                  </ThemedText>
                  <Button title="Apply for Loan" onPress={() => router.push('/(app)/loan/apply')} />
                </View>
              )}

              {reviewsNeeded.length > 0 ? (
                <ThemedText type="subtitle" style={styles.sectionTitle}>
                  Reviews Needed
                </ThemedText>
              ) : null}
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: '/(app)/loan/[id]', params: { id: item.loan_id } })}
              style={styles.card}>
              <ThemedText type="default">
                Loan request: {group.currency} {item.principal.toLocaleString()}
              </ThemedText>
              <ThemedText type="small" themeColor="primary">
                Review needed →
              </ThemedText>
            </Pressable>
          )}
          ListFooterComponent={
            history.length > 0 ? (
              <View>
                <ThemedText type="subtitle" style={styles.sectionTitle}>
                  Past Loans
                </ThemedText>
                {history.map((l) => (
                  <Pressable
                    key={l.id}
                    onPress={() => router.push({ pathname: '/(app)/loan/[id]', params: { id: l.id } })}
                    style={styles.card}>
                    <ThemedText type="default">
                      {group.currency} {l.principal.toLocaleString()}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {l.status.replace('_', ' ')}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            ) : null
          }
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: Spacing.four, gap: Spacing.two },
  header: { gap: Spacing.two },
  sectionTitle: { marginTop: Spacing.three },
  card: { gap: Spacing.one, paddingVertical: Spacing.three, borderBottomWidth: StyleSheet.hairlineWidth },
  openLoanCard: { gap: Spacing.one, padding: Spacing.four, borderRadius: 16, borderWidth: 1 },
});
