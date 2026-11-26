import { useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BarList } from '@/components/charts/bar-list';
import { ColumnChart } from '@/components/charts/column-chart';
import { HealthGauge } from '@/components/charts/health-gauge';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Card, Divider, icon, IconBadge, Pill } from '@/components/ui/screen';
import { Brand, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  healthBand,
  loadGroupOverview,
  loadPeriodReport,
  type GroupOverview,
  type PeriodReport,
  type PeriodTotals,
} from '@/lib/group-report';
import { groupReportFileName, groupReportHtml } from '@/lib/group-report-html';
import { useT } from '@/lib/i18n';
import { useMembership } from '@/lib/membership-context';
import { isFuturePeriod, shiftPeriod, type ReportPeriodType } from '@/lib/report-periods';
import { exportStatementPdf } from '@/lib/statement-export';

const PERIOD_TYPES: { key: ReportPeriodType; label: string }[] = [
  { key: 'monthly', label: 'Monthly' },
  { key: 'quarterly', label: 'Quarterly' },
  { key: 'annual', label: 'Annual' },
];

type TrendMeasure = 'contributions' | 'disbursed' | 'repayments';
const MEASURES: { key: TrendMeasure; label: string }[] = [
  { key: 'contributions', label: 'Contributions' },
  { key: 'disbursed', label: 'Loans Disbursed' },
  { key: 'repayments', label: 'Repayments Collected' },
];

function StatTile({ iconName, label, value }: { iconName: [string, string]; label: string; value: string }) {
  return (
    <Card style={styles.statTile}>
      <IconBadge name={icon(iconName[0], iconName[1])} size={48} />
      <View style={styles.flex}>
        <ThemedText type="small" themeColor="textSecondary">
          {label}
        </ThemedText>
        <ThemedText type="subtitle" style={styles.statValue}>
          {value}
        </ThemedText>
      </View>
    </Card>
  );
}

function MiniTile({ iconName, value, label }: { iconName: [string, string]; value: string; label: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.miniTile, { backgroundColor: theme.backgroundSelected }]}>
      <IconBadge name={icon(iconName[0], iconName[1])} size={32} />
      <ThemedText type="subtitle" style={styles.miniValue}>
        {value}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
        {label}
      </ThemedText>
    </View>
  );
}

