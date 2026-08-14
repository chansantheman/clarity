import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';

import { ChapterState } from '@/components/bible/chapter-state';
import { divisionForBook } from '@/constants/bible-art';
import { fonts } from '@/constants/fonts';
import { formatRelativeRead, formatReadCount } from '@/lib/bible-format';
import type { BookMeta } from '@/lib/bible/canon';

export type BookRowProgress = {
  complete: number;
  chapters: number;
  percent: number;
  lastReadAt: number | null;
};

export type BookRowProps = {
  book: BookMeta;
  progress: BookRowProgress;
  onPress: (book: BookMeta) => void;
};

export function BookRow({ book, progress, onPress }: BookRowProps) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const hasGlass = isLiquidGlassAvailable();
  const theme = scheme === 'dark'
    ? { glass: 'rgba(10,10,12,0.55)', fallback: 'rgba(26,26,30,0.96)', foreground: '#FFFFFF', secondary: '#9E9EA6' }
    : { glass: 'rgba(255,255,255,0.45)', fallback: 'rgba(244,244,246,0.96)', foreground: '#111114', secondary: '#77777E' };
  const artwork = divisionForBook(book.id).artwork;
  const meta = progress.complete > 0
    ? `${progress.complete} of ${book.chapters} chapters · ${formatRelativeRead(progress.lastReadAt)}`
    : `${formatReadCount(book.chapters, 'chapter')}`;

  const body = (
    <>
      <View style={styles.thumb}>
        <View style={[StyleSheet.absoluteFill, { experimental_backgroundImage: `linear-gradient(to bottom, ${artwork.base[0]} 0%, ${artwork.base[1]} 100%)` }]} />
        <View style={[StyleSheet.absoluteFill, { experimental_backgroundImage: `radial-gradient(ellipse 56px 56px at 100% 0%, ${artwork.blob[0]} 0%, ${artwork.blob[1]} 40%, transparent 100%)` }]} />
      </View>
      <View style={styles.textCol}>
        <Text style={[styles.title, { color: theme.foreground }]} numberOfLines={1}>{book.name}</Text>
        <Text style={[styles.meta, { color: theme.secondary }]} numberOfLines={1}>{meta}</Text>
      </View>
      {progress.complete === book.chapters ? (
        <ChapterState progress={1} complete showLabel={false} />
      ) : progress.complete > 0 ? (
        <ChapterState progress={progress.percent} complete={false} showLabel={false} />
      ) : null}
    </>
  );

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onPress(book);
      }}>
      {hasGlass ? (
        <GlassView glassEffectStyle="regular" isInteractive style={[styles.row, { backgroundColor: theme.glass }]}>{body}</GlassView>
      ) : (
        <View style={[styles.row, { backgroundColor: theme.fallback }]}>{body}</View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12, borderRadius: 26, borderCurve: 'continuous', marginTop: 12 },
  thumb: { width: 56, height: 56, borderRadius: 18, borderCurve: 'continuous', overflow: 'hidden' },
  textCol: { flex: 1, gap: 3 },
  title: { fontSize: 17, fontFamily: fonts.semibold, letterSpacing: -0.2 },
  meta: { fontSize: 13, fontFamily: fonts.regular },
});
