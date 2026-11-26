import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Card, Divider, icon, MenuRow, Pill, SectionTitle } from '@/components/ui/screen';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/lib/i18n';
import { useMembership } from '@/lib/membership-context';
import { fetchFunds, fetchNames } from '@/lib/spending';
import { supabase } from '@/lib/supabase';
import { currentYear, fetchShareout, isMoneyOfficer, SHAREOUT_STATUS_LABEL, type Shareout } from '@/lib/treasury';

type Pending = { key: string; title: string; detail: string; onPress: () => void };

// Treasurer Home — "Financial Control": where the money is, and every money
// task waiting (approved loans to pay out, approved Jamii / charges to pay,
// open reconciliation cases, the year-end share-out). Also open to the Group
// Admin, who shares the money side.
export default function TreasuryScreen() {
  const t = useT();
  const theme = useTheme();
  const router = useRouter();
  const { group, membership } = useMembership();
  const allowed = membership?.status === 'active' && isMoneyOfficer(membership.role);

  const [funds, setFunds] = useState<{ mainFund: number; jamiiPot: number } | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [shareout, setShareout] = useState<Shareout | null>(null);

  const load = useCallback(async () => {
    if (!group || !allowed) return;
    const [f, loansRes, spendRes, casesRes, so] = await Promise.all([
      fetchFunds(group.id),
      supabase.from('loans').select('id, borrower_id, principal').eq('group_id', group.id).eq('status', 'approved'),
      supabase
        .from('group_spend_requests')
        .select('id, kind, beneficiary_id, amount, category')
        .eq('group_id', group.id)
        .eq('status', 'approved'),
      supabase
        .from('reconciliation_cases')
        .select('id, provider, provider_amount')
        .eq('group_id', group.id)
        .eq('status', 'investigate'),
      fetchShareout(group.id, currentYear()),
    ]);
    setFunds(f);
    setShareout(so.shareout);
    const loans = loansRes.data ?? [];
    const spends = spendRes.data ?? [];
    const names = await fetchNames([...loans.map((l) => l.borrower_id), ...spends.map((s) => s.beneficiary_id ?? '')]);
    const money = (n: number) => `${group.currency} ${Math.round(Number(n)).toLocaleString()}`;
    setPending([
      ...loans.map((l) => ({
        key: `l${l.id}`,
        title: t('Pay out loan to {name}', { name: names.get(l.borrower_id) || t('Member') }),
        detail: money(l.principal),
        onPress: () => router.push({ pathname: '/(app)/loan/[id]', params: { id: l.id } }),
      })),
      ...spends.map((s) => ({
        key: `s${s.id}`,
        title:
          s.kind === 'jamii'
            ? t('Pay Jamii help to {name}', { name: names.get(s.beneficiary_id ?? '') || t('Member') })
            : t('Pay group charge: {category}', { category: t(s.category ?? 'Other') }),
        detail: money(s.amount),
        onPress: () => router.push({ pathname: '/(app)/spending/[id]', params: { id: s.id } }),
      })),
      ...(casesRes.data ?? []).map((c) => ({
        key: `c${c.id}`,
        title: t('Investigate a reconciliation difference ({provider})', { provider: c.provider }),
        detail: money(c.provider_amount),
        onPress: () => router.push({ pathname: '/(app)/admin/reconciliation-case/[id]', params: { id: c.id } }),
      })),
    ]);
  }, [group, allowed, router, t]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (!group || !membership) return null;
  if (!allowed) {
    return (
      <ThemedView style={[styles.flex, styles.center]}>
        <ThemedText type="default" themeColor="textSecondary">
          {t('This area is for the Treasurer and Group Admins.')}
        </ThemedText>
      </ThemedView>
    );
  }

  const money = (n: number) => `${group.currency} ${Math.round(n).toLocaleString()}`;

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.column}>
          <Card>
            <ThemedText type="small" themeColor="textSecondary">
              {t('Cash position (group fund)')}
            </ThemedText>
            <ThemedText type="title" style={[styles.big, { color: theme.primary }]}>
              {funds ? money(funds.mainFund) : '…'}
            </ThemedText>
            <Divider />
            <View style={styles.row}>
              <ThemedText type="small" themeColor="textSecondary">
                {t('Jamii pot (kept apart)')}
              </ThemedText>
              <ThemedText type="smallBold">{funds ? money(funds.jamiiPot) : '…'}</ThemedText>
            </View>
            <View style={styles.row}>
              <ThemedText type="small" themeColor="textSecondary">
                {t('Pending items')}
              </ThemedText>
              <ThemedText type="smallBold">{pending.length}</ThemedText>
            </View>
          </Card>

          <SectionTitle title={t('Waiting for you')} iconName={icon('tray', 'inbox')} />
          {pending.length === 0 ? (
            <Card>
              <ThemedText type="small" themeColor="textSecondary">
                {t('Nothing to pay or check right now.')}
              </ThemedText>
            </Card>
          ) : (
            <Card>
              {pending.map((p, i) => (
                <View key={p.key}>
                  {i > 0 ? <Divider /> : null}
                  <MenuRow iconName={icon('banknote', 'payments')} title={p.title} subtitle={p.detail} onPress={p.onPress} />
                </View>
              ))}
            </Card>
          )}

          <SectionTitle title={t('Year-end')} iconName={icon('calendar', 'event')} />
          <MenuRow
            separate
            iconName={icon('chart.pie', 'pie_chart')}
            title={t('Year-end profit share-out {year}', { year: currentYear() })}
            subtitle={shareout ? t(SHAREOUT_STATUS_LABEL[shareout.status]) : t('Not prepared yet')}
            onPress={() => router.push('/(app)/treasury/shareout')}
          />

          <SectionTitle title={t('Records')} iconName={icon('list.bullet', 'list')} />
          <Card>
            <MenuRow
              iconName={icon('list.bullet.rectangle', 'receipt_long')}
              title={t('Transactions')}
              onPress={() => router.push('/(app)/admin/transactions')}
            />
            <Divider />
            <MenuRow
              iconName={icon('checkmark.seal', 'fact_check')}
              title={t('Reconciliation')}
              onPress={() => router.push('/(app)/admin/reconciliation')}
            />
            <Divider />
            <MenuRow
              iconName={icon('chart.bar', 'bar_chart')}
              title={t('Financial Dashboard')}
              onPress={() => router.push('/(app)/admin/financial-dashboard')}
            />
            <Divider />
            <MenuRow
              iconName={icon('doc.text', 'description')}
              title={t('Reports')}
              onPress={() => router.push('/(app)/admin/reports')}
            />
          </Card>
          {membership.role === 'treasurer' ? (
            <View style={styles.center}>
              <Pill label={t('Treasurer')} tone="good" />
            </View>
          ) : null}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  content: { flexGrow: 1, padding: Spacing.four, paddingBottom: Spacing.five },
  column: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', gap: Spacing.three },
  big: { fontSize: 32, lineHeight: 40 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
