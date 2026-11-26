// How a member paid a contribution or loan repayment. Must match the CHECK
// on transactions.payment_method (.scratch/atlast-mvp-spec/payment-methods.sql)
// and the PAYMENT_METHODS lists in the report-contribution and
// record-loan-repayment Edge Functions.
export type PaymentMethod = 'mpesa' | 'airtel_money' | 'tigo_pesa' | 'cash';

/** Brand names stay as they are in every language; Cash is translated. */
export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'mpesa', label: 'M-Pesa' },
  { value: 'airtel_money', label: 'Airtel Money' },
  { value: 'tigo_pesa', label: 'Tigo Pesa' },
  { value: 'cash', label: 'Cash' },
];

/** English label; rows recorded before methods existed (NULL) were mobile money. */
export function paymentMethodLabel(method: string | null | undefined): string {
  return PAYMENT_METHODS.find((m) => m.value === method)?.label ?? 'Mobile Money';
}

export function needsReference(method: PaymentMethod | null) {
  return method !== 'cash';
}
