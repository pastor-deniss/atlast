import { useFocusEffect, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Card, Divider, icon } from '@/components/ui/screen';
import { Brand, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSession } from '@/lib/auth/session-context';
import { useT } from '@/lib/i18n';
import { useMembership } from '@/lib/membership-context';
import {
  loadStatement,
  statementFileName,
  statementHtml,
  type Statement,
  type StatementPeriod,
} from '@/lib/statement';
import { exportStatementPdf } from '@/lib/statement-export';

const PERIODS: { value: StatementPeriod; label: string }[] = [
  { value: 'this_year', label: 'This year' },
  { value: 'last_year', label: 'Last year' },
  { value: 'all_time', label: 'All time' },
];

export default function StatementScreen() {
  const t = useT();
  const router = useRouter();
  const theme = useTheme();
  const { session } = useSession();
  const { group } = useMembership();
  const [period, setPeriod] = useState<StatementPeriod>('this_year');
  const [statement, setStatement] = useState<Statement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!group || !session) return;
    setError(null);
    try {
      setStatement(await loadStatement(group.id, session.user.id, period));
    } catch {
      setError('Could not load your statement. Please try again.');
    }
  }, [group, session, period]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function download() {
    if (!statement) return;
    setBusy(true);
    setError(null);
    try {
      await exportStatementPdf(statementHtml(statement, t), statementFileName(statement));
    } catch {
      setError('Could not create the PDF. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const money = (n: number) => `${statement?.currency ?? ''} ${Math.round(n).toLocaleString()}`;
  const balance = statement ? statement.savings - statement.loansOutstanding : 0;

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.column}>
          <View style={[styles.segmented, { backgroundColor: theme.backgroundSelected }]}>
            {PERIODS.map((p) => {
              const selected = p.value === period;
              return (
                <Pressable
                  key={p.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setPeriod(p.value)}
                  style={[styles.segment, selected && { backgroundColor: theme.primary }]}>
                  <ThemedText type="smallBold" style={selected ? { color: theme.onPrimary } : undefined}>
                    {t(p.label)}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          <Card>
            <View style={styles.summaryRow}>
              <View style={styles.flex}>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('Total Savings')}
                </ThemedText>
                <ThemedText type="subtitle" themeColor="primary" style={styles.big}>
                  {money(statement?.savings ?? 0)}
                </ThemedText>
              </View>
              <View style={styles.right}>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('Loans')}
                </ThemedText>
                <ThemedText type="subtitle" style={styles.big}>
                  {money(statement?.loansOutstanding ?? 0)}
                </ThemedText>
              </View>
            </View>
            <Divider />
            <View style={styles.summaryRow}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
                {t('Balance (Savings − Loans)')}
              </ThemedText>
              <ThemedText type="smallBold" style={balance < 0 ? { color: Brand.danger } : undefined}>
                {money(balance)}
              </ThemedText>
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              {t('{count} shares', { count: statement?.shares ?? 0 })}
            </ThemedText>
          </Card>

          <Button title={t('Download PDF')} onPress={download} loading={busy} disabled={!statement} />
          {error ? (
            <ThemedText type="small" themeColor="danger">
              {t(error)}
            </ThemedText>
          ) : null}

          <Pressable
            accessibilityRole="link"
            onPress={() => router.push('/(app)/complaints/new')}
            style={styles.complaintLink}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
              {t('Something wrong in your statement?')}{' '}
              <ThemedText type="smallBold" themeColor="danger">
                {t('File a Complaint')}
              </ThemedText>
            </ThemedText>
          </Pressable>

          {statement && statement.rows.length === 0 ? (
            <ThemedText type="default" themeColor="textSecondary" style={styles.center}>
              {t('No transactions in this period.')}
            </ThemedText>
          ) : null}

          {statement && statement.rows.length > 0 ? (
            <Card style={styles.list}>
              {statement.rows.map((row, i) => {
                const paidIn = row.amount >= 0;
                return (
                  <View key={row.id}>
                    {i > 0 ? <Divider /> : null}
                    <View style={styles.txRow}>
                      <View style={[styles.arrow, { backgroundColor: theme.backgroundSelected }]}>
                        <SymbolView
                          name={paidIn ? icon('arrow.down.left', 'south_west') : icon('arrow.up.right', 'north_east')}
                          size={16}
                          tintColor={paidIn ? theme.primary : theme.textSecondary}
                        />
                      </View>
                      <View style={styles.flex}>
                        <ThemedText type="smallBold" style={styles.txLabel}>
                          {t(row.label)}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {new Date(row.date).toLocaleDateString()}
                          {row.method ? ` • ${t(row.method)}` : ''}
                          {row.reference ? ` • ${row.reference}` : ''}
                        </ThemedText>
                      </View>
                      <ThemedText type="smallBold" themeColor={paidIn ? 'primary' : 'text'}>
                        {paidIn ? '+' : '−'}
                        {Math.abs(row.amount).toLocaleString()}
                      </ThemedText>
                    </View>
                  </View>
                );
              })}
            </Card>
          ) : null}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, padding: Spacing.four, paddingBottom: Spacing.five },
  column: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', gap: Spacing.three },
  segmented: { flexDirection: 'row', borderRadius: 12, padding: Spacing.half, gap: Spacing.half },
  segment: { flex: 1, alignItems: 'center', paddingVertical: Spacing.two, borderRadius: 10 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  right: { alignItems: 'flex-end' },
  big: { fontSize: 20, lineHeight: 28 },
  center: { textAlign: 'center' },
  complaintLink: { paddingVertical: Spacing.one },
  list: { gap: 0, paddingVertical: Spacing.one },
  txRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two },
  arrow: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  txLabel: { fontSize: 15 },
});
