import { useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Card, Divider, icon, Pill, ProgressBar } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSession } from '@/lib/auth/session-context';
import { formatDateTime } from '@/lib/datetime';
import {
  CHANGE_STATUS_LABEL,
  CHANGE_STATUS_TONE,
  loadGroupRules,
  oversightAction,
  RULE_FIELDS,
  type GroupRulesState,
  type RuleChange,
  type Rules,
} from '@/lib/group-rules';
import { useT } from '@/lib/i18n';
import { useMembership } from '@/lib/membership-context';

type Draft = Record<keyof Rules, string>;

function toDraft(r: Rules): Draft {
  return {
    contribution_amount: String(r.contribution_amount),
    contribution_frequency: r.contribution_frequency,
    share_value: String(r.share_value),
    loan_interest_rate: String(r.loan_interest_rate),
    late_penalty_weekly_rate: String(r.late_penalty_weekly_rate),
    jamii_contribution_amount: String(r.jamii_contribution_amount),
  };
}

function fromDraft(d: Draft): Record<string, unknown> {
  const num = (v: string) => Number(v.replace(/[,\s]/g, '').replace(',', '.'));
  return {
    contribution_amount: num(d.contribution_amount),
    contribution_frequency: d.contribution_frequency,
    share_value: num(d.share_value),
    loan_interest_rate: num(d.loan_interest_rate),
    late_penalty_weekly_rate: num(d.late_penalty_weekly_rate),
    jamii_contribution_amount: num(d.jamii_contribution_amount),
  };
}

