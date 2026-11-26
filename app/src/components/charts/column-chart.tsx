import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Brand, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

export type Column = { key: string; label: string; value: number };

const PLOT_HEIGHT = 140;

function compact(n: number) {
  if (n >= 1_000_000) return `${Number((n / 1_000_000).toFixed(1))}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  return Math.round(n).toLocaleString();
}

/**
 * One series over time as columns. Single series -> no legend (the card
 * title names it). Label is selective: only the selected column shows its
 * value (the latest by default); tap any column to read it -- the touch
 * equivalent of a hover tooltip. A hairline baseline and a top tick give scale.
 */
export function ColumnChart({ columns, format }: { columns: Column[]; format: (n: number) => string }) {
  const theme = useTheme();
  const scheme = useColorScheme();
  const [selected, setSelected] = useState<string | null>(null);
  const active = selected ?? columns[columns.length - 1]?.key;
  const max = Math.max(1, ...columns.map((c) => c.value));
  const fill = scheme === 'dark' ? Brand.gold : Brand.green;
  const activeColumn = columns.find((c) => c.key === active);

  return (
    <View style={styles.wrap}>
      <View style={styles.readout}>
        <ThemedText type="small" themeColor="textSecondary">
          {activeColumn?.label}
        </ThemedText>
        <ThemedText type="subtitle" style={styles.readoutValue}>
          {format(activeColumn?.value ?? 0)}
        </ThemedText>
      </View>
      <View style={styles.plotRow}>
        <View style={styles.axis}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.tick}>
            {compact(max)}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.tick}>
            0
          </ThemedText>
        </View>
        <View style={[styles.plot, { borderBottomColor: theme.textSecondary }]}>
          {columns.map((c) => {
            const isActive = c.key === active;
            const h = c.value > 0 ? Math.max(3, (c.value / max) * PLOT_HEIGHT) : 0;
            return (
              <Pressable
                key={c.key}
                accessibilityRole="button"
                accessibilityLabel={`${c.label}: ${format(c.value)}`}
                accessibilityState={{ selected: isActive }}
                onPress={() => setSelected(c.key)}
                style={styles.slot}>
                <View
                  style={[
                    styles.column,
                    { height: h, backgroundColor: fill, opacity: isActive ? 1 : 0.45 },
                  ]}
                />
              </Pressable>
            );
          })}
        </View>
      </View>
      <View style={styles.labelsRow}>
        <View style={styles.axis} />
        {columns.map((c) => (
          <ThemedText
            key={c.key}
            type="small"
            themeColor={c.key === active ? 'text' : 'textSecondary'}
            style={styles.colLabel}
            numberOfLines={1}>
            {c.label}
          </ThemedText>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  readout: { gap: 0 },
  readoutValue: { fontSize: 20, lineHeight: 26 },
  plotRow: { flexDirection: 'row', height: PLOT_HEIGHT },
  axis: { width: 36, justifyContent: 'space-between' },
  tick: { fontSize: 10 },
  plot: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  // The slot is the (bigger) hit target; the column itself stays <= 24px.
  slot: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'flex-end' },
  column: { width: 22, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  labelsRow: { flexDirection: 'row' },
  colLabel: { flex: 1, textAlign: 'center', fontSize: 11 },
});
