import { useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

// Categorical slots 1-3 of the dataviz reference palette, light and dark,
// validated all-pairs for colour-blind separation on the white card (light)
// and the green card #134634 (dark). On white, orange and aqua sit below 3:1,
// so every value is also written out in the readout and legend.
const SERIES_COLORS = {
  light: ['#257de0', '#f47230', '#00b894'],
  dark: ['#338ced', '#e76624', '#00a888'],
};

export type LineSeries = { key: string; label: string; values: number[] };

const HEIGHT = 170;
const PAD_TOP = 8;
const PAD_BOTTOM = 4;
const AXIS_W = 40;
const PAD_X = 6; // room for the end dots

function compact(n: number) {
  const a = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (a >= 1_000_000) return `${sign}${Number((a / 1_000_000).toFixed(1))}M`;
  if (a >= 10_000) return `${sign}${Math.round(a / 1000)}K`;
  return `${sign}${Math.round(a).toLocaleString()}`;
}

/**
 * Up to 3 series over time, one money axis. Thin 2px lines, a legend, and a
 * readout above the plot that names every series' value at the selected
 * moment (the latest by default). Tap anywhere on the plot to move the
 * crosshair -- the touch version of a hover tooltip.
 */
export function LineChart({
  labels,
  series,
  format,
}: {
  labels: string[];
  series: LineSeries[];
  format: (n: number) => string;
}) {
  const theme = useTheme();
  const colors = SERIES_COLORS[useColorScheme() === 'dark' ? 'dark' : 'light'];
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);

  const n = labels.length;
  const active = selected ?? n - 1;

  const all = series.flatMap((s) => s.values);
  const max = Math.max(1, ...all);
  const min = Math.min(0, ...all);
  const plotW = Math.max(1, width - AXIS_W);
  const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const x = (i: number) => (n <= 1 ? plotW / 2 : PAD_X + (i / (n - 1)) * (plotW - 2 * PAD_X));
  const y = (v: number) => PAD_TOP + (1 - (v - min) / (max - min)) * plotH;

  function onLayout(e: LayoutChangeEvent) {
    setWidth(e.nativeEvent.layout.width);
  }

  const tickEvery = Math.max(1, Math.ceil(n / 5));

  return (
    <View style={styles.wrap}>
      {/* Readout: the selected moment, every series written out. */}
      <View style={styles.readout}>
        <ThemedText type="small" themeColor="textSecondary">
          {labels[active] ?? ''}
        </ThemedText>
        {series.map((s, k) => (
          <View key={s.key} style={styles.readoutRow}>
            <View style={[styles.swatch, { backgroundColor: colors[k] }]} />
            <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
              {s.label}
            </ThemedText>
            <ThemedText type="smallBold">{format(s.values[active] ?? 0)}</ThemedText>
          </View>
        ))}
      </View>

      <View style={styles.plotRow} onLayout={onLayout}>
        <View style={styles.axis}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.tick}>
            {compact(max)}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.tick}>
            {compact(min)}
          </ThemedText>
        </View>
        {width > 0 ? (
          <View style={{ width: plotW, height: HEIGHT }}>
            <Svg width={plotW} height={HEIGHT}>
              {/* Recessive grid: baseline (zero) and top line only. */}
              <Line x1={0} x2={plotW} y1={y(0)} y2={y(0)} stroke={theme.textSecondary} strokeWidth={0.5} />
              <Line x1={0} x2={plotW} y1={PAD_TOP} y2={PAD_TOP} stroke={theme.backgroundSelected} strokeWidth={1} />
              <Line
                x1={x(active)}
                x2={x(active)}
                y1={PAD_TOP}
                y2={HEIGHT - PAD_BOTTOM}
                stroke={theme.textSecondary}
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              {series.map((s, k) => (
                <Polyline
                  key={s.key}
                  points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
                  fill="none"
                  stroke={colors[k]}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ))}
              {series.map((s, k) => (
                <Circle
                  key={`${s.key}-dot`}
                  cx={x(active)}
                  cy={y(s.values[active] ?? 0)}
                  r={4.5}
                  fill={colors[k]}
                  stroke={theme.backgroundElement}
                  strokeWidth={2}
                />
              ))}
            </Svg>
            {/* One invisible tap target per point, wider than the mark: the
                touch version of a hover tooltip, same on phones and web. */}
            <View style={StyleSheet.absoluteFill}>
              <View style={styles.slots}>
                {labels.map((l, i) => (
                  <Pressable
                    key={i}
                    accessibilityRole="button"
                    accessibilityLabel={`${l}: ${series.map((s) => `${s.label} ${format(s.values[i] ?? 0)}`).join(', ')}`}
                    onPress={() => setSelected(i)}
                    onHoverIn={() => setSelected(i)}
                    style={styles.slot}
                  />
                ))}
              </View>
            </View>
          </View>
        ) : null}
      </View>

      <View style={styles.labelsRow}>
        <View style={{ width: AXIS_W }} />
        <View style={styles.labels}>
          {labels.map((l, i) =>
            (i % tickEvery === 0 && n - 1 - i >= tickEvery / 2) || i === n - 1 ? (
              <ThemedText
                key={i}
                type="small"
                themeColor="textSecondary"
                style={[styles.tick, { position: 'absolute', left: Math.max(0, Math.min(plotW - 44, x(i) - 22)), width: 44 }]}>
                {l}
              </ThemedText>
            ) : null
          )}
        </View>
      </View>

      <View style={styles.legend}>
        {series.map((s, k) => (
          <View key={s.key} style={styles.legendItem}>
            <View style={[styles.legendLine, { backgroundColor: colors[k] }]} />
            <ThemedText type="small" themeColor="textSecondary">
              {s.label}
            </ThemedText>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wrap: { gap: Spacing.two },
  readout: { gap: 2 },
  readoutRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  swatch: { width: 10, height: 10, borderRadius: 5 },
  plotRow: { flexDirection: 'row', height: HEIGHT },
  slots: { flex: 1, flexDirection: 'row', paddingHorizontal: PAD_X / 2 },
  slot: { flex: 1, height: '100%' },
  axis: { width: AXIS_W, justifyContent: 'space-between', paddingVertical: 2 },
  tick: { fontSize: 10, textAlign: 'center' },
  labelsRow: { flexDirection: 'row', height: 14 },
  labels: { flex: 1 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  legendLine: { width: 16, height: 3, borderRadius: 2 },
});
