import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { SymbolView } from 'expo-symbols';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { STATUS } from '@/components/charts/status-colors';
import { Card, icon, Pill } from '@/components/ui/screen';
import { Brand, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSession } from '@/lib/auth/session-context';
import { useMembership } from '@/lib/membership-context';
import { supabase } from '@/lib/supabase';
import { useT } from '@/lib/i18n';
import { defaultRate, fetchLoanDue, nextRepaymentDate, type LoanDue } from '@/lib/loans';

const OPEN_LOAN_STATUSES = ['pending_review', 'approved', 'disbursed', 'repaying'];

type LoanSummary = {
  id: string;
  principal: number;
  status: string;
  created_at: string;
  disbursed_at: string | null;
  installment_amount: number | null;
  term_weeks: number;
};

/** Below 30% green, 30-60% yellow, above 60% red. */
function defaultTone(rate: number): 'good' | 'warn' | 'bad' {
  if (rate > 60) return 'bad';
  if (rate >= 30) return 'warn';
  return 'good';
}

type ReviewNeeded = { loan_id: string; principal: number };

// Ticket 17: "My Loan / Eligibility" entry point, plus a "Reviews Needed"
// section -- any member could simultaneously be a borrower on their own
// loan and a reviewer on someone else's, so both live on the same hub.
export default function LoanHubScreen() {
  const router = useRouter();
  const theme = useTheme();
  const t = useT();
  const { session } = useSession();
  const { group } = useMembership();

  const [eligibleAmount, setEligibleAmount] = useState<number | null>(null);
  const [openLoan, setOpenLoan] = useState<LoanSummary | null>(null);
  const [due, setDue] = useState<LoanDue | null>(null);
  const [schedule, setSchedule] = useState<{ rate: number; next: Date; late: boolean } | null>(null);
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
        .select('id, principal, status, created_at, disbursed_at, installment_amount, term_weeks')
        .eq('group_id', group.id)
        .eq('borrower_id', session.user.id)
        .order('created_at', { ascending: false });

      const open = (loans ?? []).find((l) => OPEN_LOAN_STATUSES.includes(l.status)) ?? null;
      setOpenLoan(open);
      const openDue = open ? await fetchLoanDue(open.id) : null;
      setDue(openDue);
      if (open && openDue) {
        const next = nextRepaymentDate(open, openDue);
        setSchedule({ rate: defaultRate(open, openDue), next, late: next.getTime() < Date.now() });
      } else {
        setSchedule(null);
      }
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
  const money = (n: number) => `${group.currency} ${Math.round(n).toLocaleString()}`;

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
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/(app)/loan/[id]', params: { id: openLoan.id } })}
                  style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
                  <Card>
                    <View style={styles.loanHead}>
                      <View style={styles.flex}>
                        <ThemedText type="small" themeColor="textSecondary">
                          {t('My Loan')}
                        </ThemedText>
                        <ThemedText type="subtitle" style={styles.amount}>
                          {money(openLoan.principal)}
                        </ThemedText>
                      </View>
                      <Pill label={t(openLoan.status.replace('_', ' '))} tone={due?.is_overdue ? 'bad' : 'neutral'} />
                    </View>

                    {due ? (
                      <View style={[styles.figures, { backgroundColor: theme.backgroundSelected }]}>
                        <Figure label={t('Interest')} value={money(due.interest_amount)} />
                        <Figure label={t('Paid so far')} value={money(due.repaid)} />
                        <Figure
                          label={t('Repayment amount')}
                          value={money(Math.min(openLoan.installment_amount ?? due.outstanding, due.outstanding))}
                          note={t('per week')}
                        />
                        <DefaultFigure rate={schedule?.rate ?? 0} label={t('Default rate')} />
                      </View>
                    ) : null}

                    {schedule && due && due.outstanding > 0 && openLoan.disbursed_at ? (
                      <ThemedText type="smallBold" themeColor={schedule.late ? 'danger' : 'text'}>
                        {schedule.late
                          ? t('Repayment overdue since {date}', { date: schedule.next.toLocaleDateString() })
                          : t('Next repayment: {date}', { date: schedule.next.toLocaleDateString() })}
                      </ThemedText>
                    ) : null}
                    {due ? (
                      <ThemedText type="small" themeColor="textSecondary">
                        {t('Still owed: {amount}', { amount: money(due.outstanding) })}
                      </ThemedText>
                    ) : null}
                    <ThemedText type="smallBold" themeColor="primary">
                      {openLoan.status === 'disbursed' || openLoan.status === 'repaying'
                        ? t('View details & make a repayment →')
                        : t('View details →')}
                    </ThemedText>
                  </Card>
                </Pressable>
              ) : null}

              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/(app)/loan/apply')}
                style={({ pressed }) => [styles.applyButton, { opacity: pressed ? 0.85 : 1 }]}>
                <SymbolView name={icon('wallet.pass', 'account_balance_wallet')} size={22} tintColor={Brand.cream} />
                <ThemedText type="default" style={styles.applyText}>
                  {t('Apply for Loan')}
                </ThemedText>
              </Pressable>
              <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
                {t('Maximum eligible: {amount}', { amount: money(eligibleAmount ?? 0) })}
              </ThemedText>

              {reviewsNeeded.length > 0 ? (
                <ThemedText type="subtitle" style={styles.sectionTitle}>
                  {t('Reviews Needed')}
                </ThemedText>
              ) : null}
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: '/(app)/loan/[id]', params: { id: item.loan_id } })}
              style={styles.card}>
              <ThemedText type="default">
                {t('Loan request: {amount}', {
                  amount: `${group.currency} ${item.principal.toLocaleString()}`,
                })}
              </ThemedText>
              <ThemedText type="small" themeColor="primary">
                {t('Review needed →')}
              </ThemedText>
            </Pressable>
          )}
          ListFooterComponent={
            history.length > 0 ? (
              <View>
                <ThemedText type="subtitle" style={styles.sectionTitle}>
                  {t('Past Loans')}
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
                      {t(l.status.replace('_', ' '))}
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

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <View style={styles.figure}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
        {label}
      </ThemedText>
      <ThemedText type="smallBold" style={styles.center}>
        {value}
      </ThemedText>
      {note ? (
        <ThemedText type="small" themeColor="textSecondary" style={[styles.center, styles.note]}>
          {note}
        </ThemedText>
      ) : null}
    </View>
  );
}

