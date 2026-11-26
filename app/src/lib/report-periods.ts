// Ticket 19: Reports screen periods -- Monthly/Quarterly/Annual only, no
// custom range (the ticket's own answer). Pure date-math helpers so the
// screen just picks a period and asks for its [start, end) bounds.

export type ReportPeriodType = 'monthly' | 'quarterly' | 'annual';

export function periodBounds(type: ReportPeriodType, reference: Date): { start: Date; end: Date } {
  const year = reference.getFullYear();
  if (type === 'monthly') {
    const month = reference.getMonth();
    return { start: new Date(year, month, 1), end: new Date(year, month + 1, 1) };
  }
  if (type === 'quarterly') {
    const quarter = Math.floor(reference.getMonth() / 3);
    return { start: new Date(year, quarter * 3, 1), end: new Date(year, quarter * 3 + 3, 1) };
  }
  return { start: new Date(year, 0, 1), end: new Date(year + 1, 0, 1) };
}

export function periodLabel(type: ReportPeriodType, reference: Date): string {
  if (type === 'monthly') {
    return reference.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }
  if (type === 'quarterly') {
    const quarter = Math.floor(reference.getMonth() / 3) + 1;
    return `Q${quarter} ${reference.getFullYear()}`;
  }
  return String(reference.getFullYear());
}

/** Move by `steps` periods (negative = back). Shifts from the period's first day, so the 31st never skips a month. */
export function shiftPeriod(type: ReportPeriodType, reference: Date, steps: number): Date {
  const copy = periodBounds(type, reference).start;
  if (type === 'monthly') copy.setMonth(copy.getMonth() + steps);
  else if (type === 'quarterly') copy.setMonth(copy.getMonth() + steps * 3);
  else copy.setFullYear(copy.getFullYear() + steps);
  return copy;
}

/** Compact label for chart axes: "Nov", "Q3", "2026". */
export function shortPeriodLabel(type: ReportPeriodType, reference: Date): string {
  if (type === 'monthly') return reference.toLocaleDateString(undefined, { month: 'short' });
  if (type === 'quarterly') return `Q${Math.floor(reference.getMonth() / 3) + 1}`;
  return String(reference.getFullYear());
}

export function isFuturePeriod(type: ReportPeriodType, reference: Date): boolean {
  return periodBounds(type, reference).start > new Date();
}
