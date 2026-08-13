import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, useColorScheme, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ReactNode } from 'react';

import { SessionTopBar } from '@/components/session/session-top-bar';
import { Teleprompter, type TeleprompterColors } from '@/components/session/teleprompter';
import { palette } from '@/constants/colors';
import { sessionColors, TELEPROMPTER_TEXT_SIZES } from '@/constants/session-theme';
import { usePracticeSession, type PracticeSession } from '@/hooks/use-practice-session';
import { useSessionCheckpoint } from '@/hooks/use-session-checkpoint';
import { tokenizePassage } from '@/lib/passage-text';
import { recordSession } from '@/services/session-history';
import type { SessionEndedReason, SessionMode } from '@/types/history';
import type { Passage } from '@/types/session';
import { useSessionContext } from '@/app/session/_layout';

function dismissToHome() {
  try {
    router.dismissTo('/');
  } catch {
    router.dismissAll();
  }
}

export type SessionHandlers = {
  onPauseToggle: () => void;
  onRestart: () => void;
  onStop: () => void;
  onErrorDismiss: () => void;
};

export type WriteResult = ReturnType<typeof recordSession>;

export type ReadingSessionProps = {
  passage: Passage;
  meta: { mode: SessionMode; passageId?: string; topicId?: string; contentTitle?: string };
  renderTopBarChild: (s: PracticeSession) => ReactNode;
  renderControls: (s: PracticeSession, h: SessionHandlers) => ReactNode;
  onFinished?: (result: any, endedReason: SessionEndedReason, written: WriteResult) => void;
  onWordIndex?: (index: number) => void;
};

export function ReadingSession({
  passage,
  meta,
  renderTopBarChild,
  renderControls,
  onFinished,
  onWordIndex,
}: ReadingSessionProps) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = sessionColors[scheme];
  const screenPalette = palette[scheme];
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { setResult, retryToken } = useSessionContext();

  const session = usePracticeSession(passage);
  const tokenized = useMemo(() => tokenizePassage(passage.text), [passage.text]);

  const [sizeIndex, setSizeIndex] = useState(1);
  const fontSize = TELEPROMPTER_TEXT_SIZES[sizeIndex];

  const sessionRef = useRef(session);
  const navigatedRef = useRef(false);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const prevWordIndexRef = useRef(session.currentWordIndex);
  useEffect(() => {
    if (session.currentWordIndex !== prevWordIndexRef.current) {
      prevWordIndexRef.current = session.currentWordIndex;
      onWordIndex?.(session.currentWordIndex);
    }
  }, [session.currentWordIndex, onWordIndex]);

  useEffect(() => {
    sessionRef.current.start();
    return () => {
      const s = sessionRef.current;
      if (s.status === 'listening' || s.status === 'paused') s.cancel();
    };
  }, []);

  const prevRetryRef = useRef(retryToken);
  useEffect(() => {
    if (retryToken === prevRetryRef.current) return;
    prevRetryRef.current = retryToken;
    navigatedRef.current = false;
    sessionRef.current.restart();
  }, [retryToken]);

  const checkpoint = useSessionCheckpoint({
    status: session.status,
    elapsedMs: session.elapsedMs,
    spokenWords: session.currentWordIndex,
    fillerCount: session.fillerCount,
    meta: { ...meta, targetWpm: passage.targetWpm },
    onBackground: () => sessionRef.current.pause(),
  });

  const finishSession = useCallback(
    async (endedReason: SessionEndedReason = 'stopped') => {
      if (navigatedRef.current) return;
      navigatedRef.current = true;
      try {
        const result = await sessionRef.current.stop();
        const written = recordSession(result, { ...meta, endedReason });
        checkpoint.end();
        setResult(result, written.ok ? written.record.id : null);
        onFinished?.(result, endedReason, written);
        router.push('/session/results');
      } catch {
        navigatedRef.current = false;
      }
    },
    [setResult, meta, checkpoint, onFinished],
  );

  useEffect(() => {
    if (session.status === 'done') finishSession('completed');
  }, [session.status, finishSession]);

  const handleDismiss = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const s = sessionRef.current;
    const live = s.status === 'listening' || s.status === 'paused';
    navigatedRef.current = true;
    if (live) {
      void s
        .stop()
        .then((result) => recordSession(result, { ...meta, endedReason: 'abandoned' }))
        .catch(() => {})
        .finally(() => checkpoint.end());
    } else {
      checkpoint.end();
    }
    dismissToHome();
  }, [meta, checkpoint]);

  const handleTextSize = useCallback(() => {
    Haptics.selectionAsync();
    setSizeIndex((i) => (i + 1) % TELEPROMPTER_TEXT_SIZES.length);
  }, []);

  const handlePauseToggle = useCallback(() => {
    const s = sessionRef.current;
    if (s.status === 'listening') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      s.pause();
    } else if (s.status === 'paused') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      s.resume();
    }
  }, []);

  const handleRestart = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const s = sessionRef.current;
    if (s.status !== 'listening' && s.status !== 'paused') {
      navigatedRef.current = false;
      s.restart();
      return;
    }
    navigatedRef.current = true;
    void s
      .stop()
      .then((result) => recordSession(result, { ...meta, endedReason: 'abandoned' }))
      .catch(() => {})
      .finally(() => {
        navigatedRef.current = false;
        sessionRef.current.restart();
        checkpoint.begin();
      });
  }, [meta, checkpoint]);

  const handleStop = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    finishSession('stopped');
  }, [finishSession]);

  const teleColors: TeleprompterColors = useMemo(
    () => ({
      foreground: screenPalette.foreground,
      dimmed: colors.dimmed,
      accent: colors.accent,
      accentFaded: colors.accentFaded,
    }),
    [screenPalette, colors],
  );

  const contentTop = insets.top + 82;
  const handlers = useMemo(() => ({
    onPauseToggle: handlePauseToggle,
    onRestart: handleRestart,
    onStop: handleStop,
    onErrorDismiss: handleDismiss
  }), [handlePauseToggle, handleRestart, handleStop, handleDismiss]);

  return (
    <View style={[styles.screen, { backgroundColor: screenPalette.background }]}>
      <Teleprompter
        tokenized={tokenized}
        currentWordIndex={session.currentWordIndex}
        wordProgress={session.currentWordFraction}
        fontSize={fontSize}
        colors={teleColors}
        topInset={contentTop}
        bottomInset={windowHeight * 0.55}
      />

      <SessionTopBar onDismiss={handleDismiss} onTextSize={handleTextSize}>
        {renderTopBarChild(session)}
      </SessionTopBar>

      {renderControls(session, handlers)}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
});
