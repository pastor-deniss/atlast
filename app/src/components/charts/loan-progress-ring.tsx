import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { icon } from '@/components/ui/screen';
import { Brand, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/lib/i18n';

import { STATUS, STATUS_ICONS, type StatusTone } from './status-colors';

/**
 * How much of a loan is repaid, as a ring: "60% repaid", with what was paid
 * and what remains written out, and the standing (On track / Falling behind
 * / Overdue) as icon + word. The ring is a magnitude, so it wears the brand
 * colour; only the standing badge uses a status colour.
 */
export function LoanProgressRing({
  paid,
  total,
  tone,
  format,
  size = 168,
}: {
  paid: number;
  total: number;
  tone: StatusTone;
  format: (n: number) => string;
  size?: number;
}) {
  const t = useT();
  const theme = useTheme();
  const dark = useColorScheme() === 'dark';
  const stroke = Math.round(size / 11);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = total > 0 ? Math.max(0, Math.min(100, Math.floor((paid / total) * 100))) : 0;
  const [ios, material] = STATUS_ICONS[tone];
  const standing = { good: t('On track'), warn: t('Falling behind'), bad: t('Overdue') }[tone];

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${t('{pct}% repaid', { pct })}. ${t('Paid so far')} ${format(paid)}, ${t('Remaining')} ${format(Math.max(0, total - paid))}. ${standing}`}>
      <View style={[styles.ringBox, { width: size, height: size }]}>
        <Svg width={size} height={size}>
          <Circle cx={size / 2} cy={size / 2} r={radius} stroke={theme.backgroundSelected} strokeWidth={stroke} fill="none" />
          {pct > 0 ? (
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={dark ? Brand.gold : Brand.greenLight}
              strokeWidth={stroke}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${(pct / 100) * circumference} ${circumference}`}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          ) : null}
        </Svg>
        <View style={styles.center} pointerEvents="none">
          <ThemedText type="title" style={{ fontSize: size / 4.4, lineHeight: size / 3.6 }}>
            {pct}%
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t('repaid')}
          </ThemedText>
        </View>
      </View>

      <View style={styles.figures}>
        <View style={styles.figure}>
          <ThemedText type="small" themeColor="textSecondary">
            {t('Paid so far')}
          </ThemedText>
          <ThemedText type="smallBold">{format(paid)}</ThemedText>
        </View>
        <View style={styles.figure}>
          <ThemedText type="small" themeColor="textSecondary">
            {t('Remaining')}
          </ThemedText>
          <ThemedText type="smallBold">{format(Math.max(0, total - paid))}</ThemedText>
        </View>
      </View>

      <View style={[styles.badge, { backgroundColor: theme.backgroundSelected }]}>
        <SymbolView name={icon(ios, material)} size={16} tintColor={STATUS[tone]} />
        {/* The word wears the text colour (readable on every card); the icon carries the status colour. */}
        <ThemedText type="smallBold">
          {standing}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: Spacing.two },
  ringBox: { alignItems: 'center', justifyContent: 'center' },
  center: { position: 'absolute', alignItems: 'center' },
  figures: { flexDirection: 'row', gap: Spacing.five },
  figure: { alignItems: 'center' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: 999,
  },
});
