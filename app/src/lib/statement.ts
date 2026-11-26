import { formatDateTime } from '@/lib/datetime';
import { paymentMethodLabel } from '@/lib/payment-methods';
import { supabase } from '@/lib/supabase';

// Member account statement: every ledger row for one member in one group,
// plus where their savings and loans stood at the end of the period.
//
// Ledger amounts are signed from the group fund's side (+ = into the fund).
// For a member that reads naturally: contributions and repayments are money
// they paid in (+), a loan disbursement is money paid out to them (-), and a
// reversal is the opposite of whatever it reverses. Reversals copy the
// original's loan_id. Savings = net contributions (Jamii money is welfare,
// kept apart), and the amount
// still owed on loans = -(sum of rows that carry a loan_id).

export type StatementPeriod = 'this_year' | 'last_year' | 'all_time';

type TxType =
  | 'contribution'
  | 'loan_disbursement'
  | 'repayment'
  | 'reversal'
  | 'jamii_contribution'
  | 'jamii_payout'
  | 'group_expense';

export type StatementRow = {
  id: string;
  date: string;
  /** English label; translate with t() for display. */
  label: string;
  reference: string | null;
  /** English payment-method label for contributions and repayments, else null. */
  method: string | null;
  amount: number;
};

export type Statement = {
  memberName: string;
  groupName: string;
  currency: string;
  period: StatementPeriod;
  from: Date | null;
  to: Date;
  generatedAt: Date;
  rows: StatementRow[];
  paidInDuringPeriod: number;
  paidOutDuringPeriod: number;
  /** Savings (net contributions) at the end of the period. */
  savings: number;
  shares: number;
  /** Still owed on loans at the end of the period: principal + interest + penalties - repaid. */
  loansOutstanding: number;
};

export function periodRange(period: StatementPeriod, now = new Date()): { from: Date | null; to: Date } {
  const year = now.getFullYear();
  if (period === 'this_year') return { from: new Date(year, 0, 1), to: now };
  if (period === 'last_year') return { from: new Date(year - 1, 0, 1), to: new Date(year, 0, 1) };
  return { from: null, to: now };
}

const LABELS: Record<Exclude<TxType, 'reversal'>, string> = {
  contribution: 'Contribution',
  loan_disbursement: 'Loan received',
  repayment: 'Loan repayment',
  jamii_contribution: 'Jamii contribution',
  jamii_payout: 'Jamii help received',
  group_expense: 'Group expense',
};

const REVERSAL_LABELS: Record<Exclude<TxType, 'reversal'>, string> = {
  contribution: 'Contribution reversed',
  loan_disbursement: 'Loan payout reversed',
  repayment: 'Repayment reversed',
  jamii_contribution: 'Jamii contribution reversed',
  jamii_payout: 'Jamii help reversed',
  group_expense: 'Group expense reversed',
};

