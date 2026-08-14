import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { ArrowRight, Check, Pause, Play, RotateCcw } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import Animated, { cancelAnimation, Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CHROME_BLUR_BLEED, ProgressiveBlur } from '@/components/glass-tabs';
import { SpeechRibbon } from '@/components/session/speech-ribbon';
import { fonts } from '@/constants/fonts';
import { palette } from '@/constants/colors';
import { sessionColors } from '@/constants/session-theme';
import type { PracticeError, PracticeStatus } from '@/types/session';
import type { SharedValue } from 'react-native-reanimated';

const CIRCLE = 56;

export type BibleControlsProps = {
  status: PracticeStatus;
  error: PracticeError | null;
  meterLevel: SharedValue<number>;
  currentWordIndex: number;
  totalWords: number;
  nextLabel: string;
  onPauseToggle: () => void;
  onRestart: () => void;
  onFinish: () => void;
  onDismiss: () => void;
  onContinue: () => void;
};

export function BibleControls({
  status,
  error,
  meterLevel,
  currentWordIndex,
  totalWords,
  nextLabel,
  onPauseToggle,
  onRestart,
  onFinish,
  onDismiss,
  onContinue,
}: BibleControlsProps) {
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const theme = sessionColors[scheme];
  const foreground = palette[scheme].foreground;
  const secondary = scheme === 'dark' ? '#9E9EA6' : '#77777E';
  const hasGlass = isLiquidGlassAvailable();
  const progress = Math.max(0, Math.min(1, totalWords === 0 ? 0 : currentWordIndex / totalWords));
  const hairline = useSharedValue(0);
  const autoContinue = useSharedValue(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelAutoContinue = () => {
    cancelAnimation(autoContinue);
    autoContinue.value = 0;
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    hairline.value = withTiming(progress, { duration: 150, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System });
  }, [hairline, progress]);

  useEffect(() => {
    cancelAutoContinue();
    if (status !== 'done') return;
    autoContinue.value = 0;
    autoContinue.value = withTiming(1, { duration: 3000, easing: Easing.linear, reduceMotion: ReduceMotion.System });
    timerRef.current = setTimeout(onContinue, 3000);
    return cancelAutoContinue;
  }, [autoContinue, onContinue, status]);

  const hairlineStyle = useAnimatedStyle(() => ({ width: `${autoContinue.value * 100}%` }));
  const progressStyle = useAnimatedStyle(() => ({ width: `${hairline.value * 100}%` }));
  const processing = status === 'processing';
  const paused = status === 'paused';
  const done = status === 'done';

  const card = (
    <View style={styles.cardContent} onTouchStart={done ? cancelAutoContinue : undefined}>
      <View style={[styles.progressTrack, { backgroundColor: `${theme.accent}1F` }]}>
        <Animated.View style={[styles.progressFill, { backgroundColor: theme.accent }, progressStyle]} />
      </View>
      {status === 'error' ? (
        <View style={styles.errorWrap}>
          <Text style={[styles.errorTitle, { color: foreground }]}>Something went wrong</Text>
          <Text style={[styles.errorMessage, { color: secondary }]}>{error?.message ?? 'Speech recognition is unavailable right now.'}</Text>
          <View style={styles.controlsRow}>
            <Pressable onPress={onDismiss} style={[styles.smallPill, { backgroundColor: theme.circleButton }]}><Text style={[styles.label, { color: foreground }]}>Dismiss</Text></Pressable>
            <Pressable onPress={onRestart} style={[styles.smallPill, { backgroundColor: theme.pillDark }]}><Text style={[styles.label, { color: theme.pillDarkText }]}>Try Again</Text></Pressable>
          </View>
        </View>
      ) : (
        <>
          <SpeechRibbon meterLevel={meterLevel} currentWordIndex={currentWordIndex} />
          <View style={styles.controlsRow}>
            <Pressable onPress={onRestart} disabled={processing} style={[styles.circle, { backgroundColor: theme.circleButton }]}>
              <RotateCcw size={24} color={foreground} strokeWidth={1.8} />
            </Pressable>
            <Pressable onPress={done ? onContinue : onPauseToggle} disabled={processing && !done} style={[styles.pill, { backgroundColor: done ? theme.accent : theme.pillDark }]}>
              {done ? <ArrowRight size={20} color="#FFFFFF" strokeWidth={2.2} /> : processing ? <ActivityIndicator size="small" color={theme.pillDarkText} /> : paused ? <Play size={20} color={theme.pillDarkText} fill={theme.pillDarkText} /> : <Pause size={20} color={theme.pillDarkText} fill={theme.pillDarkText} />}
              <Text numberOfLines={1} style={[styles.label, { color: done ? '#FFFFFF' : theme.pillDarkText }]}>{done ? `Continue to ${nextLabel}` : processing ? 'Saving…' : paused ? 'Resume' : 'Pause'}</Text>
              {done ? <Animated.View style={[styles.autoHairline, { backgroundColor: 'rgba(255,255,255,0.35)' }, hairlineStyle]} /> : null}
            </Pressable>
            <Pressable onPress={onFinish} disabled={processing || done} style={[styles.circle, { backgroundColor: theme.circleButton }]}>
              <Check size={22} color={foreground} strokeWidth={2.5} />
            </Pressable>
          </View>
        </>
      )}
    </View>
  );

  return (
    <View style={[styles.wrap, { bottom: insets.bottom + 8 }]} pointerEvents="box-none">
      <ProgressiveBlur direction="bottom" tint={scheme} style={[styles.blur, { top: -CHROME_BLUR_BLEED, bottom: -(insets.bottom + 8) }]} />
      <View style={styles.card}>
        {hasGlass ? <GlassView glassEffectStyle="regular" style={[StyleSheet.absoluteFill, styles.shape, { backgroundColor: theme.controlCard }]} /> : <View style={[StyleSheet.absoluteFill, styles.shape, { backgroundColor: theme.controlCardSolid }]} />}
        {card}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12 },
  blur: { position: 'absolute', left: -12, right: -12 },
  card: { borderRadius: 40, borderCurve: 'continuous', overflow: 'hidden' },
  shape: { borderRadius: 40, borderCurve: 'continuous' },
  cardContent: { padding: 16 },
  progressTrack: { position: 'absolute', top: 0, left: 8, right: 8, height: 2, borderRadius: 1, overflow: 'hidden' },
  progressFill: { height: 2, borderRadius: 1 },
  controlsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 },
  circle: { width: CIRCLE, height: CIRCLE, borderRadius: CIRCLE / 2, alignItems: 'center', justifyContent: 'center' },
  pill: { flex: 1, height: CIRCLE, borderRadius: CIRCLE / 2, borderCurve: 'continuous', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12, position: 'relative', overflow: 'hidden' },
  smallPill: { height: CIRCLE, paddingHorizontal: 20, borderRadius: CIRCLE / 2, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 17, fontFamily: fonts.semibold },
  autoHairline: { position: 'absolute', left: 20, right: 20, bottom: 0, height: 2 },
  errorWrap: { alignItems: 'center', paddingTop: 6 },
  errorTitle: { fontSize: 17, fontFamily: fonts.semibold },
  errorMessage: { fontSize: 14, fontFamily: fonts.medium, textAlign: 'center', marginTop: 4, paddingHorizontal: 8 },
});
