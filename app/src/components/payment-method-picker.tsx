import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/lib/i18n';
import { PAYMENT_METHODS, type PaymentMethod } from '@/lib/payment-methods';

/** Two-by-two choice of how the member paid. */
export function PaymentMethodPicker({
  value,
  onChange,
}: {
  value: PaymentMethod | null;
  onChange: (method: PaymentMethod) => void;
}) {
  const t = useT();
  const theme = useTheme();
  return (
    <View style={styles.container}>
      <ThemedText type="small" themeColor="textSecondary">
        {t('Choose Payment Method')}
      </ThemedText>
      <View style={styles.grid}>
        {PAYMENT_METHODS.map((m) => {
          const selected = value === m.value;
          return (
            <Pressable
              key={m.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => onChange(m.value)}
              style={({ pressed }) => [
                styles.option,
                {
                  borderColor: selected ? theme.primary : theme.backgroundSelected,
                  backgroundColor: selected ? theme.backgroundSelected : theme.backgroundElement,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}>
              <ThemedText type={selected ? 'smallBold' : 'small'} style={styles.label}>
                {t(m.label)}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.one },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  option: {
    flexBasis: '47%',
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.three,
    borderRadius: 14,
    borderWidth: 2,
  },
  label: { fontSize: 16, textAlign: 'center' },
});
