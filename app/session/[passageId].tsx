import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo } from 'react';

import { LiveWpm } from '@/components/session/live-wpm';
import { PracticeControls } from '@/components/session/practice-controls';
import { ReadingSession } from '@/components/session/reading-session';
import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { getAnyPassage, modeForId } from '@/lib/passage-catalog';
import { PASSAGES } from '@/constants/passages';

export default function PracticeScreen() {
  const { passageId } = useLocalSearchParams<{ passageId: string }>();
  const found = getAnyPassage(passageId);
  const passage = found ?? PASSAGES[0];

  useMarkInteractive(Boolean(found));

  useEffect(() => {
    if (!found) router.back();
  }, [found]);

  const meta = useMemo(
    () => ({
      mode: modeForId(passage.id),
      passageId: passage.id,
      contentTitle: passage.title,
    }),
    [passage.id, passage.title],
  );

  if (!found) return null;

  return (
    <ReadingSession
      passage={passage}
      meta={meta}
      renderTopBarChild={(session) => (
        <LiveWpm liveWpm={session.liveWpm} targetWpm={passage.targetWpm} />
      )}
      renderControls={(session, handlers) => (
        <PracticeControls
          status={session.status}
          error={session.error}
          elapsedMs={session.elapsedMs}
          meterLevel={session.meterLevel}
          onPauseToggle={handlers.onPauseToggle}
          onRestart={handlers.onRestart}
          onStop={handlers.onStop}
          onErrorDismiss={handlers.onErrorDismiss}
        />
      )}
    />
  );
}
