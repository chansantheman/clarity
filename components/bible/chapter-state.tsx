import { Check, Play } from 'lucide-react-native';
import { useEffect } from 'react';
import { StyleSheet, Text, useColorScheme, View } from 'react-native';
import Animated, { Easing, ReduceMotion, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { fonts } from '@/constants/fonts';
import { metricColors } from '@/constants/metrics';
import { sessionColors } from '@/constants/session-theme';

const SIZE = 34;
const STROKE = 3;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export type ChapterStateProps = {
  progress: number;
  complete: boolean;
  showLabel?: boolean;
};

export function ChapterState({ progress, complete, showLabel = true }: ChapterStateProps) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = metricColors[scheme];
  const session = sessionColors[scheme];
  const clamped = Math.max(0, Math.min(1, progress));
  const fill = useSharedValue(0);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRCUMFERENCE * (1 - fill.value),
  }));

  useEffect(() => {
    fill.value = withTiming(clamped, {
      duration: 900,
      easing: Easing.out(Easing.cubic),
      reduceMotion: ReduceMotion.System,
    });
  }, [clamped, fill]);

  if (complete) {
    return (
      <View style={[styles.circle, { backgroundColor: colors.positive }]}>
        <Check size={18} color="#FFFFFF" strokeWidth={2.5} />
      </View>
    );
  }

  if (clamped <= 0) {
    const text = scheme === 'dark' ? '#111114' : '#FFFFFF';
    const background = scheme === 'dark' ? '#F2F2F5' : '#1C1C21';
    return (
      <View style={[styles.circle, { backgroundColor: background }]}>
        <Play size={13} color={text} fill={text} />
      </View>
    );
  }

  return (
    <View style={styles.circle}>
      <Svg width={SIZE} height={SIZE} style={styles.ring}>
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={scheme === 'dark' ? 'rgba(255,255,255,0.16)' : 'rgba(17,17,20,0.14)'}
          strokeWidth={STROKE}
          fill="none"
        />
        <AnimatedCircle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={session.accent}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
          fill="none"
          animatedProps={animatedProps}
        />
      </Svg>
      {showLabel ? (
        <Text style={[styles.label, { color: colors.ink }]}>{Math.floor(clamped * 100)}%</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    transform: [{ rotate: '-90deg' }],
  },
  label: {
    fontSize: 11,
    fontFamily: fonts.bold,
  },
});
