import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { PaymentMethodPicker } from '@/components/payment-method-picker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Card, Divider, icon, Pill } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDateTime } from '@/lib/datetime';
import { useSession } from '@/lib/auth/session-context';
import { useT } from '@/lib/i18n';
import { useMembership } from '@/lib/membership-context';
import { needsReference, type PaymentMethod } from '@/lib/payment-methods';
import {
  fetchNames,
  fetchSpendRequest,
  spendingAction,
  STATUS_LABEL,
  STATUS_TONE,
  type SpendApprover,
  type SpendRequest,
} from '@/lib/spending';

const DECISION_ICON: Record<SpendApprover['decision'], [string, string]> = {
  pending: ['clock', 'schedule'],
  approve: ['checkmark.circle.fill', 'check_circle'],
  decline: ['xmark.circle.fill', 'cancel'],
};
const DECISION_LABEL: Record<SpendApprover['decision'], string> = {
  pending: 'Waiting',
  approve: 'Approved',
  decline: 'Declined',
};

export default function SpendRequestScreen() {
  const t = useT();
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const { group, membership } = useMembership();
  const isAdmin = membership?.role === 'group_admin' && membership.status === 'active';
  const me = session?.user.id;

  const [request, setRequest] = useState<SpendRequest | null>(null);
  const [approvers, setApprovers] = useState<SpendApprover[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [comment, setComment] = useState('');
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const { request: r, approvers: a } = await fetchSpendRequest(id);
    setRequest(r);
    setApprovers(a);
    if (r) setNames(await fetchNames([r.beneficiary_id ?? '', r.created_by, ...a.map((x) => x.approver_id)]));
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (!group) return null;
  if (!request) {
    return <ThemedView style={styles.flex} />;
  }

  const money = (n: number) => `${group.currency} ${Math.round(n).toLocaleString()}`;
  const myVote = approvers.find((a) => a.approver_id === me);
  const canVote = request.status === 'pending' && myVote?.decision === 'pending';
  const canPay = isAdmin && request.status === 'approved';
  const canCancel = isAdmin && (request.status === 'pending' || request.status === 'approved');

  async function run(action: string, body: Record<string, unknown>) {
    setError(null);
    setBusy(typeof body.decision === 'string' ? body.decision : action);
    const { error: message } = await spendingAction({ action, request_id: request!.id, ...body });
    setBusy(null);
    if (message) {
      setError(message);
      return;
    }
    await load();
  }

  function pay() {
    if (!method) return setError('Choose how you paid.');
    if (needsReference(method) && !reference.trim()) return setError('Enter the mobile money reference.');
    run('pay', { payment_method: method, reference: reference.trim() });
  }

  const modeText =
    request.approval_mode === 'random'
      ? t('3 approvers picked at random from members in good standing.')
      : request.approval_mode === 'admin_picked'
        ? t('Too few members met every rule, so the Group Admin chose the 3 approvers from the suggestions.')
        : t('The group has fewer than 3 other members, so the Group Admin decided alone.');

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          <Card>
            <View style={styles.head}>
              <View style={styles.flex}>
                <ThemedText type="small" themeColor="textSecondary">
                  {request.kind === 'jamii'
                    ? t('Jamii help for {name}', { name: names.get(request.beneficiary_id ?? '') || t('Member') })
                    : request.category
                      ? t(request.category)
                      : t('Miscellaneous charge')}
                </ThemedText>
                <ThemedText type="subtitle" style={styles.big}>
                  {money(request.amount)}
                </ThemedText>
              </View>
              <Pill label={t(STATUS_LABEL[request.status])} tone={STATUS_TONE[request.status]} />
            </View>
            <ThemedText type="default">{request.reason}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t('Started by {name} on {date}', {
                name: names.get(request.created_by) || t('Group Admin'),
                date: formatDateTime(request.created_at),
              })}
            </ThemedText>
            {request.paid_at ? (
              <ThemedText type="small" themeColor="textSecondary">
                {t('Paid on {date}', { date: formatDateTime(request.paid_at) })}
              </ThemedText>
            ) : null}
          </Card>

          <Card>
            <ThemedText type="smallBold">{t('Approvers')}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {modeText}
            </ThemedText>
            {approvers.map((a, i) => {
              const [ios, material] = DECISION_ICON[a.decision];
              const color =
                a.decision === 'approve' ? theme.primary : a.decision === 'decline' ? theme.danger : theme.textSecondary;
              return (
                <View key={a.approver_id}>
                  {i > 0 ? <Divider /> : null}
                  <View style={styles.approver}>
                    <SymbolView name={icon(ios, material)} size={22} tintColor={color} />
                    <View style={styles.flex}>
                      <ThemedText type="smallBold">
                        {names.get(a.approver_id) || t('Member')}
                        {a.approver_id === me ? ` (${t('you')})` : ''}
                      </ThemedText>
                      {a.decided_at ? (
                        <ThemedText type="small" themeColor="textSecondary">
                          {formatDateTime(a.decided_at)}
                        </ThemedText>
                      ) : null}
                      {a.comment ? (
                        <ThemedText type="small" themeColor="textSecondary">
                          “{a.comment}”
                        </ThemedText>
                      ) : null}
                    </View>
                    <ThemedText type="small" themeColor="textSecondary">
                      {t(DECISION_LABEL[a.decision])}
                    </ThemedText>
                  </View>
                </View>
              );
            })}
          </Card>

          {canVote ? (
            <Card>
              <ThemedText type="smallBold">{t('Your decision')}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {t('All 3 approvers must approve. If you decline, the request is declined.')}
              </ThemedText>
              <TextField label={t('Comment (optional)')} value={comment} onChangeText={setComment} />
              <View style={styles.buttons}>
                <Button
                  title={t('Decline')}
                  variant="danger"
                  loading={busy === 'decline'}
                  onPress={() => run('decide', { decision: 'decline', comment })}
                />
                <Button
                  title={t('Approve')}
                  loading={busy === 'approve'}
                  onPress={() => run('decide', { decision: 'approve', comment })}
                />
              </View>
            </Card>
          ) : null}

          {canPay ? (
            <Card>
              <ThemedText type="smallBold">{t('Record the payout')}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {request.kind === 'jamii'
                  ? t('Send the money to the member, then record it here. It comes out of the Jamii pot.')
                  : t('Pay the charge, then record it here. It comes out of the group fund.')}
              </ThemedText>
              <PaymentMethodPicker value={method} onChange={setMethod} />
              {method ? (
                <TextField
                  label={method === 'cash' ? t('Receipt number (optional)') : t('Reference')}
                  value={reference}
                  onChangeText={setReference}
                />
              ) : null}
              <Button title={t('Record payout')} loading={busy === 'pay'} onPress={pay} />
            </Card>
          ) : null}

          {error ? (
            <ThemedText type="small" themeColor="danger">
              {t(error)}
            </ThemedText>
          ) : null}

          {canCancel ? (
            <Button
              title={t('Cancel request')}
              variant="secondary"
              loading={busy === 'cancel'}
              onPress={() => run('cancel', {})}
            />
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
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  big: { fontSize: 26, lineHeight: 32 },
  approver: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two },
  buttons: { flexDirection: 'row', gap: Spacing.two, justifyContent: 'flex-end' },
});
