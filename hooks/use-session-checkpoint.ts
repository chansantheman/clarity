import { useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';

import { beginSession, checkpointSession, endSession } from '@/services/session-history';
import type { PracticeStatus } from '@/types/session';
import type { InflightSession } from '@/types/history';

/** How often the live session's progress is written down. Cheap: one small key,
 * overwritten in place. */
const CHECKPOINT_INTERVAL_MS = 5_000;

export type SessionCheckpointArgs = {
  status: PracticeStatus;
  elapsedMs: number;
  spokenWords: number;
  fillerCount: number;
  meta: Omit<InflightSession, 'startedAt' | 'updatedAt' | 'elapsedMs' | 'spokenWords' | 'fillerCount'>;
  /** Called when the app backgrounds mid-session. */
  onBackground: () => void;
};

export type SessionCheckpointHandle = {
  /**
   * Clear the checkpoint. MUST be called once the attempt has been persisted (or
   * definitively discarded) — see the lifecycle note below.
   */
  end: () => void;
  /** Re-arm for a fresh attempt on the same screen, after a restart. */
  begin: () => void;
};

/**
 * Keeps a crash-recoverable record of the live session, and pauses it when the
 * app leaves the foreground.
 *
 * Without this, a session the app was killed during vanished completely, which is
 * a large part of why practice minutes systematically undercounted real usage.
 * The checkpoint is a single key overwritten every few seconds; the next launch
 * turns a stale one into an `interrupted` record (see `lib/history-store.ts`).
 *
 * Backgrounding pauses rather than stopping, and deliberately does NOT auto-resume
 * on return: the user left, so coming back should be their choice.
 *
 * LIFECYCLE. Clearing the checkpoint is the CALLER's job, via `end()`, and it must
 * happen exactly when the attempt has been written down. Unmount is the wrong
 * trigger in both directions: `router.push('/session/results')` does not unmount
 * the practice screen, so a finished session's checkpoint would linger and be
 * recovered a second time on the next launch (double-counting its minutes); and
 * the dismiss path unmounts *while* its fire-and-forget `stop()` is still
 * processing, so clearing on unmount would delete the very checkpoint that covers
 * those seconds.
 */
export function useSessionCheckpoint({
  status,
  elapsedMs,
  spokenWords,
  fillerCount,
  meta,
  onBackground,
}: SessionCheckpointArgs): SessionCheckpointHandle {
  // Live values read by the interval and the AppState handler without making
  // either of them re-subscribe on every tick.
  const latest = useRef({ status, elapsedMs, spokenWords, fillerCount, onBackground });
  const previousStatus = useRef(status);
  useEffect(() => {
    const wasListening = previousStatus.current === 'listening';
    latest.current = { status, elapsedMs, spokenWords, fillerCount, onBackground };
    previousStatus.current = status;
    if (wasListening && status === 'paused') {
      // The interval only flushes while listening. Persist the exact active
      // frontier at the pause boundary before the user can be killed in the
      // paused state.
      checkpointSession({ elapsedMs, spokenWords, fillerCount });
    }
  }, [status, elapsedMs, spokenWords, fillerCount, onBackground]);

  const metaRef = useRef(meta);
  useEffect(() => {
    metaRef.current = meta;
  }, [meta]);

  useEffect(() => {
    beginSession({ ...metaRef.current, elapsedMs: 0, spokenWords: 0, fillerCount: 0 });

    const flush = () => {
      const { elapsedMs: ms, spokenWords: words, fillerCount: fillers } = latest.current;
      checkpointSession({ elapsedMs: ms, spokenWords: words, fillerCount: fillers });
    };

    const timer = setInterval(() => {
      if (latest.current.status === 'listening') flush();
    }, CHECKPOINT_INTERVAL_MS);

    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') return;
      // Flush before pausing: pause() banks the active ms, and if the OS kills us
      // while suspended this is the last thing written down.
      flush();
      if (latest.current.status === 'listening') latest.current.onBackground();
    });

    return () => {
      clearInterval(timer);
      sub.remove();
      // Deliberately NOT endSession(): see the lifecycle note above. A checkpoint
      // outliving this screen is recovered next launch, which is the whole point.
    };
    // Mount/unmount only; everything live is read through the refs above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return useMemo(
    () => ({
      end: endSession,
      begin: () =>
        beginSession({ ...metaRef.current, elapsedMs: 0, spokenWords: 0, fillerCount: 0 }),
    }),
    [],
  );
}
