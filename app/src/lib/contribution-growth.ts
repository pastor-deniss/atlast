// Ticket 16: "Your Growth" bar chart — per-period net contribution over the
// last 12 periods. Must net out reversals against the ORIGINAL contribution's
// period (via reversed_transaction_id), not the reversal's own date, or a
// late correction would misattribute which period it corrects. Implemented
// as plain client-side aggregation over fetched rows, not a new blueprint
// view — nothing else in the spec needs this shape (ticket 16).

export type GrowthTransaction = {
  id: string;
  type: string;
  amount: number;
  created_at: string;
  reversed_transaction_id: string | null;
};

export type GrowthBar = { key: string; label: string; total: number };

function startOfWeek(d: Date): Date {
  const copy = new Date(d);
  const day = (copy.getDay() + 6) % 7; // 0 = Monday
  copy.setDate(copy.getDate() - day);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function periodKey(date: Date, frequency: string): string {
  if (frequency === 'monthly') {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }
  if (frequency === 'daily') {
    return date.toISOString().slice(0, 10);
  }
  // weekly (default)
  return startOfWeek(date).toISOString().slice(0, 10);
}

function periodLabel(key: string, frequency: string): string {
  if (frequency === 'monthly') {
    const [year, month] = key.split('-');
    return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString(undefined, {
      month: 'short',
    });
  }
  const d = new Date(key);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function lastNPeriodKeys(n: number, frequency: string): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    if (frequency === 'monthly') d.setMonth(d.getMonth() - i);
    else if (frequency === 'daily') d.setDate(d.getDate() - i);
    else d.setDate(d.getDate() - i * 7);
    keys.push(periodKey(d, frequency));
  }
  return keys;
}

export function computeGrowthSeries(
  transactions: GrowthTransaction[],
  frequency: string,
  periods = 12
): GrowthBar[] {
  const contributionsById = new Map(
    transactions.filter((t) => t.type === 'contribution').map((t) => [t.id, t])
  );

  const totals = new Map<string, number>();
  for (const t of transactions) {
    if (t.type === 'contribution') {
      const key = periodKey(new Date(t.created_at), frequency);
      totals.set(key, (totals.get(key) ?? 0) + t.amount);
    } else if (
      t.type === 'reversal' &&
      t.reversed_transaction_id &&
      contributionsById.has(t.reversed_transaction_id)
    ) {
      const original = contributionsById.get(t.reversed_transaction_id)!;
      const key = periodKey(new Date(original.created_at), frequency);
      totals.set(key, (totals.get(key) ?? 0) + t.amount); // reversal amount is already negative
    }
  }

  return lastNPeriodKeys(periods, frequency).map((key) => ({
    key,
    label: periodLabel(key, frequency),
    total: totals.get(key) ?? 0,
  }));
}
