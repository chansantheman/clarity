/**
 * The metrics vocabulary — one source of truth for how the app talks about a
 * user's speaking. Every screen that shows a number reads from here, so the
 * same concept can't pick up a different name, unit, or color per screen.
 *
 * Three tiers:
 *   1. One hero metric, the "speaking score", always `NN` + `/100` (never `%`).
 *   2. Exactly five skills, same names and same order everywhere.
 *   3. Effort counters (practice time, sessions, streak).
 *
 * PURE module — no React, no imports from `services/`. Safe under bun.
 *
 * Skill icons live in `constants/skill-icons.tsx` instead of here: they're
 * React components (from lucide-react-native), and importing one drags in
 * react-native-svg → react-native, which breaks under bun's plain runtime.
 * `lib/score.ts` and `lib/stats.ts` import this module for `SCORE_BANDS` and
 * `SKILL_ORDER`, and their test scripts must keep running without Metro.
 */

import type { SkillKey } from '@/types/history';

/** The five skills, in the order every surface renders them. The record field
 * names are historical; `SKILL_LABELS` holds what users actually read. */
export const SKILL_ORDER: readonly SkillKey[] = [
  'accuracy',
  'fluency',
  'pace',
  'fillers',
  'intonation',
] as const;

/** User-facing skill names. The ONLY names shown anywhere — chips, drill cards,
 * skill rows, coaching copy. Never surface the raw record field names. */
export const SKILL_LABELS: Record<SkillKey, string> = {
  accuracy: 'Articulation',
  fluency: 'Flow',
  pace: 'Pacing',
  fillers: 'Fillers',
  intonation: 'Expression',
};

/**
 * The one band vocabulary for a 0–100 score, widest band first. Bands are wide
 * so a label feels earned rather than incremental, and they're shared by every
 * screen — a score of 81 reads "Strong" on the summary, Home, and Analytics
 * alike.
 */
export const SCORE_BANDS: readonly { min: number; label: string }[] = [
  { min: 90, label: 'Orator' },
  { min: 75, label: 'Strong' },
  { min: 60, label: 'Steady' },
  { min: 0, label: 'Building' },
] as const;

/**
 * Metric colors. The color rule is encoded by construction: there is no `bad`
 * entry, so no metric can render red.
 *
 *   - Values are always `ink`. A score is never colored by how good it is.
 *   - `positive` is only for an improving delta; `flat` covers flat/declining.
 *   - `focus` is only for the single FOCUS pill on the weakest skill.
 *
 * Dark values are derived from the already-tuned maps in `progress-card.tsx`
 * and `empty-state-card.tsx` so metric surfaces match the rest of the app.
 */
export const metricColors = {
  light: {
    ink: '#111114',
    /** Small unit/suffix after a value ("/100", "min"). */
    unit: '#9A9AA0',
    /** Secondary caption under a skill name. */
    caption: '#9E9EA6',
    /** Eyebrow and counter labels. */
    label: '#77777E',
    positive: '#23A55A',
    positiveBg: '#E7F6EC',
    flat: '#9A9AA0',
    focus: '#A96400',
    focusBg: '#FDEFDC',
    /** Inked portion of a tick meter. */
    tick: '#111114',
    /** Unfilled portion of a tick meter. */
    track: 'rgba(17,17,20,0.10)',
    /** Bars for days other than today. */
    bar: '#C4C4CC',
    /** Stub bar for a day with no data (and for future days). */
    barEmpty: '#E6E6EB',
    divider: '#F1F1F4',
    /** Icon tile behind a record row's glyph. */
    iconTile: '#F2F2F5',
    glassTint: 'rgba(255,255,255,0.45)',
    solidFallback: 'rgba(255,255,255,0.96)',
  },
  dark: {
    ink: '#FFFFFF',
    unit: '#7C7C84',
    caption: '#9E9EA6',
    label: '#9E9EA6',
    positive: '#2ECC71',
    positiveBg: 'rgba(46,204,113,0.16)',
    flat: '#7C7C84',
    focus: '#F0B458',
    focusBg: 'rgba(240,180,88,0.16)',
    tick: '#FFFFFF',
    track: 'rgba(255,255,255,0.14)',
    bar: '#4A4A52',
    barEmpty: 'rgba(255,255,255,0.10)',
    divider: 'rgba(255,255,255,0.08)',
    iconTile: 'rgba(255,255,255,0.08)',
    glassTint: 'rgba(10,10,12,0.55)',
    solidFallback: 'rgba(26,26,30,0.96)',
  },
} as const;

/** One scheme's colors. Widened to `string` so the light and dark maps are
 * interchangeable — `as const` above would otherwise pin each key to its own
 * literal hex and make the two incompatible. */
export type MetricColors = {
  readonly [K in keyof (typeof metricColors)['light']]: string;
};
