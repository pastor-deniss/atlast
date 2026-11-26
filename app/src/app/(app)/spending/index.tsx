import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Card, Chevron, Divider, icon, IconBadge, Pill } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { Brand, MaxContentWidth, Spacing } from '@/constants/theme';
import { useSession } from '@/lib/auth/session-context';
import { useT } from '@/lib/i18n';
import { useMembership } from '@/lib/membership-context';
import {
  fetchFunds,
  fetchMyJamiiTotal,
  fetchMyPendingApprovals,
  fetchNames,
  fetchSpendRequests,
  spendingAction,
  STATUS_LABEL,
  STATUS_TONE,
  type SpendKind,
  type SpendRequest,
} from '@/lib/spending';

// Jamii (welfare) and Miscellaneous charges share this screen: the money
// available, what is waiting on you, and every request with its status.
export default function SpendingListScreen() {
  const t = useT();
  const router = useRouter();
  const { kind: kindParam } = useLocalSearchParams<{ kind?: string }>();
  const kind: SpendKind = kindParam === 'expense' ? 'expense' : 'jamii';
  const { session } = useSession();
  const { group, membership } = useMembership();
  const isAdmin = membership?.role === 'group_admin' && membership.status === 'active';

  const [funds, setFunds] = useState<{ mainFund: number; jamiiPot: number; jamiiAmount: number } | null>(null);
  const [myJamii, setMyJamii] = useState(0);
  const [requests, setRequests] = useState<SpendRequest[]>([]);
  const [waiting, setWaiting] = useState<SpendRequest[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [editingAmount, setEditingAmount] = useState(false);
  const [amountDraft, setAmountDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!group || !session) return;
    const [f, list, mine, jamiiTotal] = await Promise.all([
      fetchFunds(group.id),
      fetchSpendRequests(group.id, kind),
      fetchMyPendingApprovals(group.id, session.user.id),
      kind === 'jamii' ? fetchMyJamiiTotal(group.id, session.user.id) : Promise.resolve(0),
    ]);
    setFunds(f);
    setRequests(list);
    setWaiting(mine.filter((r) => r.kind === kind));
    setMyJamii(jamiiTotal);
    setNames(await fetchNames(list.map((r) => r.beneficiary_id ?? '')));
  }, [group, session, kind]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (!group) return null;
  const money = (n: number) => `${group.currency} ${Math.round(n).toLocaleString()}`;

  async function saveAmount() {
    const value = Number(amountDraft.replace(/,/g, ''));
    if (!Number.isFinite(value) || value < 0) {
      setError('Amount must be zero or more.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: message } = await spendingAction({ action: 'set_jamii_amount', group_id: group!.id, amount: value });
    setBusy(false);
    if (message) {
      setError(message);
      return;
    }
    setEditingAmount(false);
    load();
  }

  const open = (r: SpendRequest) => router.push({ pathname: '/(app)/spending/[id]', params: { id: r.id } });

  function RequestRow({ r }: { r: SpendRequest }) {
    const title =
      r.kind === 'jamii' ? names.get(r.beneficiary_id ?? '') || t('Member') : r.category ? t(r.category) : r.reason;
    return (
      <Pressable accessibilityRole="button" onPress={() => open(r)} style={styles.row}>
        <View style={styles.flex}>
          <ThemedText type="smallBold">{title}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {r.reason} · {new Date(r.created_at).toLocaleDateString()}
          </ThemedText>
          <View style={styles.pillRow}>
            <Pill label={t(STATUS_LABEL[r.status])} tone={STATUS_TONE[r.status]} />
          </View>
        </View>
        <ThemedText type="smallBold">{money(r.amount)}</ThemedText>
        <Chevron />
      </Pressable>
    );
  }

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          {/* The money this comes from */}
          <Card style={styles.fundCard}>
            <IconBadge
              name={kind === 'jamii' ? icon('heart.fill', 'volunteer_activism') : icon('banknote', 'payments')}
              size={52}
            />
            <View style={styles.flex}>
              <ThemedText type="small" themeColor="textSecondary">
                {kind === 'jamii' ? t('Jamii pot') : t('Group fund available')}
              </ThemedText>
              <ThemedText type="subtitle" style={styles.big}>
                {funds ? money(kind === 'jamii' ? funds.jamiiPot : funds.mainFund) : '—'}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {kind === 'jamii'
                  ? t('Kept apart from savings. Used only to help members who are ill.')
                  : t('Charges are paid from the main group fund.')}
              </ThemedText>
            </View>
          </Card>

          {kind === 'jamii' && funds ? (
            <Card>
              <View style={styles.between}>
                <View style={styles.flex}>
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('Regular Jamii contribution')}
                  </ThemedText>
                  <ThemedText type="smallBold">
                    {funds.jamiiAmount > 0 ? money(funds.jamiiAmount) : t('Not set yet')}
                  </ThemedText>
                </View>
                <View style={styles.right}>
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('You have paid')}
                  </ThemedText>
                  <ThemedText type="smallBold">{money(myJamii)}</ThemedText>
                </View>
              </View>
              {isAdmin && editingAmount ? (
                <>
                  <TextField
                    label={t('Jamii amount per {period}', { period: t(group.contribution_frequency) })}
                    value={amountDraft}
                    onChangeText={setAmountDraft}
                    keyboardType="numeric"
                  />
                  <View style={styles.buttons}>
                    <Button title={t('Cancel')} variant="secondary" onPress={() => setEditingAmount(false)} />
                    <Button title={t('Save')} onPress={saveAmount} loading={busy} />
                  </View>
                </>
              ) : isAdmin ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setAmountDraft(String(funds.jamiiAmount || ''));
                    setEditingAmount(true);
                  }}>
                  <ThemedText type="smallBold" themeColor="primary">
                    {t('Change the Jamii amount')}
                  </ThemedText>
                </Pressable>
              ) : null}
              {error ? (
                <ThemedText type="small" themeColor="danger">
                  {t(error)}
                </ThemedText>
              ) : null}
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/(app)/contribute', params: { fund: 'jamii' } })}
                style={({ pressed }) => [styles.payButton, { opacity: pressed ? 0.85 : 1 }]}>
                <SymbolView name={icon('heart.fill', 'volunteer_activism')} size={20} tintColor={Brand.cream} />
                <ThemedText type="default" style={styles.payText}>
                  {t('Pay Jamii contribution')}
                </ThemedText>
              </Pressable>
            </Card>
          ) : null}

          {waiting.length > 0 ? (
            <Card>
              <ThemedText type="smallBold">{t('Waiting for your approval')}</ThemedText>
              {waiting.map((r, i) => (
                <View key={r.id}>
                  {i > 0 ? <Divider /> : null}
                  <RequestRow r={r} />
                </View>
              ))}
            </Card>
          ) : null}

          {isAdmin ? (
            <Button
              title={kind === 'jamii' ? t('Request Jamii help for a member') : t('New miscellaneous charge')}
              onPress={() => router.push({ pathname: '/(app)/spending/new', params: { kind } })}
            />
          ) : null}

          <ThemedText type="smallBold" themeColor="textSecondary">
            {kind === 'jamii' ? t('Jamii requests') : t('Miscellaneous charges')}
          </ThemedText>
          {requests.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              {kind === 'jamii' ? t('No Jamii requests yet.') : t('No charges yet.')}
            </ThemedText>
          ) : (
            <Card>
              {requests.map((r, i) => (
                <View key={r.id}>
                  {i > 0 ? <Divider /> : null}
                  <RequestRow r={r} />
                </View>
              ))}
            </Card>
          )}

          <ThemedText type="small" themeColor="textSecondary">
            {t('A Group Admin starts each request. Three members in good standing are picked at random to approve it, and all three must say yes before the money is paid.')}
          </ThemedText>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, padding: Spacing.four, paddingBottom: Spacing.five },
  column: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', gap: Spacing.three },
  fundCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  big: { fontSize: 24, lineHeight: 30 },
  between: { flexDirection: 'row', gap: Spacing.three },
  right: { alignItems: 'flex-end' },
  buttons: { flexDirection: 'row', gap: Spacing.two, justifyContent: 'flex-end' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two },
  pillRow: { flexDirection: 'row', marginTop: 4 },
  payButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    backgroundColor: Brand.green,
    borderRadius: 14,
    paddingVertical: Spacing.three,
  },
  payText: { color: Brand.cream, fontWeight: '700' },
});
