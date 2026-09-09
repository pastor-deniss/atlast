// V1's identity is phone + profile only (ticket 06). A short list of
// countries is enough for the pilot; extend as real usage requires it.
export const COUNTRIES = [
  { code: 'TZ', name: 'Tanzania', dialCode: '+255' },
  { code: 'KE', name: 'Kenya', dialCode: '+254' },
  { code: 'UG', name: 'Uganda', dialCode: '+256' },
  { code: 'RW', name: 'Rwanda', dialCode: '+250' },
] as const;

export type CountryCode = (typeof COUNTRIES)[number]['code'];

export function toE164(dialCode: string, localNumber: string): string {
  const digitsOnly = localNumber.replace(/\D/g, '').replace(/^0+/, '');
  return `${dialCode}${digitsOnly}`;
}

// Loose validation: E.164 is + followed by 8-15 digits total.
export function isValidE164(phone: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(phone);
}
