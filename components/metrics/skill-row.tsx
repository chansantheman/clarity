import { StyleSheet, Text, useColorScheme, View } from 'react-native';

import { fonts } from '@/constants/fonts';
import { metricColors, SKILL_LABELS } from '@/constants/metrics';
import { SKILL_ICONS } from '@/constants/skill-icons';
import type { SkillKey } from '@/types/history';

import { DeltaLabel } from './delta-label';
import { ScoreValue } from './score-value';
import { TickBar } from './tick-bar';

/** Caption line height, held even when a skill has no caption, so every row is
 * the same height and the tick bars below them stay on one grid. */
const CAPTION_HEIGHT = 16;

/**
 * One skill: name, raw-measure caption, score out of 100, change, and a tick
 * meter. Identical on the session summary and on Analytics — only the `caption`
 * and `delta` bases differ ("this session" vs "this week"), which is why both
 * arrive as props rather than being derived here.
 *
 * `score: null` means the skill wasn't measured (a freestyle session has no
 * Articulation, a non-Azure one has no Expression). That renders a dash and an
 * empty track rather than a zero, so "no data" never reads as "you scored 0".
 */
export type SkillRowProps = {
  skill: SkillKey;
  score: number | null;
  /** Raw measure under the name, e.g. "183 wpm · target 179". Omit when the
   * underlying count isn't recorded — Flow and Expression have none today. */
  caption?: string;
  /** Change vs the comparison basis. Omit when there's nothing to compare. */
  delta?: number;
  /** Marks this as the weakest skill. Only ever set on one row per card. */
  focus?: boolean;
};

export function SkillRow({ skill, score, caption, delta, focus = false }: SkillRowProps) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const theme = metricColors[scheme];
  const SkillIcon = SKILL_ICONS[skill];

  return (
    <View style={styles.row}>
      <View style={styles.header}>
        {/* Fixed-width slot keeps names in one vertical lane across all rows. */}
        <View style={styles.iconSlot}>
          <SkillIcon size={18} color={theme.caption} strokeWidth={1.8} />
        </View>

        <View style={styles.text}>
          <View style={styles.nameRow}>
            <Text style={[styles.name, { color: theme.ink }]}>{SKILL_LABELS[skill]}</Text>
            {focus && (
              <View style={[styles.focusPill, { backgroundColor: theme.focusBg }]}>
                <Text style={[styles.focusLabel, { color: theme.focus }]}>FOCUS</Text>
              </View>
            )}
          </View>
          <View style={styles.captionSlot}>
            {caption != null && (
              <Text style={[styles.caption, { color: theme.caption }]} numberOfLines={1}>
                {caption}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.trailing}>
          <ScoreValue value={score} size={22} maxSize={12} />
          {score != null && delta != null && <DeltaLabel delta={delta} hideZero />}
        </View>
      </View>

      <TickBar fill={score != null ? score / 100 : 0} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: 11,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
  },
  iconSlot: {
    width: 18,
    height: 20,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  name: {
    fontSize: 16,
    fontFamily: fonts.semibold,
    lineHeight: 20,
  },
  focusPill: {
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 7,
    borderCurve: 'continuous',
  },
  focusLabel: {
    fontSize: 10,
    fontFamily: fonts.bold,
    letterSpacing: 0.6,
  },
  captionSlot: {
    height: CAPTION_HEIGHT,
    justifyContent: 'center',
  },
  caption: {
    fontSize: 13,
    fontFamily: fonts.regular,
    lineHeight: CAPTION_HEIGHT,
  },
  trailing: {
    flexShrink: 0,
    alignItems: 'flex-end',
    gap: 2,
  },
});
