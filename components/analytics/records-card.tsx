import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { LucideIcon } from 'lucide-react-native';
import { Fragment } from 'react';
import { StyleSheet, Text, useColorScheme, View } from 'react-native';

import { ScoreValue } from '@/components/metrics';
import { fonts } from '@/constants/fonts';
import { metricColors } from '@/constants/metrics';

/**
 * All-time bests. Every row here has a weekly counterpart in the counters
 * above, so a user can see "this week" and "ever" side by side without the two
 * using different names or units for the same thing.
 */
export type RecordRow = {
  icon: LucideIcon;
  title: string;
  caption: string;
  /** Rendered as `NN /100` when true, otherwise as the raw value plus `unit`. */
  isScore?: boolean;
  value: number;
  unit?: string;
};

export function RecordsCard({ rows }: { rows: readonly RecordRow[] }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const theme = metricColors[scheme];
  const hasGlass = isLiquidGlassAvailable();

  const body = (
    <>
      {rows.map((row, i) => (
        <Fragment key={row.title}>
          {i > 0 && <View style={[styles.divider, { backgroundColor: theme.divider }]} />}
          <View style={styles.row}>
            <View style={[styles.iconTile, { backgroundColor: theme.iconTile }]}>
              <row.icon size={20} color={theme.ink} strokeWidth={1.7} />
            </View>
            <View style={styles.text}>
              <Text style={[styles.title, { color: theme.ink }]} numberOfLines={1}>
                {row.title}
              </Text>
              <Text style={[styles.caption, { color: theme.caption }]} numberOfLines={1}>
                {row.caption}
              </Text>
            </View>
            <View style={styles.trailing}>
              {row.isScore ? (
                <ScoreValue value={row.value} size={19} maxSize={13} />
              ) : (
                <>
                  <Text style={[styles.value, { color: theme.ink }]}>{row.value}</Text>
                  <Text style={[styles.unit, { color: theme.unit }]}>{row.unit}</Text>
                </>
              )}
            </View>
          </View>
        </Fragment>
      ))}
    </>
  );

  return hasGlass ? (
    <GlassView
      glassEffectStyle="regular"
      style={[styles.card, { backgroundColor: theme.glassTint }]}>
      {body}
    </GlassView>
  ) : (
    <View style={[styles.card, { backgroundColor: theme.solidFallback }]}>{body}</View>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingVertical: 6,
    paddingHorizontal: 18,
    borderRadius: 32,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 14,
  },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderCurve: 'continuous',
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: 1,
  },
  title: {
    fontSize: 16,
    fontFamily: fonts.semibold,
  },
  caption: {
    fontSize: 13,
    fontFamily: fonts.regular,
  },
  trailing: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
  },
  value: {
    fontSize: 19,
    fontFamily: fonts.heavy,
  },
  unit: {
    fontSize: 13,
    fontFamily: fonts.semibold,
  },
  divider: {
    height: 1,
  },
});
