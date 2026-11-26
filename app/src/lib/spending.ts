import { functionErrorMessage } from '@/lib/function-error';
import { supabase } from '@/lib/supabase';

// Jamii (welfare) payouts and miscellaneous group expenses
// (.scratch/atlast-mvp-spec/jamii-and-expenses.sql). Both are started by a
// Group Admin, need all 3 approvers to say yes, then the admin records the
// payout. Jamii money sits in its own pot; expenses come from the main fund.

export type SpendKind = 'jamii' | 'expense';
export type SpendStatus = 'pending' | 'approved' | 'declined' | 'paid' | 'cancelled';
export type ApprovalMode = 'random' | 'admin_picked' | 'admin_only';

export type SpendRequest = {
  id: string;
  group_id: string;
  kind: SpendKind;
  beneficiary_id: string | null;
  amount: number;
  reason: string;
  category: string | null;
  status: SpendStatus;
  approval_mode: ApprovalMode;
  created_by: string;
  created_at: string;
  decided_at: string | null;
  paid_at: string | null;
};

export type SpendApprover = {
  approver_id: string;
  decision: 'pending' | 'approve' | 'decline';
  comment: string | null;
  decided_at: string | null;
};

export type ApproverSuggestion = {
  member_id: string;
  full_name: string;
  months_active: number;
  periods_contributed: number;
  default_rate: number;
  has_bad_loan: boolean;
  eligible: boolean;
};

const REQUEST_COLUMNS =
  'id, group_id, kind, beneficiary_id, amount, reason, category, status, approval_mode, created_by, created_at, decided_at, paid_at';

function toRequest(r: Record<string, unknown>): SpendRequest {
  return { ...(r as SpendRequest), amount: Number(r.amount) };
}

export async function fetchSpendRequests(groupId: string, kind: SpendKind): Promise<SpendRequest[]> {
  const { data } = await supabase
    .from('group_spend_requests')
    .select(REQUEST_COLUMNS)
    .eq('group_id', groupId)
    .eq('kind', kind)
    .order('created_at', { ascending: false })
    .limit(100);
  return (data ?? []).map(toRequest);
}

export async function fetchSpendRequest(id: string) {
  const [{ data: request }, { data: approvers }] = await Promise.all([
    supabase.from('group_spend_requests').select(REQUEST_COLUMNS).eq('id', id).maybeSingle(),
    supabase
      .from('group_spend_approvers')
      .select('approver_id, decision, comment, decided_at')
      .eq('request_id', id),
  ]);
  return {
    request: request ? toRequest(request) : null,
    approvers: (approvers ?? []) as SpendApprover[],
  };
}

/** Requests still waiting for this member's decision, oldest first. */
export async function fetchMyPendingApprovals(groupId: string, userId: string): Promise<SpendRequest[]> {
  const { data: mine } = await supabase
    .from('group_spend_approvers')
    .select('request_id')
    .eq('approver_id', userId)
    .eq('decision', 'pending');
  const ids = (mine ?? []).map((r) => r.request_id as string);
  if (ids.length === 0) return [];
  const { data } = await supabase
    .from('group_spend_requests')
    .select(REQUEST_COLUMNS)
    .in('id', ids)
    .eq('group_id', groupId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  return (data ?? []).map(toRequest);
}

export async function fetchFunds(groupId: string) {
  const [{ data: balances }, { data: group }] = await Promise.all([
    supabase.from('group_balances').select('balance, jamii_balance').eq('group_id', groupId).maybeSingle(),
    supabase.from('groups').select('jamii_contribution_amount').eq('id', groupId).maybeSingle(),
  ]);
  return {
    mainFund: Number(balances?.balance ?? 0),
    jamiiPot: Number(balances?.jamii_balance ?? 0),
    jamiiAmount: Number(group?.jamii_contribution_amount ?? 0),
  };
}

/** This member's own Jamii contributions, net of reversals. */
export async function fetchMyJamiiTotal(groupId: string, userId: string) {
  const { data } = await supabase
    .from('transactions')
    .select('id, type, amount, reversed_transaction_id')
    .eq('group_id', groupId)
    .eq('member_id', userId)
    .in('type', ['jamii_contribution', 'reversal']);
  const rows = data ?? [];
  const jamiiIds = new Set(rows.filter((r) => r.type === 'jamii_contribution').map((r) => r.id));
  return rows.reduce(
    (sum, r) =>
      r.type === 'jamii_contribution' || jamiiIds.has(r.reversed_transaction_id ?? '') ? sum + Number(r.amount) : sum,
    0
  );
}

/** Names for a set of members (profiles_public respects group visibility). */
export async function fetchNames(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const { data } = await supabase.from('profiles_public').select('id, first_name, last_name').in('id', unique);
  return new Map((data ?? []).map((p) => [p.id, `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()]));
}

export async function fetchApproverSuggestions(groupId: string, beneficiaryId: string | null) {
  const { data, error } = await supabase.rpc('spend_approver_suggestions', {
    p_group_id: groupId,
    p_beneficiary_id: beneficiaryId,
  });
  if (error) return [];
  return (data ?? []) as ApproverSuggestion[];
}

/** Calls the group-spending Edge Function. */
export async function spendingAction(
  body: Record<string, unknown>
): Promise<{ error: string | null; result: SpendRequest | null }> {
  const { data, error } = await supabase.functions.invoke('group-spending', { body });
  const message = (data as { error?: string } | null)?.error ?? (await functionErrorMessage(error));
  if (message) return { error: message, result: null };
  const result = (data as { result?: Record<string, unknown> } | null)?.result;
  return { error: null, result: result ? toRequest(result) : null };
}

/** English labels (translation keys). */
export const STATUS_LABEL: Record<SpendStatus, string> = {
  pending: 'Awaiting approval',
  approved: 'Approved — to be paid',
  declined: 'Declined',
  paid: 'Paid',
  cancelled: 'Cancelled',
};

export const STATUS_TONE: Record<SpendStatus, 'neutral' | 'good' | 'warn' | 'bad'> = {
  pending: 'warn',
  approved: 'good',
  declined: 'bad',
  paid: 'good',
  cancelled: 'neutral',
};

export const EXPENSE_CATEGORIES = ['Meeting costs', 'Bank & mobile money fees', 'Stationery & printing', 'Transport', 'Other'];