export async function loadStatement(
  groupId: string,
  memberId: string,
  period: StatementPeriod
): Promise<Statement> {
  const { from, to } = periodRange(period);

  const [{ data: group }, { data: profile }, { data: txRows, error }] = await Promise.all([
    supabase.from('groups').select('name, currency').eq('id', groupId).single(),
    supabase.from('profiles').select('first_name, last_name').eq('id', memberId).single(),
    // Every row up to the end of the period: earlier rows are needed for the
    // closing balances, and to label reversals by what they reverse.
    supabase
      .from('transactions')
      .select('id, type, amount, shares_earned, loan_id, reference, payment_method, reversed_transaction_id, created_at')
      .eq('group_id', groupId)
      .eq('member_id', memberId)
      .lt('created_at', to.toISOString())
      .order('created_at', { ascending: true }),
  ]);
  if (error) throw error;

  const all = txRows ?? [];
  const typeById = new Map(all.map((r) => [r.id as string, r.type as TxType]));

  let savings = 0;
  let shares = 0;
  let loanSum = 0;
  let paidIn = 0;
  let paidOut = 0;
  const rows: StatementRow[] = [];

  for (const r of all) {
    const amount = Number(r.amount);
    // What the row counts as: its own type, or for a reversal, the type it reverses.
    const effective = r.type === 'reversal' ? (typeById.get(r.reversed_transaction_id) ?? 'reversal') : r.type;
    // Group expenses are recorded under the admin who paid them; they are the
    // group's money, not this member's, so they stay off personal statements.
    if (effective === 'group_expense') continue;
    if (r.loan_id) loanSum += amount;
    else if (effective === 'contribution') savings += amount;
    shares += Number(r.shares_earned ?? 0);

    const created = new Date(r.created_at);
    if (from && created < from) continue;

    if (amount >= 0) paidIn += amount;
    else paidOut += -amount;

    let label: string;
    if (r.type === 'reversal') {
      const original = typeById.get(r.reversed_transaction_id);
      label = original && original !== 'reversal' ? REVERSAL_LABELS[original] : 'Reversal';
    } else {
      label = LABELS[r.type as Exclude<TxType, 'reversal'>] ?? r.type;
    }
    const method =
      r.type === 'contribution' || r.type === 'repayment' || r.type === 'jamii_contribution'
        ? paymentMethodLabel(r.payment_method)
        : null;
    rows.push({ id: r.id, date: r.created_at, label, reference: r.reference, method, amount });
  }

  // Interest and late penalties are owed on top of what was paid out, so the
  // database works the amount out (same rules as repayments), as at `to`.
  const { data: owed, error: owedError } = await supabase.rpc('member_loans_outstanding_as_of', {
    p_group_id: groupId,
    p_member_id: memberId,
    p_as_of: to.toISOString(),
  });
  const loansOutstanding = owedError ? Math.max(0, -loanSum) : Number(owed ?? 0);

  return {
    memberName: profile ? `${profile.first_name} ${profile.last_name}`.trim() : '',
    groupName: group?.name ?? '',
    currency: group?.currency ?? '',
    period,
    from,
    to,
    generatedAt: new Date(),
    rows: rows.reverse(), // newest first
    paidInDuringPeriod: paidIn,
    paidOutDuringPeriod: paidOut,
    savings,
    shares,
    loansOutstanding,
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(value: Date | string) {
  return new Date(value).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

type Translate = (text: string, vars?: Record<string, string | number>) => string;

/**
 * The statement as styled HTML. Every rule is scoped under `.atlast-statement`
 * so the same markup can be printed from inside the web app without touching
 * the app's own styles.
 */
export function statementHtml(s: Statement, t: Translate): { css: string; body: string } {
  const money = (n: number) => `${escapeHtml(s.currency)} ${Math.round(n).toLocaleString()}`;
  const periodText =
    s.from === null
      ? t('All time, up to {date}', { date: formatDate(s.to) })
      : `${formatDate(s.from)} – ${formatDate(new Date(s.to.getTime() - 1))}`;

  const rows =
    s.rows.length === 0
      ? `<tr><td colspan="5" class="empty">${escapeHtml(t('No transactions in this period.'))}</td></tr>`
      : s.rows
          .map(
            (r) => `<tr>
  <td>${escapeHtml(formatDateTime(r.date))}</td>
  <td>${escapeHtml(t(r.label))}${r.method ? `<div class="sub">${escapeHtml(t(r.method))}</div>` : ''}</td>
  <td class="ref">${escapeHtml(r.reference ?? '—')}</td>
  <td class="num">${r.amount >= 0 ? money(r.amount) : ''}</td>
  <td class="num">${r.amount < 0 ? money(-r.amount) : ''}</td>
</tr>`
          )
          .join('');

  const css = `
.atlast-statement { font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #13201B; font-size: 12px; line-height: 1.45; }
.atlast-statement * { box-sizing: border-box; }
.atlast-statement .band { background: #0F3D2E; color: #F6F3EC; padding: 20px 24px; border-radius: 10px; }
.atlast-statement .brand { font-size: 20px; font-weight: 700; letter-spacing: 0.5px; }
.atlast-statement .brand span { color: #F2B33D; }
.atlast-statement h1 { font-size: 18px; margin: 10px 0 2px; }
.atlast-statement .muted { color: #5B635F; }
.atlast-statement .band .muted { color: rgba(246,243,236,0.8); }
.atlast-statement .meta { display: flex; justify-content: space-between; gap: 16px; margin: 16px 0; }
.atlast-statement .meta div { flex: 1; }
.atlast-statement .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.6px; color: #5B635F; }
.atlast-statement .value { font-size: 13px; font-weight: 600; }
.atlast-statement .cards { display: flex; gap: 10px; margin-bottom: 18px; }
.atlast-statement .card { flex: 1; border: 1px solid #E7E1D3; border-radius: 8px; padding: 10px 12px; background: #FBF9F4; }
.atlast-statement .card .value { font-size: 15px; color: #0F3D2E; }
.atlast-statement table { width: 100%; border-collapse: collapse; }
.atlast-statement th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.6px; color: #5B635F; border-bottom: 2px solid #0F3D2E; padding: 6px 6px; }
.atlast-statement td { border-bottom: 1px solid #E7E1D3; padding: 7px 6px; vertical-align: top; }
.atlast-statement tr { page-break-inside: avoid; }
.atlast-statement .num { text-align: right; white-space: nowrap; }
.atlast-statement th.num { text-align: right; }
.atlast-statement .ref { color: #5B635F; word-break: break-all; }
.atlast-statement .sub { color: #5B635F; font-size: 10px; }
.atlast-statement .empty { text-align: center; color: #5B635F; padding: 18px; }
.atlast-statement tfoot td { font-weight: 700; border-top: 2px solid #0F3D2E; border-bottom: none; }
.atlast-statement .foot { margin-top: 18px; font-size: 10px; color: #5B635F; }
`;

  const body = `<div class="atlast-statement">
  <div class="band">
    <div class="brand">atlast<span>.</span></div>
    <h1>${escapeHtml(t('Account Statement'))}</h1>
    <div class="muted">${escapeHtml(s.groupName)}</div>
  </div>
  <div class="meta">
    <div><div class="label">${escapeHtml(t('Member'))}</div><div class="value">${escapeHtml(s.memberName)}</div></div>
    <div><div class="label">${escapeHtml(t('Period'))}</div><div class="value">${escapeHtml(periodText)}</div></div>
    <div><div class="label">${escapeHtml(t('Generated'))}</div><div class="value">${escapeHtml(formatDateTime(s.generatedAt))}</div></div>
  </div>
  <div class="cards">
    <div class="card"><div class="label">${escapeHtml(t('Total Savings'))}</div><div class="value">${money(s.savings)}</div></div>
    <div class="card"><div class="label">${escapeHtml(t('Shares'))}</div><div class="value">${s.shares.toLocaleString()}</div></div>
    <div class="card"><div class="label">${escapeHtml(t('Loans Outstanding'))}</div><div class="value">${money(s.loansOutstanding)}</div></div>
    <div class="card"><div class="label">${escapeHtml(t('Balance (Savings − Loans)'))}</div><div class="value">${money(s.savings - s.loansOutstanding)}</div></div>
  </div>
  <table>
    <thead><tr>
      <th>${escapeHtml(t('Date'))}</th>
      <th>${escapeHtml(t('Description'))}</th>
      <th>${escapeHtml(t('Reference'))}</th>
      <th class="num">${escapeHtml(t('Paid in'))}</th>
      <th class="num">${escapeHtml(t('Paid out'))}</th>
    </tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr>
      <td colspan="3">${escapeHtml(t('Totals for this period'))}</td>
      <td class="num">${money(s.paidInDuringPeriod)}</td>
      <td class="num">${money(s.paidOutDuringPeriod)}</td>
    </tr></tfoot>
  </table>
  <div class="foot">
    ${escapeHtml(t('Paid in: contributions and loan repayments you made. Paid out: loans paid to you, and reversed entries. Balances are as at the end of the period. Loans outstanding include any interest and late penalties under your group\'s loan rates.'))}
  </div>
</div>`;

  return { css, body };
}

export function statementFileName(s: Statement) {
  const name = s.memberName.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'member';
  return `Atlast-statement-${name}-${s.period.replace('_', '-')}`;
}
