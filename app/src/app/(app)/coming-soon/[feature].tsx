import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

const TICKETS: Record<string, string> = {
  contributions: 'ticket 16',
  loans: 'ticket 17',
  governance: 'ticket 18',
  reporting: 'ticket 19',
};

const LABELS: Record<string, string> = {
  contributions: 'Contributions',
  loans: 'Loans',
  governance: 'Governance',
  reporting: 'Reporting',
};

export default function ComingSoonScreen() {
  const { feature } = useLocalSearchParams<{ feature: string }>();

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ThemedText type="title">{LABELS[feature] ?? feature}</ThemedText>
          <ThemedText type="default" themeColor="textSecondary">
            This lands with {TICKETS[feature] ?? 'a future ticket'}.
          </ThemedText>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: Spacing.four, gap: Spacing.two },
});
