import * as Haptics from 'expo-haptics';
import { useEffect, useRef } from 'react';
import { StyleSheet, Text, useColorScheme, View } from 'react-native';
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { AnimatedRoundedNumber } from '@/components/animated-rounded-number';
import { fonts } from '@/constants/fonts';
import { sessionColors } from '@/constants/session-theme';
import { bookById, type TranslationCode } from '@/lib/bible/canon';

export type VerseReferenceProps = {
  code: TranslationCode;
  book: number;
  chapter: number;
  verse: number;
  verseCount: number;
};

export function VerseReference({ code, book, chapter, verse, verseCount }: VerseReferenceProps) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = sessionColors[scheme];
  const secondary = scheme === 'dark' ? '#9E9EA6' : '#77777E';
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);
  const scale = useSharedValue(1);
  const previous = useRef({ book, chapter });
  const bookName = bookById(book)?.name ?? '';

  useEffect(() => {
    const crossedChapter = previous.current.book !== book || previous.current.chapter !== chapter;
    previous.current = { book, chapter };
    translateY.value = 6;
    opacity.value = 0.35;
    translateY.value = withTiming(0, { duration: 260, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System });
    opacity.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System });
    if (crossedChapter) {
      scale.value = 0.94;
      scale.value = withSpring(1, { damping: 32, stiffness: 420, mass: 0.9, reduceMotion: ReduceMotion.System });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [book, chapter, opacity, scale, translateY]);

  const animation = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.wrap, animation]}>
      <View style={styles.refBox}>
        <Text style={[styles.staticRef, { color: colors.accent }]}>{`${bookName} ${chapter}:`}</Text>
        <View style={styles.numberBox}>
          <AnimatedRoundedNumber
            text={`${verse}`}
            value={verse}
            color={colors.accent}
            fontSize={20}
            fontFamily={fonts.semibold}
            weight="semibold"
            duration={0.35}
          />
        </View>
      </View>
      <Text style={[styles.caption, { color: secondary }]}>{`${code} · verse ${verse} of ${verseCount}`}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 1 },
  refBox: { height: 25, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center' },
  staticRef: { fontSize: 20, fontFamily: fonts.semibold, height: 25, lineHeight: 25 },
  numberBox: { height: 25, minWidth: 20, justifyContent: 'center' },
  caption: { fontSize: 13, fontFamily: fonts.medium },
});
