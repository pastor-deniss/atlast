import { functionErrorMessage } from '@/lib/function-error';
import { supabase } from '@/lib/supabase';

// AtLast oversight of a group's key rules (.scratch/atlast-mvp-spec/atlast-oversight.sql).
// The AtLast admin enters the rules and locks them. After that a change
// needs: the Group Admin's proposal -> a member vote the AtLast admin opens
// -> at least a third of members voting yes -> the AtLast admin's approval.

export type Rules = {
  contribution_amount: number;
  contribution_frequency: string;
  share_value: number;
  loan_interest_rate: number;
  late_penalty_weekly_rate: number;
  jamii_contribution_amount: number;
};

export const RULE_FIELDS: { key: keyof Rules; label: string; kind: 'money' | 'percent' | 'frequency' }[] = [
  { key: 'contribution_amount', label: 'Contribution amount', kind: 'money' },
  { key: 'contribution_frequency', label: 'Contribution frequency', kind: 'frequency' },
  { key: 'share_value', label: 'Share value', kind: 'money' },
  { key: 'loan_interest_rate', label: 'Loan interest', kind: 'percent' },
  { key: 'late_penalty_weekly_rate', label: 'Late penalty per week', kind: 'percent' },
  { key: 'jamii_contribution_amount', label: 'Jamii contribution', kind: 'money' },
];

export type ChangeStatus = 'proposed' | 'voting' | 'approved' | 'rejected' | 'cancelled';

export type RuleChange = {
  id: string;
  proposed_by: string;
  current_rules: Rules;
  proposed_rules: Rules;
  reason: string;
  status: ChangeStatus;
  created_at: string;
  approvals_needed: number | null;
  vote_opened_at: string | null;
  vote_closes_at: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  /** Worked out when loaded: the vote is open and not past its closing time. */
  vote_is_open: boolean;
};

export type GroupRulesState = {
  rules: Rules;
  lockedAt: string | null;
  lockedBy: string | null;
  changes: RuleChange[];
  tallies: Map<string, { approve: number; decline: number }>;
  myVotes: Map<string, { choice: 'approve' | 'decline'; voted_at: string }>;
  isAtlastAdmin: boolean;
  /** My role in this group, or null if I am not an active member (e.g. AtLast). */
  myRole: string | null;
};

function toRules(r: Record<string, unknown>): Rules {
  return {
    contribution_amount: Number(r.contribution_amount ?? 0),
    contribution_frequency: String(r.contribution_frequency ?? 'monthly'),
    share_value: Number(r.share_value ?? 0),
    loan_interest_rate: Number(r.loan_interest_rate ?? 0),
    late_penalty_weekly_rate: Number(r.late_penalty_weekly_rate ?? 0),
    jamii_contribution_amount: Number(r.jamii_contribution_amount ?? 0),
  };
}

export async function loadGroupRules(groupId: string, me: string): Promise<GroupRulesState | null> {
  const [groupRes, changesRes, meRes, roleRes] = await Promise.all([
    supabase
      .from('groups')
      .select(
        'contribution_amount, contribution_frequency, share_value, loan_interest_rate, late_penalty_weekly_rate, jamii_contribution_amount, rules_locked_at, rules_locked_by'
      )
      .eq('id', groupId)
      .maybeSingle(),
    supabase.from('group_rule_changes').select('*').eq('group_id', groupId).order('created_at', { ascending: false }).limit(20),
    supabase.from('profiles').select('is_system_admin').eq('id', me).maybeSingle(),
    supabase.from('memberships').select('role').eq('group_id', groupId).eq('user_id', me).eq('status', 'active').maybeSingle(),
  ]);
  if (!groupRes.data) return null;
  const now = Date.now();
  const changes = (changesRes.data ?? []).map((c) => ({
    ...(c as RuleChange),
    vote_is_open: c.status === 'voting' && !!c.vote_closes_at && new Date(c.vote_closes_at).getTime() > now,
    current_rules: toRules(c.current_rules ?? {}),
    proposed_rules: toRules(c.proposed_rules ?? {}),
  }));
  const ids = changes.map((c) => c.id);
  const [talliesRes, votesRes] = ids.length
    ? await Promise.all([
        supabase.from('group_rule_change_tallies').select('change_id, approve_count, decline_count').in('change_id', ids),
        supabase.from('group_rule_change_votes').select('change_id, choice, voted_at').eq('member_id', me).in('change_id', ids),
      ])
    : [{ data: [] }, { data: [] }];
  return {
    rules: toRules(groupRes.data),
    lockedAt: groupRes.data.rules_locked_at,
    lockedBy: groupRes.data.rules_locked_by,
    changes,
    tallies: new Map(
      ((talliesRes.data ?? []) as { change_id: string; approve_count: number; decline_count: number }[]).map((t) => [
        t.change_id,
        { approve: Number(t.approve_count), decline: Number(t.decline_count) },
      ])
    ),
    myVotes: new Map(
      ((votesRes.data ?? []) as { change_id: string; choice: 'approve' | 'decline'; voted_at: string }[]).map((v) => [
        v.change_id,
        { choice: v.choice, voted_at: v.voted_at },
      ])
    ),
    isAtlastAdmin: Boolean(meRes.data?.is_system_admin),
    myRole: roleRes.data?.role ?? null,
  };
}

