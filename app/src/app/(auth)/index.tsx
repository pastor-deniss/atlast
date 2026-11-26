import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AtlastLogo } from '@/components/atlast-logo';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { NarrowContentWidth, Spacing } from '@/constants/theme';
import { useIsWideScreen } from '@/hooks/use-is-wide-screen';
import { useT } from '@/lib/i18n';

export default function WelcomeScreen() {
  const router = useRouter();
  const t = useT();
  // On wide screens (tablet/desktop web) centre a narrow column instead of
  // pinning full-width content to the bottom-left like on a phone.
  const isWide = useIsWideScreen();

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex}>
        <ScrollView contentContainerStyle={[styles.content, isWide && styles.contentWide]} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <AtlastLogo width={240} />
            <ThemedText type="subtitle" themeColor="primary">
              {t('Grow Together.')}
            </ThemedText>
          </View>

          <ThemedText type="default" themeColor="textSecondary" style={styles.tagline}>
            {t('Build together. Save together. Grow together.')}
          </ThemedText>

          <View style={styles.actions}>
            <Button title={t('Create Account')} onPress={() => router.push('/(auth)/create-account')} />
            <Button
              title={t('Sign In')}
              variant="secondary"
              onPress={() => router.push('/(auth)/sign-in')}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.five,
    gap: Spacing.five,
  },
  contentWide: {
    justifyContent: 'center',
    alignSelf: 'center',
    width: '100%',
    maxWidth: NarrowContentWidth,
  },
  brand: { gap: Spacing.one },
  tagline: { maxWidth: 280 },
  actions: { gap: Spacing.two },
});
