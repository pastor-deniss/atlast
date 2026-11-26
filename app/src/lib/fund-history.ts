import { supabase } from '@/lib/supabase';

// The group's money over time for the Financial Dashboard chart, worked out
// from the ledger with the same rules as `group_balances`: a reversal counts
// under the type of the entry it reverses, and Jamii never counts towards
// the group fund.

export type FundRange = '30d' | '6m' | '12m';

export type FundPoint = {
  at: Date;
  label: string;
  fund: number; // group fund balance at that moment
  contributions: number; // savings paid in, all time
  loansOut: number; // loans paid out, all time
};

const JAMII = ['jamii_contribution', 'jamii_payout'];
const DAY = 86_400_000;

type Row = { id: string; type: string; amount: number; created_at: string; reversed_transaction_id: string | null };

/** End-of-bucket moments for a range, oldest first, the last one being now. */
function bucketEnds(range: FundRange, now: Date) {
  const ends: Date[] = [];
  if (range === '30d') {
    for (let i = 29; i >= 0; i--) ends.push(new Date(now.getTime() - i * DAY));
  } else if (range === '6m') {
    for (let i = 25; i >= 0; i--) ends.push(new Date(now.getTime() - i * 7 * DAY));
  } else {
    for (let i = 11; i >= 1; i--) ends.push(new Date(now.getFullYear(), now.getMonth() - i + 1, 1)); // start of next month
    ends.push(now);
  }
  return ends;
}

function labelFor(range: FundRange, end: Date, isLast: boolean) {
  if (range === '12m') {
    const month = isLast ? end : new Date(end.getTime() - DAY);
    return month.toLocaleDateString(undefined, { month: 'short' });
  }
  return end.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export async function loadFundHistory(groupId: string, range: FundRange): Promise<FundPoint[]> {
  const rows: Row[] = [];
  // Page through the whole ledger (oldest first): balances need every entry.
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase
      .from('transactions')
      .select('id, type, amount, created_at, reversed_transaction_id')
      .eq('group_id', groupId)
      .order('created_at', { ascending: true })
      .range(from, from + 999);
    rows.push(...((data ?? []) as Row[]));
    if (!data || data.length < 1000) break;
  }
  const typeById = new Map(rows.map((r) => [r.id, r.type]));
  const entries = rows.map((r) => ({
    at: new Date(r.created_at).getTime(),
    amount: Number(r.amount),
    type: r.type === 'reversal' ? (typeById.get(r.reversed_transaction_id ?? '') ?? 'reversal') : r.type,
  }));

  const now = new Date();
  const ends = bucketEnds(range, now);
  const points: FundPoint[] = [];
  let i = 0;
  let fund = 0;
  let contributions = 0;
  let loansOut = 0;
  ends.forEach((end, k) => {
    while (i < entries.length && entries[i].at <= end.getTime()) {
      const e = entries[i++];
      if (!JAMII.includes(e.type)) fund += e.amount;
      if (e.type === 'contribution') contributions += e.amount;
      if (e.type === 'loan_disbursement') loansOut -= e.amount; // stored negative
    }
    points.push({ at: end, label: labelFor(range, end, k === ends.length - 1), fund, contributions, loansOut });
  });
  return points;
}
