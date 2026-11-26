import {
  periodBounds,
  periodLabel,
  shiftPeriod,
  shortPeriodLabel,
  type ReportPeriodType,
} from '@/lib/report-periods';
import { supabase } from '@/lib/supabase';

// Group report data, computed live from the ledger (no stored reports).
// Every money figure uses the same rule as the balance views: a reversal
// counts under the type of the entry it reverses, so a reversed contribution
// no longer counts as a contribution.

type Tx = {
  id: string;
  type: string;
  amount: number;
  member_id: string;
  created_at: string;
  reversed_transaction_id: string | null;
};

export type HealthPart = { key: 'loans' | 'backing' | 'regularity'; label: string; value: number; detail: string };

export type GroupOverview = {
  health: { score: number; parts: HealthPart[] };
  savings: number;
  cash: number;
  members: number;
  allLoans: number;
  activeLoans: number;
  activeLoansOwed: number;
  repaidShare: number; // 0..100: repaid so far / total due, over every loan paid out
};

export type PeriodTotals = { key: string; label: string; contributions: number; disbursed: number; repayments: number };

export type PeriodReport = PeriodTotals & {
  title: string;
  newMembers: number;
  loansApproved: number;
  loansDeclined: number;
  motionsApproved: number;
  motionsDeclined: number;
};

const PERIOD_DAYS: Record<string, number> = { daily: 1, weekly: 7, biweekly: 14, monthly: 30 };

/** Score bands, shared by the screen and the PDF. English labels are translation keys. */
export function healthBand(score: number): { label: string; tone: 'good' | 'warn' | 'bad' } {
  if (score >= 75) return { label: 'Good', tone: 'good' };
  if (score >= 50) return { label: 'Fair', tone: 'warn' };
  return { label: 'Needs attention', tone: 'bad' };
}

async function groupTransactions(groupId: string): Promise<Tx[]> {
  const { data } = await supabase
    .from('transactions')
    .select('id, type, amount, member_id, created_at, reversed_transaction_id')
    .eq('group_id', groupId)
    .order('created_at', { ascending: true });
  return ((data ?? []) as Tx[]).map((r) => ({ ...r, amount: Number(r.amount) }));
}

/** The type a row counts as: its own, or for a reversal, the type it reverses. */
function effectiveTypes(rows: Tx[]) {
  const byId = new Map(rows.map((r) => [r.id, r.type]));
  return (r: Tx) => (r.type === 'reversal' ? (byId.get(r.reversed_transaction_id ?? '') ?? 'reversal') : r.type);
}

function sumByType(rows: Tx[], typeOf: (r: Tx) => string, from: Date, to: Date) {
  const totals = { contributions: 0, disbursed: 0, repayments: 0 };
  for (const r of rows) {
    const at = new Date(r.created_at);
    if (at < from || at >= to) continue;
    const type = typeOf(r);
    if (type === 'contribution') totals.contributions += r.amount;
    else if (type === 'loan_disbursement') totals.disbursed += -r.amount;
    else if (type === 'repayment') totals.repayments += r.amount;
  }
  return totals;
}

