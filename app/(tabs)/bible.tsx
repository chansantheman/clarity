import { router } from 'expo-router';
import { BookOpen } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, useColorScheme, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BookRow } from '@/components/bible/book-row';
import { ContinueCard } from '@/components/bible/continue-card';
import { SectionHeader } from '@/components/practice/section-header';
import { SegmentedControl } from '@/components/segmented-control';
import { useMinimizeOnScroll } from '@/components/glass-tabs';
import { HeaderActions } from '@/components/header-actions';
import { IntroReveal } from '@/components/splash';
import { BIBLE_DIVISIONS } from '@/constants/bible-art';
import { palette } from '@/constants/colors';
import { fonts } from '@/constants/fonts';
import { BOOKS, type BookMeta } from '@/lib/bible/canon';
import { formatReadCount } from '@/lib/bible-format';
import { formatRef, parseChapterPassageId, type BibleRef } from '@/lib/bible/ref';
import { useBibleProgress } from '@/hooks/use-bible-progress';
import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { useSessionRecords, useDerivedStats } from '@/hooks/use-session-history';

function openChapter(ref: BibleRef, from?: number) {
  // The destination route owns the database fetch and its unavailable-client
  // state. Navigation must remain safe even when this client lacks ExpoSQLite.
  const query = from != null ? `?from=${from}` : '';
  router.push(`/session/chapter/${formatRef(ref)}${query}` as never);
}

export default function BibleScreen() {
  useMarkInteractive();
  const insets = useSafeAreaInsets();
  const onScroll = useMinimizeOnScroll();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = palette[scheme];
  const [testament, setTestament] = useState(0);
  const { getChapter, getBook } = useBibleProgress();
  const records = useSessionRecords();
  const stats = useDerivedStats();

  const resume = useMemo(() => {
    const latest = [...records]
      .reverse()
      .map((record) => (record.mode === 'scripture' && record.passageId ? parseChapterPassageId(record.passageId) : null))
      .find((ref): ref is BibleRef => ref != null);
    const ref = latest ?? { code: 'KJV' as const, book: 1, chapter: 1 };
    const progress = getChapter(ref);
    const book = BOOKS[ref.book - 1];
    const nextVerse = progress.furthestVerse > 0 && progress.furthestVerse < progress.verseCount
      ? progress.furthestVerse + 1
      : undefined;
    return {
      ref,
      title: `${book.name} ${ref.chapter}`,
      caption: progress.furthestVerse > 0
        ? `verse ${Math.min(progress.furthestVerse, progress.verseCount)} of ${progress.verseCount} · ${formatReadCount(progress.versesRead, 'verse')} spoken`
        : 'The beginning · ready when you are',
      progress: progress.percent,
      nextVerse,
    };
  }, [getChapter, records]);

  const books = testament === 0 ? BOOKS.filter((book) => book.testament === 'old') : BOOKS.filter((book) => book.testament === 'new');
  const divisions = BIBLE_DIVISIONS.filter((division) => books.some((book) => book.id >= division.start && book.id <= division.end));

  const onBook = (book: BookMeta) => router.push(`/bible/${book.id}` as never);

  return (
    <Animated.ScrollView
      onScroll={onScroll}
      scrollEventThrottle={16}
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingTop: insets.top + 24, paddingHorizontal: 20, paddingBottom: 140 }}>
      <View style={styles.header}>
        <IntroReveal order={0}><Text style={[styles.screenTitle, { color: colors.foreground }]}>Bible</Text></IntroReveal>
        <IntroReveal order={0} fade={false}><HeaderActions streak={stats.streak} /></IntroReveal>
      </View>

      <IntroReveal order={1} fade={false} style={styles.card}>
        <ContinueCard
          ref={resume.ref}
          title={resume.title}
          caption={resume.caption}
          progress={resume.progress}
          onPress={(ref) => openChapter(ref, resume.nextVerse)}
        />
      </IntroReveal>

      <IntroReveal order={2}>
        <SectionHeader title="Books" subtitle="66 books · 1,189 chapters" />
      </IntroReveal>
      <IntroReveal order={3} fade={false} style={styles.segmented}>
        <SegmentedControl
          segments={['Old Testament', 'New Testament']}
          selectedIndex={testament}
          onChange={setTestament}
        />
      </IntroReveal>

      {divisions.map((division, index) => (
        <IntroReveal key={division.id} order={4 + index} fade={false}>
          <SectionHeader title={division.title} />
          {books.filter((book) => book.id >= division.start && book.id <= division.end).map((book) => (
            <BookRow key={book.id} book={book} progress={getBook(book)} onPress={onBook} />
          ))}
        </IntroReveal>
      ))}
    </Animated.ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  screenTitle: { fontSize: 34, fontFamily: fonts.bold, letterSpacing: -0.5 },
  card: { marginTop: 20 },
  segmented: { marginTop: 18 },
});