function Segmented<K extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: K; label: string }[];
  value: K;
  onChange: (k: K) => void;
}) {
  const theme = useTheme();
  const t = useT();
  return (
    <View style={[styles.segmented, { backgroundColor: theme.backgroundSelected }]}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.key)}
            style={[styles.segment, active && { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type={active ? 'smallBold' : 'small'} numberOfLines={1} style={styles.center}>
              {t(o.label)}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

// Group report: a health score, headline figures and charts, computed live
// from the ledger (nothing stored). Admin-only, as before.
export default function ReportsScreen() {
  const t = useT();
  const { group, membership } = useMembership();
  const isAdmin = membership?.role === 'group_admin' || membership?.role === 'treasurer';

  const [overview, setOverview] = useState<GroupOverview | null>(null);
  const [type, setType] = useState<ReportPeriodType>('monthly');
  const [reference, setReference] = useState(new Date());
  const [period, setPeriod] = useState<{ report: PeriodReport; trend: PeriodTotals[] } | null>(null);
  const [measure, setMeasure] = useState<TrendMeasure>('contributions');
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!group || !isAdmin) return;
    const [o, p] = await Promise.all([
      loadGroupOverview(group.id, group.contribution_frequency ?? 'monthly'),
      loadPeriodReport(group.id, type, reference),
    ]);
    setOverview(o);
    setPeriod(p);
  }, [group, isAdmin, type, reference]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (!group || !membership) return null;
  if (!isAdmin) {
    return (
      <ThemedView style={[styles.flex, styles.centerBox]}>
        <ThemedText type="default" themeColor="textSecondary">
          {t('This area is for the Treasurer and Group Admins.')}
        </ThemedText>
      </ThemedView>
    );
  }

  const money = (n: number) => `${group.currency} ${Math.round(n).toLocaleString()}`;
  const band = overview ? healthBand(overview.health.score) : null;
  const nextDisabled = isFuturePeriod(type, shiftPeriod(type, reference, 1));

  async function share() {
    if (!overview || !period || !group) return;
    setShareError(null);
    setSharing(true);
    try {
      await exportStatementPdf(
        groupReportHtml(
          { groupName: group.name, currency: group.currency, overview, period: period.report, trend: period.trend, measure },
          t
        ),
        groupReportFileName(group.name, period.report.title)
      );
    } catch {
      setShareError('Could not create the report. Please try again.');
    } finally {
      setSharing(false);
    }
  }

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.column}>
          {overview && band ? (
            <>
              <Card>
                <View style={styles.cardHead}>
                  <View style={styles.flex}>
                    <ThemedText type="subtitle">{t('Financial Health')}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {t('How the group is doing financially')}
                    </ThemedText>
                  </View>
                  <Pill label={t(band.label)} tone={band.tone} />
                </View>
                <HealthGauge
                  score={overview.health.score}
                  tone={band.tone}
                  bandLabel={t(band.label)}
                  caption={t('out of 100')}
                />
                <Divider />
                <ThemedText type="smallBold">{t('What makes up the score')}</ThemedText>
                <BarList
                  max={100}
                  items={overview.health.parts.map((p) => ({
                    key: p.key,
                    label: p.detail ? `${t(p.label)} (${p.detail})` : t(p.label),
                    value: p.value,
                    display: `${p.value}%`,
                  }))}
                />
                <ThemedText type="small" themeColor="textSecondary">
                  {t('The score is the average of the three parts above.')}
                </ThemedText>
              </Card>

              <StatTile iconName={['banknote', 'payments']} label={t('Total Savings')} value={money(overview.savings)} />
              <StatTile
                iconName={['building.columns', 'account_balance']}
                label={t('Active Loans ({count})', { count: overview.activeLoans })}
                value={money(overview.activeLoansOwed)}
              />
              <StatTile iconName={['tray.full', 'savings']} label={t('Money held')} value={money(overview.cash)} />

              <Card>
                <ThemedText type="subtitle">{t('Other Information')}</ThemedText>
                <View style={styles.miniRow}>
                  <MiniTile iconName={['person.2', 'group']} value={String(overview.members)} label={t('Members')} />
                  <MiniTile
                    iconName={['building.columns', 'account_balance']}
                    value={String(overview.allLoans)}
                    label={t('All Loans')}
                  />
                  <MiniTile
                    iconName={['arrow.counterclockwise', 'history']}
                    value={`${overview.repaidShare}%`}
                    label={t('Repaid')}
                  />
                </View>
              </Card>
            </>
          ) : null}

          <Card>
            <ThemedText type="subtitle">{t('Trends')}</ThemedText>
            <Segmented options={PERIOD_TYPES} value={type} onChange={(k) => {
              setType(k);
              setReference(new Date());
            }} />
            <View style={styles.periodPicker}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('Previous')}
                hitSlop={12}
                onPress={() => setReference((r) => shiftPeriod(type, r, -1))}>
                <ThemedText type="subtitle">{'‹'}</ThemedText>
              </Pressable>
              <ThemedText type="smallBold">{period?.report.title ?? ''}</ThemedText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('Next')}
                hitSlop={12}
                disabled={nextDisabled}
                onPress={() => setReference((r) => shiftPeriod(type, r, 1))}>
                <ThemedText type="subtitle" themeColor={nextDisabled ? 'textSecondary' : 'text'}>
                  {'›'}
                </ThemedText>
              </Pressable>
            </View>
            <Segmented options={MEASURES} value={measure} onChange={setMeasure} />
            {period ? (
              <ColumnChart
                columns={period.trend.map((p) => ({ key: p.key, label: p.label, value: p[measure] }))}
                format={money}
              />
            ) : null}
          </Card>

          {period ? (
            <Card>
              <ThemedText type="subtitle">{t('{period} Report', { period: period.report.title })}</ThemedText>
              <ThemedText type="smallBold">{t('Money in and out')}</ThemedText>
              <BarList
                items={[
                  { key: 'c', label: t('Contributions'), value: period.report.contributions, display: money(period.report.contributions) },
                  { key: 'r', label: t('Repayments Collected'), value: period.report.repayments, display: money(period.report.repayments) },
                  { key: 'd', label: t('Loans Disbursed'), value: period.report.disbursed, display: money(period.report.disbursed) },
                ]}
              />
              <Divider />
              <View style={styles.miniRow}>
                <MiniTile iconName={['person.badge.plus', 'person_add']} value={String(period.report.newMembers)} label={t('New Members')} />
                <MiniTile
                  iconName={['checkmark.circle', 'check_circle']}
                  value={`${period.report.loansApproved}/${period.report.loansApproved + period.report.loansDeclined}`}
                  label={t('Loans Approved')}
                />
                <MiniTile
                  iconName={['checkmark.square', 'how_to_vote']}
                  value={`${period.report.motionsApproved}/${period.report.motionsApproved + period.report.motionsDeclined}`}
                  label={t('Motions Approved')}
                />
              </View>
            </Card>
          ) : null}

          {overview && period ? (
            <Pressable
              accessibilityRole="button"
              disabled={sharing}
              onPress={share}
              style={({ pressed }) => [styles.shareButton, { opacity: pressed || sharing ? 0.8 : 1 }]}>
              <SymbolView name={icon('square.and.arrow.up', 'share')} size={20} tintColor={Brand.cream} />
              <ThemedText type="default" style={styles.shareText}>
                {sharing ? t('Preparing…') : t('Share Report')}
              </ThemedText>
            </Pressable>
          ) : null}
          {shareError ? (
            <ThemedText type="small" themeColor="danger">
              {t(shareError)}
            </ThemedText>
          ) : null}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  centerBox: { alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  content: { flexGrow: 1, padding: Spacing.four, paddingBottom: Spacing.five },
  column: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', gap: Spacing.three },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  statTile: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  statValue: { fontSize: 22, lineHeight: 28 },
  miniRow: { flexDirection: 'row', gap: Spacing.two },
  miniTile: { flex: 1, alignItems: 'center', gap: Spacing.one, padding: Spacing.three, borderRadius: 14 },
  miniValue: { fontSize: 22, lineHeight: 28 },
  segmented: { flexDirection: 'row', borderRadius: 12, padding: 3 },
  segment: { flex: 1, paddingVertical: Spacing.two, paddingHorizontal: Spacing.one, borderRadius: 10 },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    backgroundColor: Brand.green,
    borderRadius: 16,
    paddingVertical: Spacing.three,
  },
  shareText: { color: Brand.cream, fontWeight: '700', fontSize: 17 },
  periodPicker: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: Spacing.four },
});