export async function loadGroupOverview(groupId: string, contributionFrequency: string): Promise<GroupOverview> {
  const [rows, { data: memberRows }, { data: dues }] = await Promise.all([
    groupTransactions(groupId),
    supabase.from('memberships').select('user_id').eq('group_id', groupId).eq('status', 'active'),
    supabase
      .from('loan_dues')
      .select('status, total_due, repaid, outstanding, is_overdue')
      .eq('group_id', groupId)
      .in('status', ['disbursed', 'repaying', 'repaid', 'defaulted']),
  ]);
  const typeOf = effectiveTypes(rows);

  let savings = 0;
  let cash = 0;
  for (const r of rows) {
    const type = typeOf(r);
    // The Jamii pot is welfare money kept apart from the main fund.
    if (type === 'jamii_contribution' || type === 'jamii_payout') continue;
    cash += r.amount;
    if (type === 'contribution') savings += r.amount;
  }

  const loans = (dues ?? []).map((d) => ({
    status: d.status as string,
    totalDue: Number(d.total_due),
    repaid: Number(d.repaid),
    outstanding: Number(d.outstanding),
    overdue: !!d.is_overdue,
  }));
  const active = loans.filter((l) => l.status === 'disbursed' || l.status === 'repaying');
  const good = loans.filter((l) => l.status !== 'defaulted' && !l.overdue);
  const goodOwed = active.filter((l) => !l.overdue).reduce((s, l) => s + l.outstanding, 0);
  const totalDue = loans.reduce((s, l) => s + l.totalDue, 0);
  const totalRepaid = loans.reduce((s, l) => s + l.repaid, 0);

  // 1. Loans in good standing: paid-out loans that are neither defaulted nor overdue.
  const loansPart = loans.length === 0 ? 100 : (good.length / loans.length) * 100;
  // 2. Savings backed: is every shilling saved either in the fund or in a loan
  //    that is being repaid on time? Money lent out is fine; money in late or
  //    defaulted loans is what lowers this.
  const backingPart = savings <= 0 ? 100 : Math.min(100, ((Math.max(0, cash) + goodOwed) / savings) * 100);
  // 3. Contribution regularity: active members who contributed in the last
  //    contribution period (e.g. the last 30 days for a monthly group).
  const members = (memberRows ?? []).map((m) => m.user_id as string);
  const windowStart = Date.now() - (PERIOD_DAYS[contributionFrequency.toLowerCase()] ?? 30) * 86_400_000;
  const recent = new Set(
    rows
      .filter((r) => r.type === 'contribution' && new Date(r.created_at).getTime() >= windowStart)
      .map((r) => r.member_id)
  );
  const regularityPart = members.length === 0 ? 100 : (members.filter((m) => recent.has(m)).length / members.length) * 100;

  const parts: HealthPart[] = [
    {
      key: 'loans',
      label: 'Loans in good standing',
      value: Math.round(loansPart),
      detail: `${good.length}/${loans.length}`,
    },
    { key: 'backing', label: 'Savings backed', value: Math.round(backingPart), detail: '' },
    {
      key: 'regularity',
      label: 'Members contributing on time',
      value: Math.round(regularityPart),
      detail: `${members.filter((m) => recent.has(m)).length}/${members.length}`,
    },
  ];

  return {
    health: { score: Math.round(parts.reduce((s, p) => s + p.value, 0) / parts.length), parts },
    savings,
    cash,
    members: members.length,
    allLoans: loans.length,
    activeLoans: active.length,
    activeLoansOwed: active.reduce((s, l) => s + l.outstanding, 0),
    repaidShare: totalDue > 0 ? Math.round((totalRepaid / totalDue) * 100) : 0,
  };
}

/** One period's report plus the trend over the `count` periods ending with it. */
export async function loadPeriodReport(
  groupId: string,
  type: ReportPeriodType,
  reference: Date,
  count = 6
): Promise<{ report: PeriodReport; trend: PeriodTotals[] }> {
  const { start, end } = periodBounds(type, reference);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const [rows, { data: memberRows }, { data: loanRows }, { data: motionRows }] = await Promise.all([
    groupTransactions(groupId),
    supabase
      .from('memberships')
      .select('id')
      .eq('group_id', groupId)
      .eq('status', 'active')
      .gte('decided_at', startIso)
      .lt('decided_at', endIso),
    supabase.from('loans').select('status').eq('group_id', groupId).gte('decided_at', startIso).lt('decided_at', endIso),
    supabase.from('motions').select('status').eq('group_id', groupId).gte('decided_at', startIso).lt('decided_at', endIso),
  ]);
  const typeOf = effectiveTypes(rows);

  const trend: PeriodTotals[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const ref = shiftPeriod(type, reference, -i);
    const bounds = periodBounds(type, ref);
    trend.push({
      key: bounds.start.toISOString(),
      label: shortPeriodLabel(type, ref),
      ...sumByType(rows, typeOf, bounds.start, bounds.end),
    });
  }

  const current = trend[trend.length - 1];
  return {
    report: {
      ...current,
      title: periodLabel(type, reference),
      newMembers: (memberRows ?? []).length,
      loansApproved: (loanRows ?? []).filter((l) => l.status !== 'declined').length,
      loansDeclined: (loanRows ?? []).filter((l) => l.status === 'declined').length,
      motionsApproved: (motionRows ?? []).filter((m) => m.status === 'approved').length,
      motionsDeclined: (motionRows ?? []).filter((m) => m.status === 'declined').length,
    },
    trend,
  };
}
