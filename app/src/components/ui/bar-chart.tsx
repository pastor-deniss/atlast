import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { GrowthBar } from '@/lib/contribution-growth';

const CHART_HEIGHT = 120;

export function BarChart({ bars }: { bars: GrowthBar[] }) {
  const theme = useTheme();
  const max = Math.max(1, ...bars.map((b) => b.total));

  return (
    <View style={styles.row}>
      {bars.map((bar) => (
        <View key={bar.key} style={styles.column}>
          <View
            style={[
              styles.bar,
              {
                height: Math.max(2, (bar.total / max) * CHART_HEIGHT),
                backgroundColor: bar.total > 0 ? theme.primary : theme.backgroundSelected,
              },
            ]}
          />
          <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
            {bar.label}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: CHART_HEIGHT + 24,
    gap: Spacing.half,
  },
  column: { flex: 1, alignItems: 'center', gap: Spacing.half },
  bar: { width: '100%', borderRadius: 4 },
  label: { fontSize: 9, transform: [{ rotate: '-45deg' }] },
});
