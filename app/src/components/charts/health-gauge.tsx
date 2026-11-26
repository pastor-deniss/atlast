import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { icon } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { STATUS, STATUS_ICONS, type StatusTone } from './status-colors';

const SIZE = 190;
const STROKE = 16;

/**
 * A single headline score out of 100 as a ring. The number and the band label
 * are text (never only colour); the ring wears the status colour.
 */
export function HealthGauge({ score, tone, bandLabel, caption }: {
  score: number;
  tone: StatusTone;
  bandLabel: string;
  caption: string;
}) {
  const theme = useTheme();
  const radius = (SIZE - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const value = Math.max(0, Math.min(100, score));
  const [ios, material] = STATUS_ICONS[tone];

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${value} / 100, ${bandLabel}`}>
      <View style={styles.ringBox}>
        <Svg width={SIZE} height={SIZE}>
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={radius}
            stroke={theme.backgroundSelected}
            strokeWidth={STROKE}
            fill="none"
          />
          {value > 0 ? (
            <Circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={radius}
              stroke={STATUS[tone]}
              strokeWidth={STROKE}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${(value / 100) * circumference} ${circumference}`}
              transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            />
          ) : null}
        </Svg>
        <View style={styles.center} pointerEvents="none">
          <ThemedText type="title" style={styles.score}>
            {value}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {caption}
          </ThemedText>
        </View>
      </View>
      <View style={[styles.band, { backgroundColor: theme.backgroundSelected }]}>
        <SymbolView name={icon(ios, material)} size={18} tintColor={STATUS[tone]} />
        <ThemedText type="smallBold">{bandLabel}</ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: Spacing.two },
  ringBox: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  center: { position: 'absolute', alignItems: 'center' },
  score: { fontSize: 48, lineHeight: 56 },
  band: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: 999,
  },
});
