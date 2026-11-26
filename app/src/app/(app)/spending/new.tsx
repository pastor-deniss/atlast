import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Card, Divider, icon, Pill } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSession } from '@/lib/auth/session-context';
import { useT } from '@/lib/i18n';
import { useMembership } from '@/lib/membership-context';
import {
  EXPENSE_CATEGORIES,
  fetchApproverSuggestions,
  fetchFunds,
  fetchNames,
  spendingAction,
  type ApproverSuggestion,
  type SpendKind,
} from '@/lib/spending';
import { supabase } from '@/lib/supabase';

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.chip,
        { borderColor: selected ? theme.primary : theme.backgroundSelected },
        selected && { backgroundColor: theme.backgroundSelected },
      ]}>
      <ThemedText type={selected ? 'smallBold' : 'small'}>{label}</ThemedText>
    </Pressable>
  );
}

// Group Admin starts a Jamii payout or a miscellaneous charge. The server
// picks 3 approvers at random from members in good standing; if too few
// qualify, the admin picks 3 from the app's suggestions (best standing
// first); in a group with fewer than 3 other members the admin decides alone.
export default function NewSpendRequestScreen() {
  const t = useT();
  const router = useRouter();
  const theme = useTheme();
  const { kind: kindParam } = useLocalSearchParams<{ kind?: string }>();
  const kind: SpendKind = kindParam === 'expense' ? 'expense' : 'jamii';
  const { session } = useSession();
  const { group, membership } = useMembership();
  const isAdmin = membership?.role === 'group_admin' && membership.status === 'active';

  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [beneficiary, setBeneficiary] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [available, setAvailable] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<ApproverSuggestion[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!group || !session) return;
    (async () => {
      const funds = await fetchFunds(group.id);
      setAvailable(kind === 'jamii' ? funds.jamiiPot : funds.mainFund);
      if (kind === 'jamii') {
        const { data } = await supabase
          .from('memberships')
          .select('user_id')
          .eq('group_id', group.id)
          .eq('status', 'active');
        const ids = (data ?? []).map((m) => m.user_id as string);
        const names = await fetchNames(ids);
        setMembers(
          ids.map((id) => ({ id, name: names.get(id) || t('Member') })).sort((a, b) => a.name.localeCompare(b.name))
        );
      }
    })();
  }, [group, session, kind, t]);

  // Suggestions depend on who is being helped (they can't approve their own payout).
  useEffect(() => {
    if (!group || !isAdmin) return;
    if (kind === 'jamii' && !beneficiary) {
      setSuggestions(null);
      return;
    }
    setPicked([]);
    fetchApproverSuggestions(group.id, kind === 'jamii' ? beneficiary : null).then(setSuggestions);
  }, [group, isAdmin, kind, beneficiary]);

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
  const eligibleCount = suggestions?.filter((s) => s.eligible).length ?? 0;
  const mode: 'random' | 'pick' | 'alone' | null =
    suggestions === null ? null : eligibleCount >= 3 ? 'random' : suggestions.length >= 3 ? 'pick' : 'alone';
  const value = Number(amount.replace(/,/g, ''));

  function togglePick(id: string) {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 3 ? prev : [...prev, id]));
  }

  async function submit() {
    setError(null);
    if (kind === 'jamii' && !beneficiary) return setError('Choose the member who needs help.');
    if (!Number.isFinite(value) || value <= 0) return setError('Amount must be positive.');
    if (available !== null && value > available) {
      return setError(kind === 'jamii' ? 'There is not enough money in the Jamii pot.' : 'There is not enough money in the group fund.');
    }
    if (reason.trim().length < 3) return setError('Say what the money is for.');
    if (mode === 'pick' && picked.length !== 3) return setError('Choose 3 approvers.');
    setBusy(true);
    const { error: message, result } = await spendingAction({
      action: 'create',
      group_id: group!.id,
      kind,
      beneficiary_id: beneficiary,
      amount: value,
      reason: reason.trim(),
      category: kind === 'expense' ? category : null,
      approver_ids: mode === 'pick' ? picked : null,
    });
    setBusy(false);
    if (message) return setError(message);
    if (result) router.replace({ pathname: '/(app)/spending/[id]', params: { id: result.id } });
    else router.back();
  }

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          <Card>
            {kind === 'jamii' ? (
              <>
                <ThemedText type="smallBold">{t('Who needs help?')}</ThemedText>
                <View style={styles.chips}>
                  {members.map((m) => (
                    <Chip
                      key={m.id}
                      label={m.id === session?.user.id ? `${m.name} (${t('you')})` : m.name}
                      selected={beneficiary === m.id}
                      onPress={() => setBeneficiary(m.id)}
                    />
                  ))}
                </View>
                <Divider />
              </>
            ) : (
              <>
                <ThemedText type="smallBold">{t('Type of charge')}</ThemedText>
                <View style={styles.chips}>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <Chip key={c} label={t(c)} selected={category === c} onPress={() => setCategory(c)} />
                  ))}
                </View>
                <Divider />
              </>
            )}
            <TextField
              label={t('Amount')}
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
              hint={
                available !== null
                  ? kind === 'jamii'
                    ? t('Jamii pot: {amount}', { amount: money(available) })
                    : t('Group fund: {amount}', { amount: money(available) })
                  : undefined
              }
            />
            <TextField
              label={kind === 'jamii' ? t('What is the help for?') : t('What is it for?')}
              value={reason}
              onChangeText={setReason}
              placeholder={kind === 'jamii' ? t('e.g. Hospital bill for malaria treatment') : t('e.g. Hall hire for the annual meeting')}
              multiline
            />
          </Card>

          {mode ? (
            <Card>
              <ThemedText type="smallBold">{t('Who approves')}</ThemedText>
              {mode === 'random' ? (
                <View style={styles.infoRow}>
                  <SymbolView name={icon('shuffle', 'shuffle')} size={20} tintColor={theme.primary} />
                  <ThemedText type="small" style={styles.flex}>
                    {t('3 approvers will be picked at random from {count} members in good standing. All 3 must approve.', {
                      count: eligibleCount,
                    })}
                  </ThemedText>
                </View>
              ) : mode === 'alone' ? (
                <View style={styles.infoRow}>
                  <SymbolView name={icon('person.fill.checkmark', 'how_to_reg')} size={20} tintColor={theme.primary} />
                  <ThemedText type="small" style={styles.flex}>
                    {t('Your group has fewer than 3 other members, so you decide this yourself. It is recorded in the Audit Log.')}
                  </ThemedText>
                </View>
              ) : (
                <>
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('Only {count} members meet every rule (3 months in the group, contributed in each of the last 3 periods, default rate 20% or less). Choose 3 approvers — best standing first.', {
                      count: eligibleCount,
                    })}
                  </ThemedText>
                  {suggestions!.map((s, i) => {
                    const selected = picked.includes(s.member_id);
                    return (
                      <View key={s.member_id}>
                        {i > 0 ? <Divider /> : null}
                        <Pressable
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: selected }}
                          onPress={() => togglePick(s.member_id)}
                          style={styles.suggestion}>
                          <SymbolView
                            name={selected ? icon('checkmark.circle.fill', 'check_circle') : icon('circle', 'radio_button_unchecked')}
                            size={22}
                            tintColor={selected ? theme.primary : theme.textSecondary}
                          />
                          <View style={styles.flex}>
                            <ThemedText type="smallBold">{s.full_name || t('Member')}</ThemedText>
                            <ThemedText type="small" themeColor="textSecondary">
                              {t('{months} months · paid {periods} of last 3 periods · default {rate}%', {
                                months: s.months_active,
                                periods: s.periods_contributed,
                                rate: s.default_rate,
                              })}
                            </ThemedText>
                          </View>
                          {s.eligible ? <Pill label={t('Meets all rules')} tone="good" /> : null}
                        </Pressable>
                      </View>
                    );
                  })}
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('{count} of 3 chosen', { count: picked.length })}
                  </ThemedText>
                </>
              )}
            </Card>
          ) : null}

          {error ? (
            <ThemedText type="small" themeColor="danger">
              {t(error)}
            </ThemedText>
          ) : null}
          <Button
            title={mode === 'alone' ? t('Approve') : t('Send for approval')}
            onPress={submit}
            loading={busy}
            disabled={mode === null}
          />
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centerBox: { alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  content: { flexGrow: 1, padding: Spacing.four, paddingBottom: Spacing.five },
  column: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', gap: Spacing.three },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one + 2 },
  infoRow: { flexDirection: 'row', gap: Spacing.two, alignItems: 'flex-start' },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two },
});
