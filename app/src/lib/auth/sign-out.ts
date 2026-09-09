import { clearPin } from '@/lib/auth/pin';
import { setBiometricEnabled } from '@/lib/auth/biometric';
import { supabase } from '@/lib/supabase';

/**
 * Ticket 14, Q6: sign-out clears local secrets entirely (Supabase session +
 * PIN hash + biometric flag) — the next sign-in on this device, even for the
 * same account, sets a fresh PIN. Caller must also call the AppLockContext's
 * `refreshPinExists()` afterward so in-memory state matches.
 */
export async function signOutAndWipeLocalSecrets(): Promise<void> {
  await clearPin();
  await setBiometricEnabled(false);
  await supabase.auth.signOut();
}
