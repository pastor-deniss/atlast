import { supabase } from '@/lib/supabase';

// Loan cost rules (.scratch/atlast-mvp-spec/loan-interest-penalties.sql):
// a flat interest % of the amount borrowed, charged once, plus a % per full
// week late on what is still owed. A loan keeps the rates of the moment it
// was requested; the database works out what is owed (loan_dues view).

export type LoanRates = { interestRate: number; penaltyWeeklyRate: number };

export type LoanDue = {
  loan_id: string;
  principal: number;
  interest_rate: number;
  interest_amount: number;
  penalty_weekly_rate: number;
  due_at: string | null;
  penalty: number;
  repaid: number;
  total_due: number;
  outstanding: number;
  is_overdue: boolean;
};

/** Read fresh, not from the membership context, so a change shows at once. */
export async function fetchLoanRates(groupId: string): Promise<LoanRates> {
  const { data } = await supabase
    .from('groups')
    .select('loan_interest_rate, late_penalty_weekly_rate')
    .eq('id', groupId)
    .maybeSingle();
  return {
    interestRate: Number(data?.loan_interest_rate ?? 0),
    penaltyWeeklyRate: Number(data?.late_penalty_weekly_rate ?? 0),
  };
}

export async function fetchLoanDue(loanId: string): Promise<LoanDue | null> {
  const { data } = await supabase
    .from('loan_dues')
    .select(
      'loan_id, principal, interest_rate, interest_amount, penalty_weekly_rate, due_at, penalty, repaid, total_due, outstanding, is_overdue'
    )
    .eq('loan_id', loanId)
    .maybeSingle();
  if (!data) return null;
  return {
    ...data,
    principal: Number(data.principal),
    interest_rate: Number(data.interest_rate),
    interest_amount: Number(data.interest_amount),
    penalty_weekly_rate: Number(data.penalty_weekly_rate),
    penalty: Number(data.penalty),
    repaid: Number(data.repaid),
    total_due: Number(data.total_due),
    outstanding: Number(data.outstanding),
  } as LoanDue;
}

/** The same rounding as the database trigger. */
export function interestFor(principal: number, interestRate: number) {
  return Math.round((principal * interestRate) / 100);
}

export function formatRate(rate: number) {
  return `${Number(rate.toFixed(2))}%`;
}

type ScheduleLoan = { disbursed_at: string | null; installment_amount: number | null; term_weeks: number };

const WEEK_MS = 7 * 86_400_000;

function installmentOf(loan: ScheduleLoan, due: LoanDue) {
  return loan.installment_amount ?? Math.round((due.principal + due.interest_amount) / loan.term_weeks);
}

/**
 * Default rate on this loan, 0-100: the share of what the weekly schedule
 * expects to have been paid by now (plus any penalty) that is still unpaid.
 * 0% while nothing is due yet.
 */
export function defaultRate(loan: ScheduleLoan, due: LoanDue) {
  if (!loan.disbursed_at) return 0;
  const weeks = Math.min(loan.term_weeks, Math.floor((Date.now() - new Date(loan.disbursed_at).getTime()) / WEEK_MS));
  const expected = Math.min(due.principal + due.interest_amount, weeks * installmentOf(loan, due)) + due.penalty;
  if (expected <= 0) return 0;
  return Math.round((Math.max(0, expected - due.repaid) / expected) * 100);
}

/**
 * Where a loan stands, for the progress ring: overdue past its due date, or
 * by default rate (below 30% on track, 30-60% falling behind, above 60%
 * badly behind -- the same bands as the default-rate figure).
 */
export function loanStanding(rate: number, overdue: boolean): 'good' | 'warn' | 'bad' {
  if (overdue || rate > 60) return 'bad';
  if (rate >= 30) return 'warn';
  return 'good';
}

/** The date of the next weekly installment not yet covered by repayments. */
export function nextRepaymentDate(loan: ScheduleLoan, due: LoanDue) {
  const start = new Date(loan.disbursed_at ?? Date.now()).getTime();
  const installment = installmentOf(loan, due);
  const weeksCovered = installment > 0 ? Math.floor(due.repaid / installment) : 0;
  return new Date(start + Math.min(loan.term_weeks, weeksCovered + 1) * WEEK_MS);
}
