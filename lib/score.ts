/**
 * Scoring math — the one definition of what a speaking score is.
 *
 * `sessionSkills` is the keystone: it encodes, once, which of the five skills a
 * given session actually measured. Both the session score (`services/scoring.ts`)
 * and every windowed score (`lib/stats.ts`, Analytics) derive from it, so the
 * hero number and the skill rows printed beneath it can't drift apart.
 *
 * PURE module — no React, no imports from `services/`. This sits at the bottom
 * of the dependency graph: `services/scoring.ts` and `lib/stats.ts` both import
 * from here, never the reverse. Runs under bun for `scripts/test-stats.ts`.
 */

import { SCORE_BANDS, SKILL_ORDER } from '@/constants/metrics';
import type {
  SessionEndedReason,
  SessionMode,
  SkillEstimate,
  SkillKey,
  WordCounts,
} from '@/types/history';

export const clampScore = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

/**
 * A session must clear BOTH floors for its five skills to mean anything. Below
 * them it still counts toward effort (minutes, sessions, streak) but contributes
 * no skill samples.
 *
 * The word count is the real gate; the duration floor only stops "three words in
 * two seconds" from producing a wild pace. Both are set against the actual
 * content: the shortest drill in `constants/drills.ts` is well over 10 words, so
 * no legitimate attempt is refused a score, while a silent take fails on words
 * alone.
 */
export const MIN_SCORED_MS = 8_000;
export const MIN_SCORED_WORDS = 10;

/** A silence this long between spoken words reads as a pause rather than a beat. */
export const PAUSE_MIN_MS = 1_500;

/**
 * Pace as a 0–100 score: full marks inside ±10% of target, falling linearly to
 * zero well outside it.
 *
 * There is deliberately no floor. The old floor of 30 (paired with the same on
 * fillers) meant the speaking score could never realistically fall below ~45, so
 * the whole 0–59 "Building" band was unreachable and week-over-week deltas read
 * as noise. Callers exclude pace entirely when it wasn't measured, so returning
 * 0 here never gets averaged in as a real reading.
 */
export function paceScore(paceWpm: number, targetWpm: number): number {
  if (paceWpm <= 0 || targetWpm <= 0) return 0;
  const ratio = paceWpm / targetWpm;
  let score: number;
  if (ratio >= 0.9 && ratio <= 1.1) score = 100;
  // Zero at 0.4x target (crawling) and 1.7x (racing).
  else if (ratio < 0.9) score = 100 - ((0.9 - ratio) / 0.5) * 100;
  else score = 100 - ((ratio - 1.1) / 0.6) * 100;
  return clampScore(score);
}

/** Filler density as a 0–100 score, zero at 10 per minute. Duration is floored
 * at 10s so a short take isn't crushed by a single "um". */
export function fillerScore(fillerCount: number, durationMs: number): number {
  const minutes = Math.max(durationMs / 60_000, 1 / 6);
  const perMinute = fillerCount / minutes;
  return clampScore(100 - 10 * perMinute);
}

/**
 * Everything needed to score a session. Both `SessionRecord` and
 * `SessionResult` satisfy this structurally, so the same functions work on a
 * just-finished session and on persisted history — which is why no migration
 * or backfill is needed when the score definition changes.
 */
export type ScoreInput = {
  /** Absent means 'passage' (pre-freestyle results). */
  mode?: SessionMode;
  accuracy: number;
  fluency: number;
  intonation: number;
  paceWpm: number;
  targetWpm: number;
  fillerCount: number;
  durationMs: number;
  source: 'azure' | 'live';
  /** Non-filler words the recognizer actually heard. Absent on records written
   * before the field existed, which are grandfathered as scorable — they can't
   * be re-judged, and retroactively unscoring real history is worse than
   * trusting it. */
  spokenWords?: number;
  /** Absent is treated as a deliberate finish. */
  endedReason?: SessionEndedReason;
};

/**
 * Did the user speak enough, and finish deliberately enough, for the five skills
 * to mean anything?
 *
 * Reason is checked first, which is what lets a recovered crash checkpoint carry
 * a record full of zeros without those zeros ever reaching a skill.
 */
export function isScorable(input: ScoreInput): boolean {
  const reason = input.endedReason;
  // Scripture readings count for effort and Bible progress, but KJV/BSB reading
  // at the scripture pace is not comparable to the pronunciation corpus.
  if (input.mode === 'scripture') return false;
  if (reason === 'abandoned' || reason === 'interrupted' || reason === 'error') return false;
  if (input.spokenWords == null) return true;
  return input.durationMs >= MIN_SCORED_MS && input.spokenWords >= MIN_SCORED_WORDS;
}

/**
 * The five skills as 0–100, or null where this session couldn't measure one.
 *
 * Eligibility matters more than it looks: freestyle has no reference text, so
 * its accuracy is a meaningless 0, and intonation is a hardcoded placeholder
 * outside Azure. Both are excluded rather than averaged in — counting them as
 * zero would crater a freestyle session and anchor every live one to 70.
 *
 * THE one eligibility gate. `skillWindow`, `speakingScore`, `skillProfile`,
 * `dailySpeakingScores`, `windowRawMeasures` and `bestSession` all funnel through
 * here, so a session that shouldn't be scored is excluded everywhere at once.
 * Before this gate existed, 15 seconds of silence scored 81 in freestyle and 72
 * on a passage, and counted as practice.
 */
