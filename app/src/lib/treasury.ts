import { functionErrorMessage } from '@/lib/function-error';
import { supabase } from '@/lib/supabase';

// The Treasurer role and the year-end profit share-out
// (.scratch/atlast-mvp-spec/treasurer-and-shareout.sql). Profit = loan
// interest + late penalties collected in the year − miscellaneous charges
// that year (Jamii never counts), split by shares held at year end, paid out
// in cash. The Treasurer prepares, the Group Admin approves, then each
// member's payout is recorded.

export type Role = 'member' | 'group_admin' | 'treasurer';
export type ShareoutStatus = 'proposed' | 'approved' | 'rejected' | 'completed';

export const ROLE_LABEL: Record<Role, string> = {
  member: 'Member',
  group_admin: 'Group Admin',
  treasurer: 'Treasurer',
};

/** The Treasurer and Group Admin both handle the money side. */
export function isMoneyOfficer(role: string | null | undefined) {
  return role === 'group_admin' || role === 'treasurer';
}

export type ShareLine = { member_id: string; name: string; shares: number; amount: number; paid_at?: string | null };

export type ShareoutPreview = {
  year: number;
  cutoff_at: string;
  interest_income: number;
  charges: number;
  profit: number;
  available: number;
  lines: ShareLine[];
};

export type Shareout = {
  id: string;
  year: number;
  cutoff_at: string;
  interest_income: number;
  charges: number;
  profit: number;
  total_shares: number;
  distributed: number;
  status: ShareoutStatus;
  prepared_by: string;
  prepared_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  completed_at: string | null;
};

const NUM = ['interest_income', 'charges', 'profit', 'distributed', 'total_shares', 'available'] as const;
function nums<T extends Record<string, unknown>>(r: T): T {
  const out: Record<string, unknown> = { ...r };
  for (const k of NUM) if (k in out) out[k] = Number(out[k] ?? 0);
  return out as T;
}

export function currentYear() {
  return new Date().getFullYear();
}

export async function previewShareout(groupId: string, year: number): Promise<ShareoutPreview | null> {
  const { data, error } = await supabase.rpc('preview_profit_shareout', { p_group_id: groupId, p_year: year });
  if (error || !data) return null;
  const p = nums(data as ShareoutPreview);
  return { ...p, lines: (p.lines ?? []).map((l) => ({ ...l, shares: Number(l.shares), amount: Number(l.amount) })) };
}

/** The latest share-out for a year that was not rejected, with its lines. */
export async function fetchShareout(groupId: string, year: number) {
  const { data } = await supabase
    .from('profit_shareouts')
    .select('*')
    .eq('group_id', groupId)
    .eq('year', year)
    .order('prepared_at', { ascending: false });
  const rows = (data ?? []).map((r) => nums(r as Shareout));
  const live = rows.find((r) => r.status !== 'rejected') ?? null;
  const lastRejected = rows.find((r) => r.status === 'rejected') ?? null;
  if (!live) return { shareout: null, lastRejected, lines: [] as ShareLine[] };
  const { data: lineRows } = await supabase
    .from('profit_shareout_lines')
    .select('member_id, shares, amount, paid_at')
    .eq('shareout_id', live.id);
  const lines = (lineRows ?? []).map((l) => ({
    member_id: l.member_id as string,
    name: '',
    shares: Number(l.shares),
    amount: Number(l.amount),
    paid_at: (l.paid_at as string | null) ?? null,
  }));
  return { shareout: live, lastRejected, lines };
}

/** Calls the treasury Edge Function. */
export async function treasuryAction(body: Record<string, unknown>): Promise<{ error: string | null }> {
  const { data, error } = await supabase.functions.invoke('treasury', { body });
  const message = (data as { error?: string } | null)?.error ?? (await functionErrorMessage(error));
  return { error: message ?? null };
}

export const SHAREOUT_STATUS_LABEL: Record<ShareoutStatus, string> = {
  proposed: 'Waiting for Admin approval',
  approved: 'Approved — paying members',
  rejected: 'Rejected',
  completed: 'Paid out',
};
export const SHAREOUT_STATUS_TONE: Record<ShareoutStatus, 'neutral' | 'good' | 'warn' | 'bad'> = {
  proposed: 'warn',
  approved: 'good',
  rejected: 'bad',
  completed: 'good',
};
