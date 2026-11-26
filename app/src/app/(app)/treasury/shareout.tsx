import { useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { PaymentMethodPicker } from '@/components/payment-method-picker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Card, Divider, icon, Pill } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSession } from '@/lib/auth/session-context';
import { formatDateTime } from '@/lib/datetime';
import { useT } from '@/lib/i18n';
import { useMembership } from '@/lib/membership-context';
import { needsReference, type PaymentMethod } from '@/lib/payment-methods';
import { fetchNames } from '@/lib/spending';
import {
  currentYear,
  fetchShareout,
  isMoneyOfficer,
  previewShareout,
  SHAREOUT_STATUS_LABEL,
  SHAREOUT_STATUS_TONE,
  treasuryAction,
  type ShareLine,
  type Shareout,
  type ShareoutPreview,
} from '@/lib/treasury';

// Year-end profit share-out. Everyone sees the saved share-out and their own
// share; the Treasurer prepares it from a live preview, the Group Admin
// approves or rejects it, then the Treasurer records each member's payout.
export default function ShareoutScreen() {
  const t = useT();
  const theme = useTheme();
  const { session } = useSession();
  const { group, membership } = useMembership();
  const me = session?.user.id;
  const role = membership?.status === 'active' ? membership.role : null;
  const officer = isMoneyOfficer(role);

  const [year, setYear] = useState(currentYear());
  const [preview, setPreview] = useState<ShareoutPreview | null>(null);
  const [shareout, setShareout] = useState<Shareout | null>(null);
  const [lastRejected, setLastRejected] = useState<Shareout | null>(null);
  const [lines, setLines] = useState<ShareLine[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [note, setNote] = useState('');
  const [payingFor, setPayingFor] = useState<string | null>(null);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!group) return;
    const saved = await fetchShareout(group.id, year);
    setShareout(saved.shareout);
    setLastRejected(saved.lastRejected);
    setLines(saved.lines);
    const p = !saved.shareout && officer ? await previewShareout(group.id, year) : null;
    setPreview(p);
    const people = [
      ...saved.lines.map((l) => l.member_id),
      saved.shareout?.prepared_by ?? '',
      saved.shareout?.decided_by ?? '',
      saved.lastRejected?.decided_by ?? '',
    ];
    setNames(await fetchNames(people));
  }, [group, year, officer]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (!group || !membership) return null;
  const money = (n: number) => `${group.currency} ${Math.round(n).toLocaleString()}`;
  const nameOf = (id: string | null | undefined) => (id ? names.get(id) || t('Member') : '');

  async function run(key: string, body: Record<string, unknown>) {
    setError(null);
    setBusy(key);
    const { error: message } = await treasuryAction(body);
    setBusy(null);
    if (message) {
      setError(message);
      return false;
    }
    await load();
    return true;
  }

  async function pay(memberId: string) {
    if (!method) return setError('Choose how you paid.');
    if (needsReference(method) && !reference.trim()) return setError('Enter the mobile money reference.');
    const ok = await run(`pay${memberId}`, {
      action: 'pay',
      shareout_id: shareout!.id,
      member_id: memberId,
      payment_method: method,
      reference: reference.trim(),
    });
    if (ok) {
      setPayingFor(null);
      setMethod(null);
      setReference('');
    }
  }

  const figures = shareout ?? preview;
  const shownLines: ShareLine[] = shareout ? lines : (preview?.lines ?? []);
  const sortedLines = [...shownLines].sort((a, b) => b.amount - a.amount);
  const mine = sortedLines.find((l) => l.member_id === me);
  const paidCount = lines.filter((l) => l.paid_at).length;
  const distributed = shareout ? shareout.distributed : sortedLines.reduce((s, l) => s + l.amount, 0);

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          <View style={styles.years}>
            {[currentYear() - 1, currentYear()].map((y) => (
              <Pressable
                key={y}
                accessibilityRole="button"
                accessibilityState={{ selected: y === year }}
                onPress={() => setYear(y)}
                style={[
                  styles.yearChip,
                  { backgroundColor: y === year ? theme.primary : theme.backgroundElement },
                ]}>
                <ThemedText type="smallBold" style={{ color: y === year ? theme.background : theme.text }}>
                  {y}
                </ThemedText>
              </Pressable>
            ))}
          </View>

          {mine && shareout && shareout.status !== 'proposed' ? (
            <Card>
              <ThemedText type="small" themeColor="textSecondary">
                {t('Your share for {year}', { year })}
              </ThemedText>
              <ThemedText type="title" style={[styles.big, { color: theme.primary }]}>
                {money(mine.amount)}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {mine.paid_at
                  ? t('Paid to you on {date}', { date: formatDateTime(mine.paid_at) })
                  : t('Approved — the Treasurer will pay you soon.')}
              </ThemedText>
            </Card>
          ) : null}

          {figures ? (
            <Card>
              <View style={styles.head}>
                <ThemedText type="smallBold" style={styles.flex}>
                  {t('Year-end calculation {year}', { year })}
                </ThemedText>
                {shareout ? (
                  <Pill label={t(SHAREOUT_STATUS_LABEL[shareout.status])} tone={SHAREOUT_STATUS_TONE[shareout.status]} />
                ) : (
                  <Pill label={t('Preview')} />
                )}
              </View>
              <Row label={t('Interest and penalties earned')} value={money(figures.interest_income)} />
              <Row label={t('Minus group charges')} value={`− ${money(figures.charges)}`} />
              <Divider />
              <Row label={t('Profit to share')} value={money(figures.profit)} bold />
              <Row label={t('Paid out to members (rounded down)')} value={money(distributed)} />
              {preview && !shareout ? (
                <Row label={t('Money in the group fund now')} value={money(preview.available)} />
              ) : null}
              <ThemedText type="small" themeColor="textSecondary">
                {t('Shares counted as at {date}. Jamii is never included.', { date: formatDateTime(figures.cutoff_at) })}
              </ThemedText>
              {shareout ? (
                <>
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('Prepared by {name} on {date}', { name: nameOf(shareout.prepared_by), date: formatDateTime(shareout.prepared_at) })}
                  </ThemedText>
                  {shareout.decided_at ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      {t('Approved by {name} on {date}', { name: nameOf(shareout.decided_by), date: formatDateTime(shareout.decided_at) })}
                    </ThemedText>
                  ) : null}
                  {shareout.completed_at ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      {t('Everyone paid by {date}', { date: formatDateTime(shareout.completed_at) })}
                    </ThemedText>
                  ) : null}
                </>
              ) : null}
            </Card>
          ) : (
            <Card>
              <ThemedText type="small" themeColor="textSecondary">
                {t('The share-out for {year} has not been prepared yet.', { year })}
              </ThemedText>
            </Card>
          )}

          {!shareout && lastRejected ? (
            <Card>
              <ThemedText type="small" themeColor="danger">
                {t('The last share-out was rejected by {name} on {date}: {reason}', {
                  name: nameOf(lastRejected.decided_by),
                  date: formatDateTime(lastRejected.decided_at),
                  reason: lastRejected.decision_note ?? '',
                })}
              </ThemedText>
            </Card>
          ) : null}

          {sortedLines.length > 0 ? (
            <Card>
              <View style={styles.head}>
                <ThemedText type="smallBold" style={styles.flex}>
                  {t('Member shares')}
                </ThemedText>
                {shareout && shareout.status !== 'proposed' ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('{paid} of {total} paid', { paid: paidCount, total: lines.length })}
                  </ThemedText>
                ) : null}
              </View>
              {sortedLines.map((l, i) => {
                const canPay = officer && shareout?.status === 'approved' && !l.paid_at;
                return (
                  <View key={l.member_id}>
                    {i > 0 ? <Divider /> : null}
                    <View style={styles.line}>
                      {shareout && shareout.status !== 'proposed' ? (
                        <SymbolView
                          name={l.paid_at ? icon('checkmark.circle.fill', 'check_circle') : icon('clock', 'schedule')}
                          size={20}
                          tintColor={l.paid_at ? theme.primary : theme.textSecondary}
                        />
                      ) : null}
                      <View style={styles.flex}>
                        <ThemedText type="smallBold">
                          {l.name || nameOf(l.member_id)}
                          {l.member_id === me ? ` (${t('you')})` : ''}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {t('{count} shares', { count: l.shares })}
                          {l.paid_at ? ` · ${t('Paid {date}', { date: formatDateTime(l.paid_at) })}` : ''}
                        </ThemedText>
                      </View>
                      <ThemedText type="smallBold">{money(l.amount)}</ThemedText>
                    </View>
                    {canPay && payingFor !== l.member_id ? (
                      <Button
                        title={t('Record payout')}
                        variant="secondary"
                        onPress={() => {
                          setPayingFor(l.member_id);
                          setMethod(null);
                          setReference('');
                          setError(null);
                        }}
                      />
                    ) : null}
                    {canPay && payingFor === l.member_id ? (
                      <View style={styles.payBox}>
                        <PaymentMethodPicker value={method} onChange={setMethod} />
                        {method ? (
                          <TextField
                            label={method === 'cash' ? t('Receipt number (optional)') : t('Reference')}
                            value={reference}
                            onChangeText={setReference}
                          />
                        ) : null}
                        <View style={styles.buttons}>
                          <Button title={t('Cancel')} variant="secondary" onPress={() => setPayingFor(null)} />
                          <Button
                            title={t('Confirm payout')}
                            loading={busy === `pay${l.member_id}`}
                            onPress={() => pay(l.member_id)}
                          />
                        </View>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </Card>
          ) : null}

          {!shareout && role === 'treasurer' && preview && preview.profit > 0 ? (
            <Card>
              <ThemedText type="small" themeColor="textSecondary">
                {year === currentYear()
                  ? t('The year has not ended yet: preparing now uses the shares and profit up to this moment.')
                  : t('Check the figures, then send them to the Group Admin for approval.')}
              </ThemedText>
              <Button
                title={t('Prepare and send for approval')}
                loading={busy === 'prepare'}
                onPress={() => run('prepare', { action: 'prepare', group_id: group.id, year })}
              />
            </Card>
          ) : null}
          {!shareout && role === 'group_admin' ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
              {t('The Treasurer prepares the share-out; you approve it. Appoint a Treasurer from a member’s profile.')}
            </ThemedText>
          ) : null}

          {shareout?.status === 'proposed' && role === 'group_admin' ? (
            <Card>
              <ThemedText type="smallBold">{t('Your decision')}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {t('Approving lets the Treasurer pay each member their share in cash.')}
              </ThemedText>
              <TextField label={t('Note (required to reject)')} value={note} onChangeText={setNote} />
              <View style={styles.buttons}>
                <Button
                  title={t('Reject')}
                  variant="danger"
                  loading={busy === 'reject'}
                  onPress={() => run('reject', { action: 'decide', shareout_id: shareout.id, decision: 'reject', note })}
                />
                <Button
                  title={t('Approve')}
                  loading={busy === 'approve'}
                  onPress={() => run('approve', { action: 'decide', shareout_id: shareout.id, decision: 'approve', note })}
                />
              </View>
            </Card>
          ) : null}
          {shareout?.status === 'proposed' && role !== 'group_admin' ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
              {t('Waiting for the Group Admin to approve.')}
            </ThemedText>
          ) : null}

          {error ? (
            <ThemedText type="small" themeColor="danger">
              {t(error)}
            </ThemedText>
          ) : null}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.row}>
      <ThemedText type={bold ? 'smallBold' : 'small'} themeColor={bold ? undefined : 'textSecondary'} style={styles.flex}>
        {label}
      </ThemedText>
      <ThemedText type="smallBold">{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, padding: Spacing.four, paddingBottom: Spacing.five },
  column: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', gap: Spacing.three },
  years: { flexDirection: 'row', gap: Spacing.two },
  yearChip: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderRadius: 999 },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  big: { fontSize: 32, lineHeight: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  line: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two },
  payBox: { gap: Spacing.two, paddingBottom: Spacing.two },
  buttons: { flexDirection: 'row', gap: Spacing.two, justifyContent: 'flex-end' },
  centerText: { textAlign: 'center' },
});
