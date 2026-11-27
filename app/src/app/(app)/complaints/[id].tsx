import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Card, Divider, icon, MenuRow, Pill } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { formatDateTime } from '@/lib/datetime';
import { useSession } from '@/lib/auth/session-context';
import {
  CATEGORY_LABELS,
  COMPLAINT_COLUMNS,
  STATUS_LABELS,
  STATUS_TONES,
  type Complaint,
  type ComplaintStatus,
} from '@/lib/complaints';
import { functionErrorMessage } from '@/lib/function-error';
import { useT } from '@/lib/i18n';
import { useMembership } from '@/lib/membership-context';
import { supabase } from '@/lib/supabase';

type LinkedTx = { id: string; type: string; amount: number; created_at: string; reference: string | null; txn_number: string };

const TX_LABELS: Record<string, string> = {
  contribution: 'Contribution',
  loan_disbursement: 'Loan received',
  repayment: 'Loan repayment',
  reversal: 'Reversal',
  jamii_contribution: 'Jamii contribution',
  jamii_payout: 'Jamii help received',
  group_expense: 'Group expense',
};

export default function ComplaintDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const t = useT();
  const { session } = useSession();
  const { group, membership } = useMembership();

  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [memberName, setMemberName] = useState('');
  const [responderName, setResponderName] = useState('');
  const [tx, setTx] = useState<LinkedTx | null>(null);
  const [response, setResponse] = useState('');
  const [busy, setBusy] = useState<ComplaintStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase.from('member_complaints').select(COMPLAINT_COLUMNS).eq('id', id).maybeSingle();
    const c = data as Complaint | null;
    setComplaint(c);
    if (!c) return;

    const ids = [c.member_id, c.responded_by].filter((v): v is string => !!v);
    const { data: profiles } = await supabase.from('profiles_public').select('id, first_name, last_name').in('id', ids);
    const nameById = new Map((profiles ?? []).map((p) => [p.id, `${p.first_name} ${p.last_name}`.trim()]));
    setMemberName(nameById.get(c.member_id) ?? '');
    setResponderName(c.responded_by ? (nameById.get(c.responded_by) ?? '') : '');

    if (c.transaction_id) {
      const { data: txRow } = await supabase
        .from('transactions')
        .select('id, txn_number, type, amount, created_at, reference')
        .eq('id', c.transaction_id)
        .maybeSingle();
      setTx(txRow as LinkedTx | null);
    } else {
      setTx(null);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (!complaint) return null;

  const isAdmin = membership?.role === 'group_admin' && membership.status === 'active';
  const isMine = complaint.member_id === session?.user.id;
  const isClosed = complaint.status === 'resolved' || complaint.status === 'rejected';
  const canRespond = isAdmin && !isMine && !isClosed;

  async function respond(status: Exclude<ComplaintStatus, 'open'>) {
    setError(null);
    if (status !== 'in_review' && !response.trim()) {
      setError('Write a response to the member before closing the complaint.');
      return;
    }
    setBusy(status);
    const { data, error: fnError } = await supabase.functions.invoke('respond-to-complaint', {
      body: { complaint_id: complaint!.id, status, response: response.trim() },
    });
    setBusy(null);
    const message = (data as { error?: string } | null)?.error ?? (await functionErrorMessage(fnError));
    if (message) {
      setError(message);
      return;
    }
    setResponse('');
    await load();
  }

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          <Card>
            <Pill label={t(STATUS_LABELS[complaint.status])} tone={STATUS_TONES[complaint.status]} />
            <ThemedText type="subtitle" style={styles.subject}>
              {complaint.subject}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {isMine ? t('You') : memberName} • {t(CATEGORY_LABELS[complaint.category])} •{' '}
              {formatDateTime(complaint.created_at)}
            </ThemedText>
            <Divider />
            <ThemedText type="default">{complaint.details}</ThemedText>
          </Card>

          {tx ? (
            <Card>
              <ThemedText type="small" themeColor="textSecondary">
                {t('About this transaction')}
              </ThemedText>
              <View style={styles.txRow}>
                <View style={styles.flex}>
                  <ThemedText type="smallBold">{t(TX_LABELS[tx.type] ?? tx.type)}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {formatDateTime(tx.created_at)}
                    {` • ${tx.txn_number}`}
                    {tx.reference ? ` • ${tx.reference}` : ''}
                  </ThemedText>
                </View>
                <ThemedText type="smallBold">
                  {group?.currency} {Math.abs(Number(tx.amount)).toLocaleString()}
                </ThemedText>
              </View>
              {isAdmin ? (
                <>
                  <Divider />
                  <MenuRow
                    iconName={icon('checkmark.rectangle', 'fact_check')}
                    title={t('Check or correct this transaction')}
                    subtitle={t('Reconcile it, or reverse it if it is wrong')}
                    onPress={() =>
                      router.push({ pathname: '/(app)/admin/transaction/[id]', params: { id: tx.id } })
                    }
                  />
                </>
              ) : null}
            </Card>
          ) : null}

          {complaint.admin_response ? (
            <Card>
              <ThemedText type="small" themeColor="textSecondary">
                {t('Response from {name}', { name: responderName || t('Group Admin') })}
                {complaint.responded_at ? ` • ${formatDateTime(complaint.responded_at)}` : ''}
              </ThemedText>
              <ThemedText type="default">{complaint.admin_response}</ThemedText>
            </Card>
          ) : !isClosed && !canRespond ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
              {complaint.status === 'in_review'
                ? t('A Group Admin is looking into this.')
                : t('Waiting for a Group Admin to respond.')}
            </ThemedText>
          ) : null}

          {isAdmin && isMine && !isClosed ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
              {t('Another Group Admin must respond to your own complaint.')}
            </ThemedText>
          ) : null}

          {canRespond ? (
            <Card>
              <ThemedText type="smallBold" style={styles.heading}>
                {t('Respond to the member')}
              </ThemedText>
              <TextField
                placeholder={t('What you found, and what was done about it')}
                value={response}
                onChangeText={setResponse}
                maxLength={2000}
                multiline
                style={styles.responseInput}
              />
              {error ? (
                <ThemedText type="small" themeColor="danger">
                  {t(error)}
                </ThemedText>
              ) : null}
              {complaint.status === 'open' ? (
                <Button
                  title={t('Mark as Being Reviewed')}
                  variant="secondary"
                  onPress={() => respond('in_review')}
                  loading={busy === 'in_review'}
                  disabled={busy !== null}
                />
              ) : null}
              <Button
                title={t('Resolve')}
                onPress={() => respond('resolved')}
                loading={busy === 'resolved'}
                disabled={busy !== null}
              />
              <Button
                title={t('Not Upheld')}
                variant="danger"
                onPress={() => respond('rejected')}
                loading={busy === 'rejected'}
                disabled={busy !== null}
              />
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
  subject: { fontSize: 20, lineHeight: 26 },
  heading: { fontSize: 16 },
  txRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  center: { textAlign: 'center' },
  responseInput: { minHeight: 100, textAlignVertical: 'top' },
});
