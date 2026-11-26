// Every recorded action in the app (payments, votes, reviews, messages,
// complaints, announcements…) is shown with its date, time and seconds,
// e.g. "26 Nov 2026, 19:07:45". Schedule dates (due dates, report periods)
// stay date-only because they are not moments something happened.
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '';
  return new Date(value).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}
