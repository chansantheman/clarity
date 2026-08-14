import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';

import { ChapterState } from '@/components/bible/chapter-state';
import { fonts } from '@/constants/fonts';
import { formatChapterDuration, formatRelativeRead } from '@/lib/bible-format';
import type { BibleRef } from '@/lib/bible/ref';
import type { ChapterProgressView } from '@/hooks/use-bible-progress';

export type ChapterTileProps = {
  ref: BibleRef;
  title: string;
  words: number;
  progress: ChapterProgressView;
  onPress: (ref: BibleRef) => void;
};

export function ChapterTile({ ref, title, words, progress, onPress }: ChapterTileProps) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const hasGlass = isLiquidGlassAvailable();
  const theme = scheme === 'dark'
    ? { glass: 'rgba(10,10,12,0.55)', fallback: 'rgba(26,26,30,0.96)', foreground: '#FFFFFF', secondary: '#9E9EA6', chip: 'rgba(255,255,255,0.08)', chipText: '#9E9EA6' }
    : { glass: 'rgba(255,255,255,0.45)', fallback: 'rgba(244,244,246,0.96)', foreground: '#111114', secondary: '#77777E', chip: '#F3F3F5', chipText: '#8A8A90' };

  const body = (
    <>
      <Text style={[styles.title, { color: theme.foreground }]}>{title}</Text>
      <Text style={[styles.meta, { color: theme.secondary }]}>
        {formatChapterDuration(words)} · {progress.verseCount} verses
      </Text>
      {progress.reads > 0 ? (
        <View style={[styles.chip, { backgroundColor: theme.chip }]}>
          <Text style={[styles.chipText, { color: theme.chipText }]}>{progress.reads}×</Text>
        </View>
      ) : null}
      <View style={styles.state}>
        <ChapterState progress={progress.percent} complete={progress.complete} />
      </View>
      {progress.lastReadAt != null && progress.reads === 0 ? (
        <Text style={[styles.lastRead, { color: theme.secondary }]}>{formatRelativeRead(progress.lastReadAt)}</Text>
      ) : null}
    </>
  );

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onPress(ref);
      }}
      style={styles.pressable}>
      {hasGlass ? (
        <GlassView glassEffectStyle="regular" isInteractive style={[styles.tile, { backgroundColor: theme.glass }]}>{body}</GlassView>
      ) : (
        <View style={[styles.tile, { backgroundColor: theme.fallback }]}>{body}</View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: { width: '48%' },
  tile: { height: 104, borderRadius: 26, borderCurve: 'continuous', padding: 14, overflow: 'hidden' },
  title: { fontSize: 17, fontFamily: fonts.semibold, letterSpacing: -0.2 },
  meta: { fontSize: 12, fontFamily: fonts.medium, marginTop: 2 },
  state: { position: 'absolute', top: 12, right: 12 },
  chip: { position: 'absolute', bottom: 12, left: 14, paddingVertical: 2, paddingHorizontal: 7, borderRadius: 6, borderCurve: 'continuous' },
  chipText: { fontSize: 12, fontFamily: fonts.semibold },
  lastRead: { position: 'absolute', bottom: 12, right: 14, fontSize: 11, fontFamily: fonts.regular },
});
