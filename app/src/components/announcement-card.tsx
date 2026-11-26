import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card, icon, Pill } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { formatDateTime } from '@/lib/datetime';
import type { Announcement } from '@/lib/announcements';
import { useT } from '@/lib/i18n';

/** `highlight`: the light-yellow notice look used on Home. */
export function AnnouncementCard({ announcement: a, highlight = false }: { announcement: Announcement; highlight?: boolean }) {
  const t = useT();
  const theme = useTheme();
  const dark = useColorScheme() === 'dark';
  const highlightStyle = highlight ? (dark ? styles.yellowDark : styles.yellowLight) : null;
  return (
    <Card style={highlightStyle}>
      <View style={styles.cardHeader}>
        <SymbolView
          name={icon('megaphone', 'campaign')}
          size={20}
          tintColor={a.priority === 'important' || highlight ? (dark ? '#F2B33D' : '#B45309') : theme.primary}
        />
        <ThemedText type="smallBold" style={[styles.cardTitle, styles.flex]}>
          {a.title}
        </ThemedText>
        {a.priority === 'important' ? <Pill label={t('Important')} tone="warn" /> : null}
      </View>
      <ThemedText type="default">{a.body}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {a.author_name ? `${a.author_name} • ` : ''}
        {formatDateTime(a.created_at)}
      </ThemedText>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  cardTitle: { fontSize: 16 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  // Light yellow on light screens; a soft gold tint on dark ones (a pale
  // yellow card would make the dark theme's light text unreadable).
  yellowLight: { backgroundColor: '#FFF6D5', borderWidth: 1, borderColor: '#F3DC8E' },
  yellowDark: { backgroundColor: 'rgba(242, 179, 61, 0.14)', borderWidth: 1, borderColor: 'rgba(242, 179, 61, 0.45)' },
});