// Colour is never the only signal: the band word sits under the number.
function DefaultFigure({ rate, label }: { rate: number; label: string }) {
  const t = useT();
  const tone = defaultTone(rate);
  const word = { good: t('Low'), warn: t('Medium'), bad: t('High') }[tone];
  // Darker amber than the status yellow so the text stays readable on light cards.
  const color = { good: STATUS.good, warn: '#B7791F', bad: STATUS.bad }[tone];
  return (
    <View style={styles.figure}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
        {label}
      </ThemedText>
      <ThemedText type="smallBold" style={[styles.center, styles.rate, { color }]}>
        {rate}%
      </ThemedText>
      <ThemedText type="small" style={[styles.center, styles.note, { color }]}>
        {word}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: Spacing.four, gap: Spacing.two },
  header: { gap: Spacing.two },
  sectionTitle: { marginTop: Spacing.three },
  card: { gap: Spacing.one, paddingVertical: Spacing.three, borderBottomWidth: StyleSheet.hairlineWidth },
  center: { textAlign: 'center' },
  loanHead: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  amount: { fontSize: 24, lineHeight: 30 },
  figures: { flexDirection: 'row', flexWrap: 'wrap', borderRadius: 14, paddingVertical: Spacing.two },
  figure: { width: '50%', alignItems: 'center', paddingVertical: Spacing.two, paddingHorizontal: Spacing.one, gap: 2 },
  rate: { fontSize: 18, lineHeight: 24 },
  note: { fontSize: 11 },
  applyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    backgroundColor: Brand.green,
    borderRadius: 16,
    paddingVertical: Spacing.three,
    marginTop: Spacing.two,
  },
  applyText: { color: Brand.cream, fontWeight: '700', fontSize: 17 },
});
