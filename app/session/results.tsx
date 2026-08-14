import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SkillCard } from '@/components/metrics';
import { AiCoachingCard } from '@/components/session/ai-coaching-card';
import { PlaybackPill } from '@/components/session/playback-pill';
import { ResultsFooter } from '@/components/session/results-footer';
import { ScoreGauge } from '@/components/session/score-gauge';
import { SessionTopBar } from '@/components/session/session-top-bar';
import { TranscriptCard } from '@/components/session/transcript-card';
import { UnscoredNotice } from '@/components/session/unscored-notice';
import { WordBreakdown } from '@/components/session/word-breakdown';
import { palette } from '@/constants/colors';
import { fonts } from '@/constants/fonts';
import { SKILL_ORDER } from '@/constants/metrics';
import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { useSessionRecords } from '@/hooks/use-session-history';
import {
  cleanWordPct,
  sessionSkills,
  skillCaptions,
  skillWindow,
  speakingScore,
} from '@/lib/score';
import { summarizeWords } from '@/services/ai-coaching';
import type { SkillEstimate, SkillKey } from '@/types/history';

import { useSessionContext } from './_layout';

function dismissToHome() {
  try {
    router.dismissTo('/');
  } catch {
    router.dismissAll();
  }
}

export default function ResultsScreen() {
  const { result, recordId, bumpRetry } = useSessionContext();

  // Without a result the screen renders nothing and pops, so the score is on
  // screen only once `result` exists.
  useMarkInteractive(result != null);

  const insets = useSafeAreaInsets();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const background = palette[scheme].background;
  const records = useSessionRecords();
  // recordSession() runs before this screen is pushed, so the store already holds
  // the session being shown. Drop it or "vs your average" would measure this
  // session partly against the average it just moved, damping every real
  // improvement.
  //
  // Excluded BY ID, not by position: when the attempt wasn't persisted (nothing
  // spoken, or the write failed) there is nothing to drop, and the old
  // `records.slice(0, -1)` then removed the user's previous real session instead.
  const history = useMemo(
    () => (recordId ? records.filter((r) => r.id !== recordId) : records),
    [records, recordId],
  );

  // This session's five skills, plus how each compares to the user's running
  // average. Same shape the Analytics card consumes — one component renders
  // both, so the two screens can't name or order the skills differently.
  const { skills, deltas, captions, averageScore, sessionScore } = useMemo(() => {
    if (!result) {
      return {
        skills: {} as Record<SkillKey, SkillEstimate>,
        deltas: {} as Partial<Record<SkillKey, number>>,
        captions: {} as Partial<Record<SkillKey, string>>,
        averageScore: null as number | null,
        sessionScore: null as number | null,
      };
    }

    const measured = sessionSkills(result);
    const session = {} as Record<SkillKey, SkillEstimate>;
    for (const key of SKILL_ORDER) {
      const value = measured[key];
      session[key] = { value: value ?? 0, samples: value == null ? 0 : 1 };
    }

    const average = skillWindow(history);
    const skillDeltas: Partial<Record<SkillKey, number>> = {};
    for (const key of SKILL_ORDER) {
      if (session[key].samples > 0 && average[key].samples > 0) {
        skillDeltas[key] = session[key].value - average[key].value;
      }
    }

    const { wordCounts } = summarizeWords(result.words);
    return {
      skills: session,
      deltas: skillDeltas,
      captions: skillCaptions(
        {
          cleanPct: cleanWordPct(wordCounts),
          avgWpm: result.paceWpm > 0 ? result.paceWpm : null,
          targetWpm: result.paceWpm > 0 ? result.targetWpm : null,
          fillers: result.fillerCount,
          pauses: result.pauseCount ?? null,
          longestPauseMs: result.longestPauseMs ?? null,
        },
        'session',
      ),
      averageScore: speakingScore(history),
      sessionScore: speakingScore(result),
    };
  }, [result, history]);

  useEffect(() => {
    if (!result) router.back();
  }, [result]);

  // Celebrate the finished session.
  useEffect(() => {
    if (result) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // Fire once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRetry = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    bumpRetry();
    router.back();
  }, [bumpRetry]);

  const handleDone = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    dismissToHome();
  }, []);

  if (!result) return null;

  return (
    <View style={[styles.screen, { backgroundColor: background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + 62,
          paddingBottom: insets.bottom + 150,
          paddingHorizontal: 20,
        }}>
        {/* The DERIVED score, never the persisted one. A session below the
            scoring floor has no score at all, and `overallScore` would render a
            confident 0 rather than saying so. */}
        {sessionScore != null ? (
          <ScoreGauge
            score={sessionScore}
            delta={averageScore != null ? sessionScore - averageScore : undefined}
          />
        ) : (
          <UnscoredNotice
            title={recordId == null ? "We didn't hear anything" : 'Too short to score'}
            detail={
              recordId == null
                ? 'Check that your mic is enabled and try speaking a little closer to it.'
                : 'It still counts toward your practice time and your streak.'
            }
          />
        )}
        <View style={styles.playback}>
          <PlaybackPill result={result} />
        </View>
        <View style={styles.skillsHeader}>
          <Text style={[styles.sectionTitle, { color: palette[scheme].foreground }]}>Skills</Text>
          <Text style={[styles.sectionSubtitle, { color: scheme === 'dark' ? '#9E9EA6' : '#77777E' }]}>
            How this session compares to your average
          </Text>
        </View>
        <SkillCard skills={skills} captions={captions} deltas={deltas} />
        {result.mode !== 'scripture' ? (
          <View style={styles.coaching}>
            <AiCoachingCard result={result} />
          </View>
        ) : null}
        <View style={styles.breakdown}>
          {result.mode === 'freestyle' ? (
            <TranscriptCard transcript={result.transcript ?? ''} />
          ) : (
            <WordBreakdown words={result.words} />
          )}
        </View>
      </ScrollView>

      <SessionTopBar onDismiss={handleDone}>
        <Text style={[styles.title, { color: palette[scheme].foreground }]}>
          Session Complete
        </Text>
      </SessionTopBar>
      <ResultsFooter onRetry={handleRetry} onDone={handleDone} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  title: {
    fontSize: 21,
    fontFamily: fonts.semibold,
    letterSpacing: -0.3,
  },
  playback: {
    marginTop: 10,
  },
  skillsHeader: {
    marginTop: 26,
    marginBottom: 12,
    gap: 4,
  },
  sectionTitle: {
    fontSize: 22,
    fontFamily: fonts.bold,
    letterSpacing: -0.3,
  },
  sectionSubtitle: {
    fontSize: 15,
    fontFamily: fonts.regular,
  },
  coaching: {
    marginTop: 28,
  },
  breakdown: {
    marginTop: 28,
  },
});
