import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card, icon, Pill } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Announcement } from '@/lib/announcements';
import { useT } from '@/lib/i18n';

export function AnnouncementCard({ announcement: a }: { announcement: Announcement }) {
  const t = useT();
  const theme = useTheme();
  return (
    <Card>
      <View style={styles.cardHeader}>
        <SymbolView
          name={icon('megaphone', 'campaign')}
          size={20}
          tintColor={a.priority === 'important' ? '#B45309' : theme.primary}
        />
        <ThemedText type="smallBold" style={[styles.cardTitle, styles.flex]}>
          {a.title}
        </ThemedText>
        {a.priority === 'important' ? <Pill label={t('Important')} tone="warn" /> : null}
      </View>
      <ThemedText type="default">{a.body}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {a.author_name ? `${a.author_name} • ` : ''}
        {new Date(a.created_at).toLocaleDateString()}
      </ThemedText>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  cardTitle: { fontSize: 16 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
});
