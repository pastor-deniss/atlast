import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';

// Ticket 15: copy deliberately doesn't say "you will be notified after
// voting" (the mockup's line) -- the first step is an Admin pre-screen that
// may reject outright, no vote at all (ticket 11). Neutral wording instead.
export default function ApplicationReceivedScreen() {
  const router = useRouter();
  const { groupName } = useLocalSearchParams<{ groupName: string }>();

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ThemedText type="title">Application Received</ThemedText>
          <ThemedText type="default" themeColor="textSecondary">
            Your application to join {groupName} has been received and is being reviewed.
          </ThemedText>
          <Button title="Back to Home" onPress={() => router.replace('/(app)')} />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: Spacing.four, gap: Spacing.three },
});
