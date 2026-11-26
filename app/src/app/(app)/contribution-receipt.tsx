import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useMembership } from '@/lib/membership-context';
import { useT } from '@/lib/i18n';

// Ticket 16: no PDF generation in V1 (same undesigned-capability gap as
// report export, ticket 13/19). This screen with the reference code is the
// record.
export default function ContributionReceiptScreen() {
  const router = useRouter();
  const { group } = useMembership();
  const t = useT();
  const { amount, sharesEarned, reference } = useLocalSearchParams<{
    amount: string;
    sharesEarned: string;
    reference: string;
  }>();

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ThemedText type="title">{t('Contribution Received!')}</ThemedText>

          <View style={styles.row}>
            <ThemedText type="default">{t('Amount')}</ThemedText>
            <ThemedText type="default">
              {group?.currency} {Number(amount).toLocaleString()}
            </ThemedText>
          </View>
          <View style={styles.row}>
            <ThemedText type="default">{t('Payment Method')}</ThemedText>
            <ThemedText type="default">{t('Mobile Money')}</ThemedText>
          </View>
          <View style={styles.row}>
            <ThemedText type="default">{t('Reference')}</ThemedText>
            <ThemedText type="default">{reference}</ThemedText>
          </View>
          <View style={styles.row}>
            <ThemedText type="default">{t('Shares Earned')}</ThemedText>
            <ThemedText type="default">{sharesEarned}</ThemedText>
          </View>
          <View style={styles.row}>
            <ThemedText type="default">{t('Status')}</ThemedText>
            <ThemedText type="default" themeColor="primary">
              {t('Confirmed')}
            </ThemedText>
          </View>

          <View style={styles.spacer} />
          <Button title={t('View History')} onPress={() => router.replace('/(app)/contributions')} />
          <Button title={t('Back to Home')} variant="secondary" onPress={() => router.replace('/(app)')} />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, padding: Spacing.four, gap: Spacing.two },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.one,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  spacer: { flex: 1 },
});
