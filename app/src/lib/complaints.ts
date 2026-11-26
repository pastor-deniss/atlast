import { supabase } from '@/lib/supabase';

export type ComplaintCategory = 'missing_contribution' | 'wrong_amount' | 'loan' | 'other';
export type ComplaintStatus = 'open' | 'in_review' | 'resolved' | 'rejected';

export type Complaint = {
  id: string;
  group_id: string;
  member_id: string;
  category: ComplaintCategory;
  transaction_id: string | null;
  subject: string;
  details: string;
  status: ComplaintStatus;
  admin_response: string | null;
  responded_by: string | null;
  responded_at: string | null;
  created_at: string;
};

/** English labels; translate with t() for display. */
export const CATEGORY_LABELS: Record<ComplaintCategory, string> = {
  missing_contribution: 'Missing contribution',
  wrong_amount: 'Wrong amount',
  loan: 'Loan problem',
  other: 'Other',
};

export const STATUS_LABELS: Record<ComplaintStatus, string> = {
  open: 'Open',
  in_review: 'Being reviewed',
  resolved: 'Resolved',
  rejected: 'Not upheld',
};

export const STATUS_TONES: Record<ComplaintStatus, 'neutral' | 'good' | 'warn' | 'bad'> = {
  open: 'warn',
  in_review: 'neutral',
  resolved: 'good',
  rejected: 'bad',
};

export const COMPLAINT_COLUMNS =
  'id, group_id, member_id, category, transaction_id, subject, details, status, admin_response, responded_by, responded_at, created_at';

/** Open or in-review complaints in a group that an admin still needs to close. */
export async function countActiveComplaints(groupId: string, excludeMemberId?: string) {
  let query = supabase
    .from('member_complaints')
    .select('id', { count: 'exact', head: true })
    .eq('group_id', groupId)
    .in('status', ['open', 'in_review']);
  if (excludeMemberId) query = query.neq('member_id', excludeMemberId);
  const { count } = await query;
  return count ?? 0;
}
