import { fetchNames } from '@/lib/spending';
import { supabase } from '@/lib/supabase';

// Everything in a group that is waiting on a decision -- membership votes,
// loan reviews (Three-Eye Panel), Jamii payouts and miscellaneous charges --
// in one shape, for the Kura tab.
//
// Privacy rules (CONTEXT.md) decide what each person sees:
//  * Loan reviewers: names only for the Group Admin; a reviewer sees
//    themselves as "you" and the others as "Reviewer 2/3"; the borrower and
//    other members see "Reviewer 1/2/3" with each decision.
//  * Membership votes are secret ballots: only counts, never names.
//  * Jamii / charge approvers are visible to every member (group money).

export type DecisionKind = 'membership' | 'loan' | 'jamii' | 'expense';
export type Verdict = 'approve' | 'decline' | 'pending';

/** One approver tile. `name` null = anonymous ("Reviewer n"). */
export type ApproverTile = { key: string; name: string | null; isMe: boolean; verdict: Verdict };

export type DecisionItem = {
  id: string;
  kind: DecisionKind;
  title: string; // the applicant / borrower / beneficiary, or the charge type
  description: string; // purpose, reason
  amount: number | null;
  status: 'open' | 'approved' | 'declined';
  createdAt: string;
  /** Loans, Jamii, charges: 3 tiles. Membership: null (counts instead). */
  approvers: ApproverTile[] | null;
  counts: { approve: number; decline: number; pending: number } | null;
  /** How many approvals are needed to pass (loans 2 of 3, spending 3 of 3). */
  needed: number | null;
  myRole: 'decider' | 'applicant' | 'viewer';
  myVerdict: Verdict | null; // when myRole is decider
  closesAt: string | null; // membership votes
};

const RECENT_DAYS = 30;

function verdictOf(decision: string | null | undefined): Verdict {
  return decision === 'approve' ? 'approve' : decision === 'decline' ? 'decline' : 'pending';
}