// Group rules under Atlast oversight. Everyone sees the rules, whether they
// are locked, any change in progress (with the vote) and past changes.
// The Atlast admin enters and locks the rules, opens votes and decides; the
// Group Admin proposes changes; every member votes.
export default function GroupRulesScreen() {
  const t = useT();
  const theme = useTheme();
  const { session } = useSession();
  const { group, membership } = useMembership();
  const me = session?.user.id ?? '';
  const isGroupAdmin = membership?.role === 'group_admin' && membership.status === 'active';

  const [state, setState] = useState<GroupRulesState | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!group || !me) return;
    const s = await loadGroupRules(group.id, me);
    setState(s);
    if (s) setDraft(toDraft(s.rules));
  }, [group, me]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (!group || !membership || !state || !draft) return <ThemedView style={styles.flex} />;

  const atlast = state.isAtlastAdmin && !isGroupAdmin;
  const locked = state.lockedAt !== null;
  const open = state.changes.find((c) => c.status === 'proposed' || c.status === 'voting') ?? null;
  const past = state.changes.filter((c) => c !== open);

  const show = (key: keyof Rules, r: Rules) => {
    const f = RULE_FIELDS.find((x) => x.key === key)!;
    const v = r[key];
    if (f.kind === 'money') return `${group.currency} ${Number(v).toLocaleString()}`;
    if (f.kind === 'percent') return `${Number(v)}%`;
    return t(String(v)[0].toUpperCase() + String(v).slice(1));
  };

  async function run(key: string, body: Record<string, unknown>, done: string) {
    setError(null);
    setNotice(null);
    setBusy(key);
    const { error: message } = await oversightAction(body);
    setBusy(null);
    if (message) {
      setError(message);
      return false;
    }
    setNotice(done);
    await load();
    return true;
  }

  const ruleInputs = (
    <>
      {RULE_FIELDS.map((f) =>
        f.kind === 'frequency' ? (
          <View key={f.key} style={styles.freqRow}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
              {t(f.label)}
            </ThemedText>
            {(['weekly', 'monthly'] as const).map((v) => {
              const on = draft.contribution_frequency === v;
              return (
                <Pressable
                  key={v}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => setDraft({ ...draft, contribution_frequency: v })}
                  style={[styles.chip, { backgroundColor: on ? theme.primary : theme.backgroundSelected }]}>
                  <ThemedText type="small" style={{ color: on ? theme.onPrimary : theme.text }}>
                    {t(v === 'weekly' ? 'Weekly' : 'Monthly')}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <TextField
            key={f.key}
            label={`${t(f.label)}${f.kind === 'percent' ? ' (%)' : ` (${group.currency})`}`}
            value={draft[f.key]}
            onChangeText={(v) => setDraft({ ...draft, [f.key]: v })}
            keyboardType="numeric"
          />
        )
      )}
    </>
  );

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          {/* Current rules and lock status */}
          <Card>
            <View style={styles.head}>
              <SymbolView
                name={locked ? icon('lock.fill', 'lock') : icon('lock.open', 'lock_open')}
                size={20}
                tintColor={theme.primary}
              />
              <ThemedText type="smallBold" style={styles.flex}>
                {t('Group rules')}
              </ThemedText>
              <Pill label={locked ? t('Locked by Atlast') : t('Not locked')} tone={locked ? 'good' : 'warn'} />
            </View>
            {RULE_FIELDS.map((f, i) => (
              <View key={f.key}>
                {i > 0 ? <Divider /> : null}
                <View style={styles.row}>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
                    {t(f.label)}
                  </ThemedText>
                  <ThemedText type="smallBold">{show(f.key, state.rules)}</ThemedText>
                </View>
              </View>
            ))}
            <ThemedText type="small" themeColor="textSecondary">
              {locked
                ? t('Locked on {date}. Nobody can change these directly, not even the Group Admin or Atlast. A change needs a yes vote from at least a third of members and Atlast approval.', {
                    date: formatDateTime(state.lockedAt),
                  })
                : t('Atlast enters these rules and then locks them, so they cannot be changed without the members.')}
            </ThemedText>
          </Card>

          {/* Atlast: enter and lock (only while unlocked) */}
          {atlast && !locked ? (
            <Card>
              <ThemedText type="smallBold">{t('Atlast: enter the rules')}</ThemedText>
              {ruleInputs}
              <View style={styles.buttons}>
                <Button
                  title={t('Save')}
                  variant="secondary"
                  loading={busy === 'save'}
                  onPress={() => run('save', { action: 'set_rules', group_id: group.id, rules: fromDraft(draft), lock: false }, 'Saved.')}
                />
                <Button
                  title={t('Save and lock')}
                  loading={busy === 'lock'}
                  onPress={() =>
                    run('lock', { action: 'set_rules', group_id: group.id, rules: fromDraft(draft), lock: true }, 'Rules locked. Members have been told.')
                  }
                />
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                {t('Once locked, you cannot edit these either: changes only go through a member vote.')}
              </ThemedText>
            </Card>
          ) : null}

          {/* The change in progress */}
          {open ? (
            <ChangeCard
              change={open}
              show={show}
              tally={state.tallies.get(open.id)}
              myVote={state.myVotes.get(open.id)}
              busy={busy}
              onVote={(choice) =>
                run(`vote-${choice}`, { action: 'vote', change_id: open.id, choice }, 'Your vote has been recorded.')
              }
              atlastControls={
                atlast ? (
                  open.status === 'proposed' ? (
                    <View style={styles.buttons}>
                      <Button
                        title={t('Reject')}
                        variant="danger"
                        loading={busy === 'reject'}
                        onPress={() => run('reject', { action: 'decide', change_id: open.id, decision: 'reject', note }, 'Change rejected.')}
                      />
                      <Button
                        title={t('Open the member vote (7 days)')}
                        loading={busy === 'open'}
                        onPress={() => run('open', { action: 'open_vote', change_id: open.id, days: 7 }, 'The vote is open to all members.')}
                      />
                    </View>
                  ) : (
                    <View style={styles.buttons}>
                      <Button
                        title={t('Reject')}
                        variant="danger"
                        loading={busy === 'reject'}
                        onPress={() => run('reject', { action: 'decide', change_id: open.id, decision: 'reject', note }, 'Change rejected.')}
                      />
                      <Button
                        title={t('Approve the change')}
                        loading={busy === 'approve'}
                        disabled={(state.tallies.get(open.id)?.approve ?? 0) < (open.approvals_needed ?? 1)}
                        onPress={() => run('approve', { action: 'decide', change_id: open.id, decision: 'approve', note }, 'Approved. The new rules are in force.')}
                      />
                    </View>
                  )
                ) : isGroupAdmin && open.status === 'proposed' ? (
                  <Button
                    title={t('Withdraw proposal')}
                    variant="secondary"
                    loading={busy === 'cancel'}
                    onPress={() => run('cancel', { action: 'cancel', change_id: open.id }, 'Proposal withdrawn.')}
                  />
                ) : null
              }
              noteField={atlast ? <TextField label={t('Note (required to reject)')} value={note} onChangeText={setNote} /> : null}
            />
          ) : null}

          {/* Group Admin: propose a change to locked rules */}
          {isGroupAdmin && locked && !open ? (
            <Card>
              <ThemedText type="smallBold">{t('Propose a change')}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {t('Atlast will open a vote for all members. At least a third must vote yes before Atlast can approve it.')}
              </ThemedText>
              {ruleInputs}
              <TextField label={t('Reason for the change')} value={reason} onChangeText={setReason} multiline />
              <Button
                title={t('Send proposal')}
                loading={busy === 'propose'}
                onPress={async () => {
                  const ok = await run('propose', { action: 'propose', group_id: group.id, rules: fromDraft(draft), reason }, 'Proposal sent to Atlast.');
                  if (ok) setReason('');
                }}
              />
            </Card>
          ) : null}

          {error ? (
            <ThemedText type="small" themeColor="danger">
              {t(error)}
            </ThemedText>
          ) : null}
          {notice ? (
            <ThemedText type="small" themeColor="primary">
              {t(notice)}
            </ThemedText>
          ) : null}

          {past.length > 0 ? (
            <>
              <ThemedText type="smallBold">{t('Past changes')}</ThemedText>
              {past.map((c) => (
                <ChangeCard key={c.id} change={c} show={show} tally={state.tallies.get(c.id)} myVote={state.myVotes.get(c.id)} busy={null} />
              ))}
            </>
          ) : null}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

function ChangeCard({
  change: c,
  show,
  tally,
  myVote,
  busy,
  onVote,
  atlastControls,
  noteField,
}: {
  change: RuleChange;
  show: (key: keyof Rules, r: Rules) => string;
  tally?: { approve: number; decline: number };
  myVote?: { choice: 'approve' | 'decline'; voted_at: string };
  busy: string | null;
  onVote?: (choice: 'approve' | 'decline') => void;
  atlastControls?: React.ReactNode;
  noteField?: React.ReactNode;
}) {
  const t = useT();
  const changed = RULE_FIELDS.filter((f) => c.current_rules[f.key] !== c.proposed_rules[f.key]);
  const yes = tally?.approve ?? 0;
  const needed = c.approvals_needed ?? 0;

  return (
    <Card>
      <View style={styles.head}>
        <ThemedText type="smallBold" style={styles.flex}>
          {t('Rule change')}
        </ThemedText>
        <Pill label={t(CHANGE_STATUS_LABEL[c.status])} tone={CHANGE_STATUS_TONE[c.status]} />
      </View>
      {changed.map((f) => (
        <View key={f.key} style={styles.row}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
            {t(f.label)}
          </ThemedText>
          <ThemedText type="smallBold">
            {show(f.key, c.current_rules)} → {show(f.key, c.proposed_rules)}
          </ThemedText>
        </View>
      ))}
      <ThemedText type="small">“{c.reason}”</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {t('Proposed by the Group Admin on {date}', { date: formatDateTime(c.created_at) })}
      </ThemedText>

      {c.status === 'voting' || (c.approvals_needed !== null && c.status !== 'proposed') ? (
        <>
          <View style={styles.row}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
              {t('Yes votes (a third of members needed)')}
            </ThemedText>
            <ThemedText type="smallBold">
              {yes}/{needed}
            </ThemedText>
          </View>
          <ProgressBar value={needed ? Math.min(1, yes / needed) : 0} />
          <ThemedText type="small" themeColor="textSecondary">
            {t('{yes} yes · {no} no — secret ballot, only totals are shown.', { yes, no: tally?.decline ?? 0 })}
          </ThemedText>
          {c.vote_closes_at ? (
            <ThemedText type="small" themeColor="textSecondary">
              {t('Vote closes {date}', { date: formatDateTime(c.vote_closes_at) })}
            </ThemedText>
          ) : null}
        </>
      ) : null}

      {myVote ? (
        <ThemedText type="small" themeColor="primary">
          {myVote.choice === 'approve' ? t('✓ You voted yes') : t('✓ You voted no')} · {formatDateTime(myVote.voted_at)}
        </ThemedText>
      ) : c.vote_is_open && onVote ? (
        <View style={styles.buttons}>
          <Button title={t('Vote no')} variant="danger" loading={busy === 'vote-decline'} onPress={() => onVote('decline')} />
          <Button title={t('Vote yes')} loading={busy === 'vote-approve'} onPress={() => onVote('approve')} />
        </View>
      ) : null}

      {c.decided_at && c.status !== 'cancelled' ? (
        <ThemedText type="small" themeColor="textSecondary">
          {t('Decided by Atlast on {date}', { date: formatDateTime(c.decided_at) })}
          {c.decision_note ? `: ${c.decision_note}` : ''}
        </ThemedText>
      ) : null}
      {noteField}
      {atlastControls}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, padding: Spacing.four, paddingBottom: Spacing.five },
  column: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', gap: Spacing.three },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.one },
  freqRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  chip: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.one + 2, borderRadius: 999 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, justifyContent: 'flex-end' },
});
