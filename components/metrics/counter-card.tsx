import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, Text, useColorScheme, View, type StyleProp, type ViewStyle } from 'react-native';

import { fonts } from '@/constants/fonts';
import { metricColors } from '@/constants/metrics';

import { DeltaLabel } from './delta-label';

/**
 * One effort counter: labelled icon, a big value with its unit, and the change
 * since last week. Frosted like every other card in the app; group siblings in
 * a `GlassContainer` so their glass composites as one set.
 *
 * The value is always ink. Effort is effort; there's no "good" or "bad" amount
 * of practice to color it by.
 */
export type CounterCardProps = {
  icon: LucideIcon;
  label: string;
  value: number;
  /** Sits after the value, e.g. "min", "runs", "days". */
  unit: string;
  /** Week-over-week change. Omit for a counter with no comparison. */
  delta?: number;
  /** Appended after the delta number, e.g. "min" in "↑ 12 min". */
  deltaSuffix?: string;
  style?: StyleProp<ViewStyle>;
};

export function CounterCard({
  icon: Icon,
  label,
  value,
  unit,
  delta,
  deltaSuffix,
  style,
}: CounterCardProps) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const theme = metricColors[scheme];
  const hasGlass = isLiquidGlassAvailable();

  const body = (
    <>
      <View style={styles.header}>
        <Icon size={15} color={theme.unit} strokeWidth={1.9} />
        <Text style={[styles.label, { color: theme.label }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <View style={styles.values}>
        <View style={styles.valueRow}>
          <Text style={[styles.value, { color: theme.ink }]}>{value}</Text>
          <Text style={[styles.unit, { color: theme.unit }]}>{unit}</Text>
        </View>
        {/* Reserve the delta line even when absent so cards in a row align. */}
        <View style={styles.deltaSlot}>
          {delta != null && <DeltaLabel delta={delta} suffix={deltaSuffix} hideZero />}
        </View>
      </View>
    </>
  );

  return hasGlass ? (
    <GlassView
      glassEffectStyle="regular"
      style={[styles.card, { backgroundColor: theme.glassTint }, style]}>
      {body}
    </GlassView>
  ) : (
    <View style={[styles.card, { backgroundColor: theme.solidFallback }, style]}>{body}</View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    padding: 16,
    borderRadius: 26,
    borderCurve: 'continuous',
    overflow: 'hidden',
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontFamily: fonts.medium,
    flexShrink: 1,
  },
  values: {
    gap: 3,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
  },
  value: {
    fontSize: 26,
    fontFamily: fonts.heavy,
    letterSpacing: -0.5,
  },
  unit: {
    fontSize: 13,
    fontFamily: fonts.semibold,
  },
  deltaSlot: {
    height: 16,
    justifyContent: 'center',
  },
});
