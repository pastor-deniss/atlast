import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Brand, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

export type BarItem = { key: string; label: string; value: number; display: string };

/**
 * Horizontal bars, one hue (magnitude, not identity): each bar is named by
 * its own label, so no legend. Value at the tip in text colour. `max` lets
 * percentages share a 0-100 scale.
 */
export function BarList({ items, max }: { items: BarItem[]; max?: number }) {
  const theme = useTheme();
  const scheme = useColorScheme();
  const top = max ?? Math.max(1, ...items.map((i) => i.value));
  const fill = scheme === 'dark' ? Brand.gold : Brand.green;

  return (
    <View style={styles.list}>
      {items.map((item) => {
        const share = Math.max(0, Math.min(1, item.value / top));
        return (
          <View key={item.key} style={styles.item} accessible accessibilityLabel={`${item.label}: ${item.display}`}>
            <View style={styles.labels}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
                {item.label}
              </ThemedText>
              <ThemedText type="smallBold">{item.display}</ThemedText>
            </View>
            <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
              {share > 0 ? (
                <View style={[styles.fill, { width: `${Math.max(2, share * 100)}%`, backgroundColor: fill }]} />
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { gap: Spacing.three },
  item: { gap: Spacing.one },
  labels: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two },
  // Bars stay thin (<= 24px); square at the baseline, 4px rounded data end.
  track: { height: 12, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 12, borderTopRightRadius: 4, borderBottomRightRadius: 4 },
});