export async function loadDecisions(
  groupId: string,
  me: string,
  isAdmin: boolean
): Promise<{ open: DecisionItem[]; recent: DecisionItem[] }> {
  const since = new Date(Date.now() - RECENT_DAYS * 86_400_000).toISOString();

  const [motionsRes, loansRes, spendRes, membersRes] = await Promise.all([
    supabase
      .from('motions')
      .select('id, status, closes_at, created_at, decided_at, subject_membership_id')
      .eq('group_id', groupId)
      .or(`status.eq.open,decided_at.gte.${since}`)
      .order('created_at', { ascending: false }),
    supabase
      .from('loans')
      .select('id, borrower_id, principal, purpose, status, review_mode, created_at, decided_at')
      .eq('group_id', groupId)
      .or(`status.eq.pending_review,decided_at.gte.${since}`)
      .order('created_at', { ascending: false }),
    supabase
      .from('group_spend_requests')
      .select('id, kind, beneficiary_id, amount, reason, category, status, approval_mode, created_by, created_at, decided_at')
      .eq('group_id', groupId)
      .or(`status.eq.pending,decided_at.gte.${since}`)
      .order('created_at', { ascending: false }),
    supabase.from('memberships').select('user_id', { count: 'exact', head: true }).eq('group_id', groupId).eq('status', 'active'),
  ]);

  const motions = motionsRes.data ?? [];
  // Loans decided by the admin alone have no panel; only show those still waiting.
  const loans = (loansRes.data ?? []).filter((l) => l.review_mode === 'three_eye' || l.status === 'pending_review');
  const spends = (spendRes.data ?? []).filter((s) => s.status !== 'cancelled');
  const activeMembers = membersRes.count ?? 0;

  // Membership: applicant names, secret-ballot tallies, my own vote.
  const motionIds = motions.map((m) => m.id);
  const membershipIds = motions.map((m) => m.subject_membership_id);
  const [subjectsRes, talliesRes, myVotesRes] = await Promise.all([
    membershipIds.length
      ? supabase.from('memberships').select('id, user_id, application_note').in('id', membershipIds)
      : Promise.resolve({ data: [] as { id: string; user_id: string; application_note: string | null }[] }),
    motionIds.length
      ? supabase.from('motion_tallies').select('motion_id, approve_count, decline_count').in('motion_id', motionIds)
      : Promise.resolve({ data: [] as { motion_id: string; approve_count: number; decline_count: number }[] }),
    motionIds.length
      ? supabase.from('votes').select('motion_id, choice').eq('voter_id', me).in('motion_id', motionIds)
      : Promise.resolve({ data: [] as { motion_id: string; choice: string }[] }),
  ]);

  // Loans: anonymous decision lists for everyone; reviewer rows (names) only
  // come back for the admin and for the reviewer's own row.
  const loanIds = loans.map((l) => l.id);
  const [progressRes, reviewersRes, spendApproversRes] = await Promise.all([
    loanIds.length
      ? supabase.from('loan_review_progress').select('loan_id, reviewer_decisions').in('loan_id', loanIds)
      : Promise.resolve({ data: [] as { loan_id: string; reviewer_decisions: string[] }[] }),
    loanIds.length
      ? supabase.from('loan_reviewers').select('loan_id, reviewer_id, decision, assigned_at').in('loan_id', loanIds).order('assigned_at')
      : Promise.resolve({ data: [] as { loan_id: string; reviewer_id: string; decision: string; assigned_at: string }[] }),
    spends.length
      ? supabase.from('group_spend_approvers').select('request_id, approver_id, decision').in('request_id', spends.map((s) => s.id))
      : Promise.resolve({ data: [] as { request_id: string; approver_id: string; decision: string }[] }),
  ]);

  const subjects = new Map((subjectsRes.data ?? []).map((m) => [m.id, m]));
  const names = await fetchNames([
    ...(subjectsRes.data ?? []).map((m) => m.user_id),
    ...loans.map((l) => l.borrower_id),
    ...(isAdmin ? (reviewersRes.data ?? []).map((r) => r.reviewer_id) : []),
    ...spends.map((s) => s.beneficiary_id ?? ''),
    ...(spendApproversRes.data ?? []).map((a) => a.approver_id),
  ]);
  const nameOf = (id: string | null | undefined) => (id ? names.get(id) || '' : '');

  const items: DecisionItem[] = [];

  for (const m of motions) {
    const subject = subjects.get(m.subject_membership_id);
    const tally = (talliesRes.data ?? []).find((x) => x.motion_id === m.id);
    const approve = Number(tally?.approve_count ?? 0);
    const decline = Number(tally?.decline_count ?? 0);
    const mine = (myVotesRes.data ?? []).find((v) => v.motion_id === m.id);
    items.push({
      id: m.id,
      kind: 'membership',
      title: nameOf(subject?.user_id),
      description: subject?.application_note ?? '',
      amount: null,
      status: m.status === 'open' ? 'open' : m.status === 'approved' ? 'approved' : 'declined',
      createdAt: m.created_at,
      approvers: null,
      counts: { approve, decline, pending: m.status === 'open' ? Math.max(0, activeMembers - approve - decline) : 0 },
      needed: null,
      myRole: 'decider',
      myVerdict: mine ? verdictOf(mine.choice) : 'pending',
      closesAt: m.closes_at,
    });
  }

  for (const l of loans) {
    const decisions = ((progressRes.data ?? []).find((p) => p.loan_id === l.id)?.reviewer_decisions ?? []) as string[];
    const rows = (reviewersRes.data ?? []).filter((r) => r.loan_id === l.id);
    const myRow = rows.find((r) => r.reviewer_id === me);
    let tiles: ApproverTile[];
    if (isAdmin && rows.length === decisions.length) {
      tiles = rows.map((r) => ({ key: r.reviewer_id, name: nameOf(r.reviewer_id), isMe: r.reviewer_id === me, verdict: verdictOf(r.decision) }));
    } else {
      // Anonymous; if I am a reviewer, I come first as "you".
      const rest = [...decisions];
      tiles = [];
      if (myRow) {
        rest.splice(rest.indexOf(myRow.decision), 1);
        tiles.push({ key: 'me', name: null, isMe: true, verdict: verdictOf(myRow.decision) });
      }
      rest.forEach((d, i) => tiles.push({ key: `r${i}`, name: null, isMe: false, verdict: verdictOf(d) }));
    }
    const isBorrower = l.borrower_id === me;
    items.push({
      id: l.id,
      kind: 'loan',
      title: nameOf(l.borrower_id),
      description: l.purpose ?? '',
      amount: Number(l.principal),
      status: l.status === 'pending_review' ? 'open' : l.status === 'declined' ? 'declined' : 'approved',
      createdAt: l.created_at,
      approvers: l.review_mode === 'three_eye' ? tiles : null,
      counts: null,
      needed: l.review_mode === 'three_eye' ? 2 : null,
      myRole: myRow ? 'decider' : isBorrower ? 'applicant' : 'viewer',
      myVerdict: myRow ? verdictOf(myRow.decision) : null,
      closesAt: null,
    });
  }

  for (const s of spends) {
    const rows = (spendApproversRes.data ?? []).filter((a) => a.request_id === s.id);
    const mine = rows.find((a) => a.approver_id === me);
    items.push({
      id: s.id,
      kind: s.kind === 'jamii' ? 'jamii' : 'expense',
      title: s.kind === 'jamii' ? nameOf(s.beneficiary_id) : (s.category ?? ''),
      description: s.reason,
      amount: Number(s.amount),
      status: s.status === 'pending' ? 'open' : s.status === 'declined' ? 'declined' : 'approved',
      createdAt: s.created_at,
      approvers: rows.length
        ? rows.map((a) => ({ key: a.approver_id, name: nameOf(a.approver_id), isMe: a.approver_id === me, verdict: verdictOf(a.decision) }))
        : null,
      counts: null,
      needed: rows.length ? rows.length : null,
      myRole: mine ? 'decider' : s.beneficiary_id === me ? 'applicant' : 'viewer',
      myVerdict: mine ? verdictOf(mine.decision) : null,
      closesAt: null,
    });
  }

  // Waiting on me first, then newest.
  const waitingOnMe = (i: DecisionItem) => i.status === 'open' && i.myRole === 'decider' && i.myVerdict === 'pending';
  const open = items
    .filter((i) => i.status === 'open')
    .sort((a, b) => Number(waitingOnMe(b)) - Number(waitingOnMe(a)) || b.createdAt.localeCompare(a.createdAt));
  const recent = items.filter((i) => i.status !== 'open').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { open, recent };
}

export function isWaitingOnMe(i: DecisionItem) {
  return i.status === 'open' && i.myRole === 'decider' && i.myVerdict === 'pending';
}
