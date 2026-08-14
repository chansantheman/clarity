import { memo, useCallback, useEffect } from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  ReduceMotion,
  useAnimatedStyle,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type FrameInfo,
  type SharedValue,
} from 'react-native-reanimated';

import { sessionColors } from '@/constants/session-theme';

const BAR_COUNT = 48;
const SAMPLE_MS = 55;
const MIN_HEIGHT = 4;
const MAX_HEIGHT = 40;
const ENVELOPE = Array.from({ length: BAR_COUNT }, (_, i) => 0.35 + 0.65 * Math.sin((Math.PI * i) / (BAR_COUNT - 1)));

const Bar = memo(function Bar({
  index,
  samples,
  pulse,
  breath,
  silent,
  scheme,
}: {
  index: number;
  samples: SharedValue<number[]>;
  pulse: SharedValue<number>;
  breath: SharedValue<number>;
  silent: SharedValue<boolean>;
  scheme: 'light' | 'dark';
}) {
  const theme = sessionColors[scheme];
  const style = useAnimatedStyle(() => {
    const previous = samples.value[Math.max(0, index - 1)] ?? 0;
    const current = samples.value[index] ?? 0;
    const next = samples.value[Math.min(BAR_COUNT - 1, index + 1)] ?? 0;
    const smooth = (previous + current + next) / 3;
    const centerDistance = Math.abs(index - (BAR_COUNT - 1) / 2);
    const wordPulse = pulse.value * (centerDistance < 1 ? 1 : centerDistance < 3 ? 0.6 : 0.3);
    const idleBreath = silent.value && index > 15 && index < 33 ? breath.value * (1 - centerDistance / 24) : 0;
    const level = Math.min(1, smooth + wordPulse * 0.12);
    return {
      height: withTiming(Math.max(MIN_HEIGHT, (MIN_HEIGHT + level * (MAX_HEIGHT - MIN_HEIGHT) + wordPulse * 6 + idleBreath * 3) * ENVELOPE[index]), {
        duration: SAMPLE_MS,
        easing: Easing.out(Easing.quad),
        reduceMotion: ReduceMotion.System,
      }),
      backgroundColor: interpolateColor(level, [0, 1], [theme.waveformBar, theme.accent]),
    };
  });

  return <Animated.View style={[styles.bar, style]} />;
});

export type SpeechRibbonProps = {
  meterLevel: SharedValue<number>;
  currentWordIndex: number;
};

export function SpeechRibbon({ meterLevel, currentWordIndex }: SpeechRibbonProps) {
  const scheme = (useColorScheme() === 'dark' ? 'dark' : 'light') as 'light' | 'dark';
  const samples = useSharedValue<number[]>(new Array(BAR_COUNT).fill(0));
  const accumulated = useSharedValue(0);
  const silentMs = useSharedValue(0);
  const silent = useSharedValue(false);
  const pulse = useSharedValue(0);
  const breath = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  const sample = useCallback((frame: FrameInfo) => {
    'worklet';
    accumulated.value += frame.timeSincePreviousFrame ?? 0;
    const level = meterLevel.value;
    if (level < 0.04) {
      silentMs.value += frame.timeSincePreviousFrame ?? 0;
      if (silentMs.value >= 700) silent.value = true;
    } else {
      silentMs.value = 0;
      silent.value = false;
    }
    if (accumulated.value < SAMPLE_MS) return;
    accumulated.value = 0;
    const next = samples.value.slice(1);
    next.push(level);
    samples.value = next;
  }, [accumulated, meterLevel, samples, silent, silentMs]);
  useFrameCallback(sample);

  useEffect(() => {
    if (currentWordIndex <= 0) return;
    pulse.value = withSequence(
      ReduceMotion.System,
      withTiming(1, { duration: 90, reduceMotion: ReduceMotion.System }),
      withTiming(0, { duration: 220, reduceMotion: ReduceMotion.System }),
    );
  }, [currentWordIndex, pulse]);

  useEffect(() => {
    if (reducedMotion) {
      breath.value = 0;
      return;
    }
    breath.value = withRepeat(
      withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin), reduceMotion: ReduceMotion.System }),
      -1,
      true,
      undefined,
      ReduceMotion.System,
    );
  }, [breath, reducedMotion]);

  return (
    <View style={styles.row} accessibilityLabel="Speech input ribbon">
      {Array.from({ length: BAR_COUNT }, (_, index) => (
        <Bar key={index} index={index} samples={samples} pulse={pulse} breath={breath} silent={silent} scheme={scheme} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly' },
  bar: { width: 3, borderRadius: 1.5 },
});
