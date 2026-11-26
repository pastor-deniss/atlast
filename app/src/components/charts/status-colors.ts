// Status colours for the report's health score: fixed in both modes (dataviz
// reference status palette), reserved for status, and always shown with an
// icon + text label -- never colour alone. Contrast checked on both card
// surfaces; where a step is below 3:1 (warning on white, critical on the dark
// green card) the label carries it.
export const STATUS = {
  good: '#0aac23',
  warn: '#fbb315',
  bad: '#dc3c3d',
} as const;

export type StatusTone = keyof typeof STATUS;

/** SF Symbol / Material icon pairs that go with each status. */
export const STATUS_ICONS: Record<StatusTone, [string, string]> = {
  good: ['checkmark.circle.fill', 'check_circle'],
  warn: ['exclamationmark.circle.fill', 'error'],
  bad: ['xmark.octagon.fill', 'report'],
};
