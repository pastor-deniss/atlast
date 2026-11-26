import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useMembership } from '@/lib/membership-context';
import {
  isFuturePeriod,
  periodBounds,
  periodLabel,
  shiftPeriod,
  type ReportPeriodType,
} from '@/lib/report-periods';
import { supabase } from '@/lib/supabase';
import { useT } from '@/lib/i18n';

type Report = {
  contributions: number;
  disbursed: number;
  repayments: number;
  newMembers: number;
  loansApproved: number;
  loansDeclined: number;
  motionsApproved: number;
  motionsDeclined: number;
};

const PERIOD_TYPES: { key: ReportPeriodType; label: string }[] = [
  { key: 'monthly', label: 'Monthly' },
  { key: 'quarterly', label: 'Quarterly' },
  { key: 'annual', label: 'Annual' },
];

function ReportRow({ label, value }: { label: string; value: string | number }) {
  const t = useT();
  return (
    <View style={styles.row}>
      <ThemedText type="default">{t(label)}</ThemedText>
      <ThemedText type="default">{value}</ThemedText>
    </View>
  );
}

// Ticket 19: "Generate Report" computes live from transactions/loans/
// memberships/motions and renders -- no `reports` table, no persistence, no
// PDF export (same precedent as ticket 16's contribution receipt).
export default function ReportsScreen() {
  const theme = useTheme();
  const { group, membership } = useMembership();
  const t = useT();
  const [type, setType] = useState<ReportPeriodType>('monthly');
  const [reference, setReference] = useState(new Date());
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);

  const isAdmin = membership?.role === 'group_admin';

  if (!group || !membership) return null;
  if (!isAdmin) {
    return (
      <ThemedView style={styles.flex}>
        <SafeAreaView style={styles.flex} edges={['bottom']}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <ThemedText type="default" themeColor="textSecondary">
              {t('This area is for Group Admins only.')}
            </ThemedText>
          </ScrollView>
        </SafeAreaView>
      </ThemedView>
    );
  }

  function changeType(next: ReportPeriodType) {
    setType(next);
    setReference(new Date());
    setReport(null);
  }

  function shift(direction: 1 | -1) {
    setReference((r) => shiftPeriod(type, r, direction));
    setReport(null);
  }

  async function generate() {
    setBusy(true);
    const { start, end } = periodBounds(type, reference);
    const startIso = start.toISOString();
    const endIso = end.toISOString();

    const { data: txnRows } = await supabase
      .from('transactions')
      .select('type, amount')
      .eq('group_id', group!.id)
      .gte('created_at', startIso)
      .lt('created_at', endIso)
      .in('type', ['contribution', 'loan_disbursement', 'repayment']);
    const sums = { contributions: 0, disbursed: 0, repayments: 0 };
    for (const r of txnRows ?? []) {
      if (r.type === 'contribution') sums.contributions += r.amount;
      else if (r.type === 'loan_disbursement') sums.disbursed += Math.abs(r.amount);
      else if (r.type === 'repayment') sums.repayments += r.amount;
    }

    const { data: memberRows } = await supabase
      .from('memberships')
      .select('id')
      .eq('group_id', group!.id)
      .eq('status', 'active')
      .gte('decided_at', startIso)
      .lt('decided_at', endIso);

    const { data: loanRows } = await supabase
      .from('loans')
      .select('status')
      .eq('group_id', group!.id)
      .gte('decided_at', startIso)
      .lt('decided_at', endIso);
    const loansApproved = (loanRows ?? []).filter((l) => l.status !== 'declined').length;
    const loansDeclined = (loanRows ?? []).filter((l) => l.status === 'declined').length;

    const { data: motionRows } = await supabase
      .from('motions')
      .select('status')
      .eq('group_id', group!.id)
      .gte('decided_at', startIso)
      .lt('decided_at', endIso);
    const motionsApproved = (motionRows ?? []).filter((m) => m.status === 'approved').length;
    const motionsDeclined = (motionRows ?? []).filter((m) => m.status === 'declined').length;

    setReport({
      ...sums,
      newMembers: (memberRows ?? []).length,
      loansApproved,
      loansDeclined,
      motionsApproved,
      motionsDeclined,
    });
    setBusy(false);
  }

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ThemedText type="title">{t('Reports')}</ThemedText>

          <View style={styles.row}>
            {PERIOD_TYPES.map((p) => (
              <Button
                key={p.key}
                title={t(p.label)}
                variant={type === p.key ? 'primary' : 'secondary'}
                onPress={() => changeType(p.key)}
              />
            ))}
          </View>

          <View style={[styles.row, styles.periodPicker]}>
            <Pressable onPress={() => shift(-1)}>
              <ThemedText type="subtitle">{'‹'}</ThemedText>
            </Pressable>
            <ThemedText type="subtitle">{periodLabel(type, reference)}</ThemedText>
            <Pressable onPress={() => shift(1)} disabled={isFuturePeriod(type, shiftPeriod(type, reference, 1))}>
              <ThemedText
                type="subtitle"
                themeColor={isFuturePeriod(type, shiftPeriod(type, reference, 1)) ? 'textSecondary' : 'text'}>
                {'›'}
              </ThemedText>
            </Pressable>
          </View>

          <Button title={t('Generate Report')} onPress={generate} loading={busy} />

          {report ? (
            <View style={[styles.section, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="subtitle">{t('{period} Report', { period: periodLabel(type, reference) })}</ThemedText>
              <ReportRow label="Contributions" value={`${group.currency} ${report.contributions.toLocaleString()}`} />
              <ReportRow label="Loans Disbursed" value={`${group.currency} ${report.disbursed.toLocaleString()}`} />
              <ReportRow label="Repayments Collected" value={`${group.currency} ${report.repayments.toLocaleString()}`} />
              <ReportRow label="New Members" value={report.newMembers} />
              <ReportRow label="Loans Approved" value={report.loansApproved} />
              <ReportRow label="Loans Declined" value={report.loansDeclined} />
              <ReportRow label="Motions Approved" value={report.motionsApproved} />
              <ReportRow label="Motions Declined" value={report.motionsDeclined} />
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two },
  periodPicker: { justifyContent: 'center', alignItems: 'center', gap: Spacing.four },
  section: { gap: Spacing.two, padding: Spacing.three, borderRadius: 10 },
});
