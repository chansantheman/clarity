/** Persisted practice-history types: the slim per-session record everything
 * (Home stats, Practice recommendations, Analytics) derives from. */

export type SkillKey = 'accuracy' | 'fluency' | 'intonation' | 'pace' | 'fillers';

export type SessionMode = 'passage' | 'drill' | 'freestyle' | 'scripture';

/**
 * How a session ended. Only 'completed' and 'stopped' are scorable: the others
 * left the passage partly unread, so their accuracy and completeness would be
 * low through no fault of the speaker. They still count toward effort (minutes,
 * sessions, streak) — see `isScorable` in `lib/score.ts`, which is the one place
 * that decision is encoded.
 */
export type SessionEndedReason =
  | 'completed'
  | 'stopped'
  | 'abandoned'
  | 'interrupted'
  | 'error';

export type WordCounts = {
  good: number;
  mispronounced: number;
  omitted: number;
  inserted: number;
};

/** Current on-disk shape of a `SessionRecord`. Bump when a field changes meaning
 * (not when one is added), and add the corresponding step to `upgradeRecord`. */
export const RECORD_SCHEMA_VERSION = 2;

/**
 * One completed practice attempt. Deliberately scalar-only: per-word arrays,
 * audio URIs (cache files that get purged), and waveforms are dropped —
 * `wordCounts` + `challengingWords` are all downstream consumers need.
 *
 * RAW MEASURES ONLY. There is deliberately no persisted score: every consumer
 * recomputes via `speakingScore(record)` from the inputs below, which is why
 * changing the score definition needs no migration or backfill.
 */
export type SessionRecord = {
  /** Record schema version; see `RECORD_SCHEMA_VERSION`. */
  v: number;
  /** Also the storage key, so deletes and import dedupe are key operations. */
  id: string;
  /**
   * Monotonic write counter. Insertion order stays recoverable even if the
   * device clock jumps backwards, which `completedAt` alone cannot survive.
   */
  seq: number;
  /** Epoch ms. */
  completedAt: number;
  /**
   * `Date.getTimezoneOffset()` captured at record time, so "the day I
   * practiced" stays the local day where the user actually was. Re-deriving it
   * from the current device offset would let a flight or a DST change
   * retroactively re-bucket past history and break streaks.
   */
  tzOffsetMinutes: number;
  mode: SessionMode;
  endedReason: SessionEndedReason;
  /** Set for passage & drill modes. */
  passageId?: string;
  /** Set for freestyle mode. */
  topicId?: string;
  /** Display label snapshotted at write time, so deleting a custom passage
   * doesn't orphan the record's identity. */
  contentTitle?: string;
  /** Active speaking time, pauses excluded (matches SessionResult.durationMs). */
  durationMs: number;
  accuracy: number;
  fluency: number;
  completeness: number;
  intonation: number;
  paceWpm: number;
  targetWpm: number;
  fillerCount: number;
  /**
   * Words the recognizer actually heard. This is what separates a real attempt
   * from silence, which the old duration-only guard let through. Absent on
   * records migrated from schema v1, where it was never captured — `isScorable`
   * only applies the word floor when it is present, so old history survives.
   */
  spokenWords?: number;
  /** Silences over `PAUSE_THRESHOLD_MS` between spoken words. Absent when the
   * session had no word timings to measure (e.g. freestyle). */
  pauseCount?: number;
  longestPauseMs?: number;
  /** 'live' scores are derived proxies; intonation is a placeholder there. */
  source: 'azure' | 'live';
  wordCounts: WordCounts;
  /** Top ≤5 trouble words, hardest first. Insertions are excluded — a filler is
   * already penalized through `fillerCount`, so it isn't a word to master. */
  challengingWords: string[];
  /** Provenance for debugging a record that looks wrong. */
  appVersion?: string;
};

/** EWMA skill estimate; `samples` gates whether the skill is "known". */
export type SkillEstimate = {
  value: number;
  samples: number;
};

export type SkillProfile = Record<SkillKey, SkillEstimate>;

/** Running per-word aggregate, one per distinct normalized word. Kept in its own
 * key namespace rather than on the session record: `challengingWords` only ever
 * held a lossy top-5, which can't answer "is this word improving?". */
export type WordStat = {
  word: string;
  /** Times the word was assessed at all. */
  seen: number;
  clean: number;
  mispronounced: number;
  omitted: number;
  /** Consecutive clean assessments, reset by any miss — drives "mastered". */
  cleanStreak: number;
  /** True once the word has ever been missed, so a word that was never hard
   * doesn't count as "mastered". */
  everMissed: boolean;
  firstSeenAt: number;
  lastSeenAt: number;
};

/** A live session's periodically-overwritten checkpoint. Lets the next launch
 * recover practice time from a session the app was killed during, instead of
 * losing it entirely. */
export type InflightSession = {
  startedAt: number;
  updatedAt: number;
  mode: SessionMode;
  passageId?: string;
  topicId?: string;
  contentTitle?: string;
  targetWpm: number;
  elapsedMs: number;
  spokenWords: number;
  fillerCount: number;
};
