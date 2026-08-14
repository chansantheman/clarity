import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChapterTile } from '@/components/bible/chapter-tile';
import { SegmentedControl } from '@/components/segmented-control';
import { IntroReveal } from '@/components/splash';
import { palette } from '@/constants/colors';
import { fonts } from '@/constants/fonts';
import { BOOKS } from '@/lib/bible/canon';
import { CHAPTER_STATS } from '@/lib/bible/chapter-stats.generated';
import { formatChapterDuration } from '@/lib/bible-format';
import { formatRef, type BibleRef } from '@/lib/bible/ref';
import { useBibleProgress } from '@/hooks/use-bible-progress';

export default function BibleBookScreen() {
  const { bookId: rawBookId } = useLocalSearchParams<{ bookId: string }>();
  const bookId = Number(rawBookId);
  const book = BOOKS.find((item) => item.id === bookId) ?? BOOKS[0];
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = palette[scheme];
  const [filter, setFilter] = useState(0);
  const { getChapter, getBook } = useBibleProgress();
  const bookProgress = getBook(book);
  const stats = CHAPTER_STATS.KJV[book.id - 1] ?? [];

  const chapters = useMemo(() => {
    return Array.from({ length: book.chapters }, (_, index) => {
      const chapter = index + 1;
      const ref = { code: 'KJV' as const, book: book.id, chapter };
      const progress = getChapter(ref);
      return { chapter, ref, progress, stat: stats[index] };
    }).filter(({ progress }) => filter === 0 || (filter === 1 ? !progress.complete : progress.complete));
  }, [book, filter, getChapter, stats]);

  const openChapter = (ref: BibleRef) => {
    // The destination route owns the database fetch and its unavailable-client
    // state. Do not prefetch here: a missing native module must never block the
    // press or surface as an unhandled development-runtime rejection.
    router.push(`/session/chapter/${formatRef(ref)}` as never);
  };

  const back = () => {
    Haptics.selectionAsync();
    router.back();
  };
  const hasGlass = isLiquidGlassAvailable();
  const circle = scheme === 'dark' ? '#2A2A2F' : '#EDEDF0';

  return (
    <Animated.ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 140 }}>
      <View style={styles.header}>
        <Pressable onPress={back} hitSlop={8}>
          {hasGlass ? (
            <GlassView glassEffectStyle="regular" isInteractive style={styles.back}><ChevronLeft size={24} color={colors.foreground} /></GlassView>
          ) : (
            <View style={[styles.back, { backgroundColor: circle }]}><ChevronLeft size={24} color={colors.foreground} /></View>
          )}
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: colors.foreground }]}>{book.name}</Text>
          <Text style={[styles.subtitle, { color: scheme === 'dark' ? '#9E9EA6' : '#77777E' }]}>
            {book.chapters} chapters · {bookProgress.complete} read · {formatChapterDuration(stats.reduce((sum, stat) => sum + stat[1], 0))} average
          </Text>
        </View>
      </View>

      <IntroReveal order={1} style={styles.control}>
        <SegmentedControl segments={['All', 'Unread', 'Read']} selectedIndex={filter} onChange={setFilter} />
      </IntroReveal>

      <IntroReveal order={2} fade={false} style={styles.grid}>
        {chapters.map(({ chapter, ref, progress, stat }) => (
          <ChapterTile
            key={chapter}
            ref={ref}
            title={`Chapter ${chapter}`}
            words={stat?.[1] ?? 0}
            progress={progress}
            onPress={openChapter}
          />
        ))}
      </IntroReveal>
      {chapters.length === 0 ? (
        <Text style={[styles.empty, { color: scheme === 'dark' ? '#9E9EA6' : '#77777E' }]}>Nothing here yet.</Text>
      ) : null}
    </Animated.ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1 },
  title: { fontSize: 34, fontFamily: fonts.bold, letterSpacing: -0.5 },
  subtitle: { fontSize: 15, fontFamily: fonts.regular, marginTop: 4 },
  control: { marginTop: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 },
  empty: { fontSize: 15, fontFamily: fonts.regular, textAlign: 'center', marginTop: 28 },
});