export function sessionSkills(input: ScoreInput): Record<SkillKey, number | null> {
  if (!isScorable(input)) {
    return { accuracy: null, fluency: null, pace: null, fillers: null, intonation: null };
  }
  const freestyle = input.mode === 'freestyle';
  return {
    accuracy: freestyle ? null : input.accuracy,
    fluency: input.fluency,
    pace: input.paceWpm > 0 ? paceScore(input.paceWpm, input.targetWpm) : null,
    fillers: fillerScore(input.fillerCount, input.durationMs),
    intonation: input.source === 'azure' ? input.intonation : null,
  };
}

/** Mean of the values that are present, or null when none are. */
function meanOf(values: readonly (number | null)[]): number | null {
  const present = values.filter((v): v is number => v != null);
  if (present.length === 0) return null;
  return clampScore(present.reduce((sum, v) => sum + v, 0) / present.length);
}

/**
 * Plain (not EWMA) mean per skill across `inputs`, with a sample count so
 * callers can tell "no data" from a genuine low score. Used for windowed views
 * like "this week"; `skillProfile` in `lib/stats.ts` keeps the EWMA that drives
 * recommendations.
 */
export function skillWindow(inputs: readonly ScoreInput[]): Record<SkillKey, SkillEstimate> {
  const out = {} as Record<SkillKey, SkillEstimate>;
  for (const key of SKILL_ORDER) out[key] = { value: 0, samples: 0 };

  for (const input of inputs) {
    const skills = sessionSkills(input);
    for (const key of SKILL_ORDER) {
      const v = skills[key];
      if (v == null) continue;
      const estimate = out[key];
      estimate.value += v;
      estimate.samples += 1;
    }
  }

  for (const key of SKILL_ORDER) {
    const estimate = out[key];
    if (estimate.samples > 0) estimate.value = clampScore(estimate.value / estimate.samples);
  }
  return out;
}

/**
 * The speaking score: the mean of the five skills, over one session or a whole
 * window. null when nothing was measured — callers render an empty state rather
 * than a zero.
 *
 * For a window each skill is averaged first, then the skills are averaged, so
 * every skill counts equally no matter how many sessions were eligible for it.
 */
export function speakingScore(input: ScoreInput | readonly ScoreInput[]): number | null {
  if (Array.isArray(input)) {
    const window = skillWindow(input);
    return meanOf(SKILL_ORDER.map((key) => (window[key].samples > 0 ? window[key].value : null)));
  }
  const skills = sessionSkills(input as ScoreInput);
  return meanOf(SKILL_ORDER.map((key) => skills[key]));
}

/** Band label for a 0–100 score — the app's only score vocabulary. */
export function scoreBand(score: number): string {
  return SCORE_BANDS.find((band) => score >= band.min)?.label ?? SCORE_BANDS[SCORE_BANDS.length - 1].label;
}

/** The lowest-scoring skill with data — the one that earns the FOCUS pill.
 * null when fewer than two skills have data (nothing to single out). */
export function focusSkill(window: Record<SkillKey, SkillEstimate>): SkillKey | null {
  const known = SKILL_ORDER.filter((key) => window[key].samples > 0);
  if (known.length < 2) return null;
  return known.reduce((low, key) => (window[key].value < window[low].value ? key : low), known[0]);
}

/** Share of reference words spoken cleanly, 0–100 — the raw measure behind the
 * Articulation caption. null when no reference words were assessed (freestyle). */
export function cleanWordPct(counts: WordCounts): number | null {
  const assessed = counts.good + counts.mispronounced + counts.omitted;
  if (assessed === 0) return null;
  return Math.round((100 * counts.good) / assessed);
}

/** The raw measures behind the skill captions, in whatever units they were
 * actually measured in. Any of them may be null when the window had no eligible
 * session. */
export type RawMeasures = {
  /** Share of reference words spoken cleanly, 0–100. */
  cleanPct: number | null;
  avgWpm: number | null;
  targetWpm: number | null;
  /** Filler count — per session for a window, total for one session. */
  fillers: number | null;
  /** Pauses over `PAUSE_MIN_MS` — total for one session, mean per session for a
   * window. null when nothing in scope could measure them. */
  pauses: number | null;
  longestPauseMs: number | null;
};

/**
 * Captions that sit under each skill name, giving the raw measure so the units
 * live *below* the score instead of replacing it.
 *
 * Expression is deliberately absent: Azure returns a single prosody score with
 * no underlying measure in the response, so there is no raw quantity to print
 * and restating the score would be noise. Wording lives here so the summary and
 * Analytics can't drift apart on it — only the framing differs.
 */
export function skillCaptions(
  raw: RawMeasures,
  framing: 'window' | 'session',
): Partial<Record<SkillKey, string>> {
  const out: Partial<Record<SkillKey, string>> = {};
  if (raw.cleanPct != null) out.accuracy = `${raw.cleanPct}% of words clean`;
  if (raw.avgWpm != null && raw.targetWpm != null) {
    out.pace = `${Math.round(raw.avgWpm)} wpm · target ${Math.round(raw.targetWpm)}`;
  }
  if (raw.fillers != null) {
    out.fillers =
      framing === 'window'
        ? `${raw.fillers} per session`
        : `${raw.fillers} used`;
  }
  if (raw.pauses != null) {
    if (framing === 'window') {
      out.fluency = `${raw.pauses} ${raw.pauses === 1 ? 'pause' : 'pauses'} per session`;
    } else {
      const longest =
        raw.longestPauseMs != null && raw.longestPauseMs > 0
          ? ` · longest ${(raw.longestPauseMs / 1000).toFixed(1)}s`
          : '';
      out.fluency = `${raw.pauses} ${raw.pauses === 1 ? 'pause' : 'pauses'}${longest}`;
    }
  }
  return out;
}
