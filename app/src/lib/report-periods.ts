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

export function shiftPeriod(type: ReportPeriodType, reference: Date, direction: 1 | -1): Date {
  const copy = new Date(reference);
  if (type === 'monthly') copy.setMonth(copy.getMonth() + direction);
  else if (type === 'quarterly') copy.setMonth(copy.getMonth() + direction * 3);
  else copy.setFullYear(copy.getFullYear() + direction);
  return copy;
}

export function isFuturePeriod(type: ReportPeriodType, reference: Date): boolean {
  return periodBounds(type, reference).start > new Date();
}
