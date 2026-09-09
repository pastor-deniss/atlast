import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useMembership } from '@/lib/membership-context';

// Ticket 16: no PDF generation in V1 (same undesigned-capability gap as
// report export, ticket 13/19). This screen with the reference code is the
// record.
export default function ContributionReceiptScreen() {
  const router = useRouter();
  const { group } = useMembership();
  const { amount, sharesEarned, reference } = useLocalSearchParams<{
    amount: string;
    sharesEarned: string;
    reference: string;
  }>();

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex}>
        <View style={styles.content}>
          <ThemedText type="title">Contribution Received!</ThemedText>

          <View style={styles.row}>
            <ThemedText type="default">Amount</ThemedText>
            <ThemedText type="default">
              {group?.currency} {Number(amount).toLocaleString()}
            </ThemedText>
          </View>
          <View style={styles.row}>
            <ThemedText type="default">Payment Method</ThemedText>
            <ThemedText type="default">Mobile Money</ThemedText>
          </View>
          <View style={styles.row}>
            <ThemedText type="default">Reference</ThemedText>
            <ThemedText type="default">{reference}</ThemedText>
          </View>
          <View style={styles.row}>
            <ThemedText type="default">Shares Earned</ThemedText>
            <ThemedText type="default">{sharesEarned}</ThemedText>
          </View>
          <View style={styles.row}>
            <ThemedText type="default">Status</ThemedText>
            <ThemedText type="default" themeColor="primary">
              Confirmed
            </ThemedText>
          </View>

          <View style={styles.spacer} />
          <Button title="View History" onPress={() => router.replace('/(app)/contributions')} />
          <Button title="Back to Home" variant="secondary" onPress={() => router.replace('/(app)')} />
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flex: 1, padding: Spacing.four, gap: Spacing.two },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.one,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  spacer: { flex: 1 },
});
