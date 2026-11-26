import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { PaymentMethodPicker } from '@/components/payment-method-picker';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useMembership } from '@/lib/membership-context';
import { functionErrorMessage } from '@/lib/function-error';
import { needsReference, type PaymentMethod } from '@/lib/payment-methods';
import { supabase } from '@/lib/supabase';
import { useT } from '@/lib/i18n';

// The member picks how they paid: M-Pesa, Airtel Money or Tigo Pesa need the
// confirmation code as reference; for Cash a receipt number is optional
// (payment-methods.sql). Live client-side validation of
// the share_value-multiple rule is a UX nicety; reportContribution (ticket
// 13) remains the actual enforcement point.
export default function ContributeScreen() {
  const router = useRouter();
  const { group } = useMembership();
  const t = useT();
  // fund=jamii: a Jamii (welfare) contribution into the separate Jamii pot --
  // no shares, so any amount; prefilled with the group's Jamii amount.
  const { fund } = useLocalSearchParams<{ fund?: string }>();
  const isJamii = fund === 'jamii';

  const [amount, setAmount] = useState('');

  useEffect(() => {
    if (!isJamii || !group) return;
    supabase
      .from('groups')
      .select('jamii_contribution_amount')
      .eq('id', group.id)
      .maybeSingle()
      .then(({ data }) => {
        const preset = Number(data?.jamii_contribution_amount ?? 0);
        if (preset > 0) setAmount((current) => current || String(preset));
      });
  }, [isJamii, group]);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Synchronous double-submit guard (state alone updates a render too late).
  const inFlight = useRef(false);

  if (!group) return null;

  const numericAmount = Number(amount);
  const isValidAmount =
    amount.length > 0 && Number.isFinite(numericAmount) && numericAmount > 0;
  const isMultiple = isValidAmount && (isJamii || numericAmount % group.share_value === 0);
  const sharesForAmount = isMultiple ? numericAmount / group.share_value : 0;

  async function handleSubmit() {
    setError(null);
    if (!isValidAmount) {
      setError('Enter an amount.');
      return;
    }
    if (!isMultiple) {
      setError(
        t('Must be a multiple of {amount}.', {
          amount: `${group!.currency} ${group!.share_value.toLocaleString()}`,
        })
      );
      return;
    }
    if (!method) {
      setError('Choose how you paid.');
      return;
    }
    if (needsReference(method) && !reference.trim()) {
      setError('Enter the mobile money reference.');
      return;
    }

    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    let data: unknown;
    let errorMessage: string | null;
    try {
      const result = await supabase.functions.invoke('report-contribution', {
        body: {
          group_id: group!.id,
          amount: numericAmount,
          reference: reference.trim(),
          payment_method: method,
          fund: isJamii ? 'jamii' : undefined,
        },
      });
      data = result.data;
      errorMessage =
        (data as { error?: string } | null)?.error ?? (await functionErrorMessage(result.error));
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }

    if (errorMessage) {
      setError(errorMessage);
      return;
    }

    if (isJamii) {
      router.back();
      return;
    }

    const transaction = (
      data as {
        transaction: {
          amount: number;
          shares_earned: number;
          reference: string | null;
          payment_method: string;
          created_at: string;
        };
      }
    ).transaction;
    router.replace({
      pathname: '/(app)/contribution-receipt',
      params: {
        amount: String(transaction.amount),
        sharesEarned: String(transaction.shares_earned),
        reference: transaction.reference ?? '',
        method: transaction.payment_method,
        at: transaction.created_at,
      },
    });
  }

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ThemedText type="title">{isJamii ? t('Jamii Contribution') : t('Make Contribution')}</ThemedText>
          {isJamii ? (
            <ThemedText type="small" themeColor="textSecondary">
              {t('Goes into the Jamii pot that helps members who fall ill. It is not savings and earns no shares.')}
            </ThemedText>
          ) : null}

          <TextField
            label={t('Amount')}
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
            hint={
              isJamii
                ? undefined
                : isValidAmount
                ? isMultiple
                  ? `✓ ${sharesForAmount === 1 ? t('1 share') : t('{count} shares', { count: sharesForAmount })}`
                  : t('Must be a multiple of {amount}', {
                      amount: `${group.currency} ${group.share_value.toLocaleString()}`,
                    })
                : undefined
            }
          />

          <PaymentMethodPicker value={method} onChange={setMethod} />

          {method ? (
            <TextField
              label={method === 'cash' ? t('Receipt number (optional)') : t('Reference')}
              value={reference}
              onChangeText={setReference}
              placeholder={
                method === 'cash'
                  ? t('If the person you paid gave you a receipt')
                  : t('Mobile money confirmation code')
              }
            />
          ) : null}

          {error ? (
            <ThemedText type="small" themeColor="danger">
              {t(error)}
            </ThemedText>
          ) : null}

          <Button
            title={t('Contribute')}
            onPress={handleSubmit}
            loading={submitting}
            disabled={!isMultiple || !method || (needsReference(method) && !reference.trim())}
          />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three },
});