/** Is a vote on a rule change open and still waiting for my vote? (for Home) */
export async function ruleVoteWaitingOnMe(groupId: string, me: string): Promise<string | null> {
  const { data } = await supabase
    .from('group_rule_changes')
    .select('id, vote_closes_at')
    .eq('group_id', groupId)
    .eq('status', 'voting')
    .maybeSingle();
  if (!data || (data.vote_closes_at && new Date(data.vote_closes_at).getTime() < Date.now())) return null;
  const { data: mine } = await supabase
    .from('group_rule_change_votes')
    .select('change_id')
    .eq('change_id', data.id)
    .eq('member_id', me)
    .maybeSingle();
  return mine ? null : data.id;
}

export async function oversightAction(body: Record<string, unknown>): Promise<{ error: string | null }> {
  const { data, error } = await supabase.functions.invoke('atlast-oversight', { body });
  const message = (data as { error?: string } | null)?.error ?? (await functionErrorMessage(error));
  return { error: message ?? null };
}

export const CHANGE_STATUS_LABEL: Record<ChangeStatus, string> = {
  proposed: 'Waiting for AtLast to open the vote',
  voting: 'Members are voting',
  approved: 'Approved by AtLast — in force',
  rejected: 'Rejected',
  cancelled: 'Withdrawn',
};
export const CHANGE_STATUS_TONE: Record<ChangeStatus, 'neutral' | 'good' | 'warn' | 'bad'> = {
  proposed: 'warn',
  voting: 'warn',
  approved: 'good',
  rejected: 'bad',
  cancelled: 'neutral',
};

/** Is the signed-in person the AtLast admin? */
export async function fetchIsAtlastAdmin(me: string): Promise<boolean> {
  const { data } = await supabase.from('profiles').select('is_system_admin').eq('id', me).maybeSingle();
  return Boolean(data?.is_system_admin);
}

export type ConsoleGroup = {
  id: string;
  name: string;
  currency: string;
  status: string;
  lockedAt: string | null;
  members: number;
  open: { status: ChangeStatus; yes: number; needed: number | null } | null;
};

/** Every group, for the AtLast console (no membership needed). */
export async function loadConsoleGroups(): Promise<ConsoleGroup[]> {
  const [groupsRes, membersRes, changesRes] = await Promise.all([
    supabase.from('groups').select('id, name, currency, status, rules_locked_at').order('created_at'),
    supabase.from('memberships').select('group_id').eq('status', 'active'),
    supabase.from('group_rule_changes').select('id, group_id, status, approvals_needed').in('status', ['proposed', 'voting']),
  ]);
  const changes = changesRes.data ?? [];
  const { data: tallies } = changes.length
    ? await supabase.from('group_rule_change_tallies').select('change_id, approve_count').in('change_id', changes.map((c) => c.id))
    : { data: [] as { change_id: string; approve_count: number }[] };
  const count = new Map<string, number>();
  for (const m of membersRes.data ?? []) count.set(m.group_id, (count.get(m.group_id) ?? 0) + 1);
  return (groupsRes.data ?? []).map((g) => {
    const c = changes.find((x) => x.group_id === g.id);
    return {
      id: g.id,
      name: g.name,
      currency: g.currency,
      status: g.status,
      lockedAt: g.rules_locked_at,
      members: count.get(g.id) ?? 0,
      open: c
        ? {
            status: c.status as ChangeStatus,
            yes: Number((tallies ?? []).find((x) => x.change_id === c.id)?.approve_count ?? 0),
            needed: c.approvals_needed,
          }
        : null,
    };
  });
}

export type AuditRow = { id: string; action: string; created_at: string; actor_id: string | null; reason: string | null };

/** Recent audit entries for a group (the AtLast admin may read every group's log). */
export async function loadGroupAudit(groupId: string, limit = 30): Promise<AuditRow[]> {
  const { data } = await supabase
    .from('audit_events')
    .select('id, action, created_at, actor_id, reason')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as AuditRow[];
}
