import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, StyleSheet, useColorScheme, useWindowDimensions, View } from 'react-native';
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
import type { Passage, SessionResult } from '@/types/session';
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
  onContinue: () => void;
};

export type WriteResult = ReturnType<typeof recordSession>;

export type ReadingSessionProps = {
  passage: Passage;
  meta: { mode: SessionMode; passageId?: string; topicId?: string; contentTitle?: string };
  renderTopBarChild: (s: PracticeSession) => ReactNode;
  renderControls: (s: PracticeSession, h: SessionHandlers) => ReactNode;
  onFinished?: (result: SessionResult, endedReason: SessionEndedReason, written: WriteResult) => void;
  onWordIndex?: (index: number) => void;
  /** Bible sessions hold the completed state for the next-chapter affordance. */
  navigateToResults?: boolean;
  onContinue?: () => void;
};

export function ReadingSession({
  passage,
  meta,
  renderTopBarChild,
  renderControls,
  onFinished,
  onWordIndex,
  navigateToResults = true,
  onContinue,
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
  const terminalRef = useRef(false);

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
    void sessionRef.current.start();
    return () => {
      // A terminal operation may have already called stop() and navigated away;
      // cancelling here would abort its audio processing and delete its files.
      const s = sessionRef.current;
      if (!terminalRef.current && (s.status === 'listening' || s.status === 'paused')) s.cancel();
    };
  }, []);

  const prevRetryRef = useRef(retryToken);

  const checkpoint = useSessionCheckpoint({
    status: session.status,
    elapsedMs: session.elapsedMs,
    spokenWords: session.currentWordIndex,
    fillerCount: session.fillerCount,
    meta: { ...meta, targetWpm: passage.targetWpm },
    onBackground: () => sessionRef.current.pause(),
  });

  useEffect(() => {
    if (retryToken === prevRetryRef.current) return;
    prevRetryRef.current = retryToken;
    navigatedRef.current = false;
    terminalRef.current = false;
    sessionRef.current.restart();
    checkpoint.begin();
  }, [checkpoint, retryToken]);

  const finishSession = useCallback(
    async (endedReason: SessionEndedReason = 'stopped') => {
      if (navigatedRef.current) return;
      navigatedRef.current = true;
      terminalRef.current = true;
      try {
        const rawResult = await sessionRef.current.stop();
        const result = meta.mode === 'scripture' ? { ...rawResult, mode: 'scripture' as const } : rawResult;
        const written = recordSession(result, { ...meta, endedReason });
        // A failed durable write must leave the checkpoint available for crash
        // recovery. Silence is a deliberate discard and can be cleared safely.
        if (written.ok || (written.ok === false && written.reason === 'no-speech')) checkpoint.end();
        setResult(result, written.ok ? written.record.id : null);
        onFinished?.(result, endedReason, written);
        if (navigateToResults) router.push('/session/results');
      } catch {
        navigatedRef.current = false;
      }
    },
    [setResult, meta, checkpoint, onFinished, navigateToResults],
  );

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!terminalRef.current) {
        void finishSession('stopped');
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [finishSession]);

  useEffect(() => {
    if (session.status === 'done') finishSession('completed');
  }, [session.status, finishSession]);

  const handleDismiss = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const s = sessionRef.current;
    if (s.status === 'processing') return;
    const shouldPersist = s.status === 'listening' || s.status === 'paused' || s.status === 'error';
    navigatedRef.current = true;
    terminalRef.current = true;
    if (shouldPersist) {
      const endedReason: SessionEndedReason = s.status === 'error' ? 'error' : 'abandoned';
      void s
        .stop()
        .then((result) => {
          const written = recordSession(result, { ...meta, endedReason });
          if (written.ok || (written.ok === false && written.reason === 'no-speech')) checkpoint.end();
        })
        .catch(() => {});
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
      terminalRef.current = false;
      s.restart();
      checkpoint.begin();
      return;
    }
    navigatedRef.current = true;
    terminalRef.current = true;
    void s
      .stop()
      .then((result) => recordSession(result, { ...meta, endedReason: 'abandoned' }))
      .catch(() => {})
      .finally(() => {
        navigatedRef.current = false;
        terminalRef.current = false;
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
    onErrorDismiss: handleDismiss,
    onContinue: onContinue ?? (() => router.push('/session/results')),
  }), [handlePauseToggle, handleRestart, handleStop, handleDismiss, onContinue]);

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
