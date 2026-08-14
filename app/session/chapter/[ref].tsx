import { ActivityIndicator, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { BibleControls } from '@/components/session/bible-controls';
import { ReadingSession, type WriteResult } from '@/components/session/reading-session';
import { VerseReference } from '@/components/session/verse-reference';
import { palette } from '@/constants/colors';
import { fonts } from '@/constants/fonts';
import { BOOKS, bookById } from '@/lib/bible/canon';
import { buildChapterPassage, verseBankThreshold, verseIndexAt, type ChapterPassage } from '@/lib/bible/chapter-passage';
import { isChapterComplete, isVerseRead } from '@/lib/bible/progress-schema';
import { formatRef, type BibleRef, parseRef } from '@/lib/bible/ref';
import { getChapter as fetchChapter, type VerseRow } from '@/lib/bible/queries';
import { bibleProgressStore } from '@/services/bible-progress';
import { BibleDatabaseUnavailableError } from '@/services/bible-db';
import { useBibleProgress } from '@/hooks/use-bible-progress';
import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import type { SessionEndedReason } from '@/types/history';
import type { SessionResult } from '@/types/session';

function nextChapter(ref: BibleRef): BibleRef | null {
  const book = bookById(ref.book);
  if (!book) return null;
  if (ref.chapter < book.chapters) return { ...ref, chapter: ref.chapter + 1 };
  const nextBook = BOOKS.find((candidate) => candidate.id === ref.book + 1);
  return nextBook ? { code: ref.code, book: nextBook.id, chapter: 1 } : null;
}

export default function BibleChapterScreen() {
  const { ref: rawRef, from: rawFrom } = useLocalSearchParams<{ ref: string; from?: string }>();
  const ref = useMemo(() => parseRef(rawRef), [rawRef]);
  const parsedFrom = rawFrom == null ? NaN : Number(rawFrom);
  const fromVerse = Number.isFinite(parsedFrom) ? Math.max(1, parsedFrom) : undefined;
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = palette[scheme];
  const [rows, setRows] = useState<VerseRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  useMarkInteractive(Boolean(ref && rows));

  useEffect(() => {
    let cancelled = false;
    if (!ref) return;
    setRows(null);
    setError(null);
    void fetchChapter(ref)
      .then((value) => {
        if (!cancelled) setRows(value);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(
          cause instanceof BibleDatabaseUnavailableError
            ? cause.message
            : 'This chapter could not be opened.',
        );
      });
    return () => { cancelled = true; };
  }, [rawRef]);

  const chapter = useMemo<ChapterPassage | null>(() => {
    if (!ref || !rows) return null;
    const source = fromVerse == null ? rows : rows.filter((row) => row.verse >= fromVerse);
    return buildChapterPassage(ref, source, { fromVerse });
  }, [fromVerse, ref, rows]);

  const next = ref ? nextChapter(ref) : null;
  const nextLabel = next ? `${bookById(next.book)?.abbr ?? bookById(next.book)?.name ?? ''} ${next.chapter}` : 'Results';
  const bankedVerseIndex = useRef(-1);
  const verseCursor = useRef(0);
  const finalVerseEntered = useRef(false);

  useEffect(() => {
    bankedVerseIndex.current = -1;
    verseCursor.current = 0;
    finalVerseEntered.current = false;
  }, [rawRef, fromVerse]);

  const bankAtIndex = useCallback((wordIndex: number) => {
    if (!chapter || !ref || chapter.verses.length === 0) return;

    const verses = chapter.verses;
    const clampedIndex = Math.max(0, Math.min(wordIndex, verses[verses.length - 1].wordEnd));
    let cursor = Math.max(0, verseCursor.current);
    while (cursor < verses.length) {
      const verse = verses[cursor];
      const threshold = verseBankThreshold(verse);
      if (clampedIndex < threshold) break;
      if (cursor > bankedVerseIndex.current) {
        const existing = bibleProgressStore.get(ref);
        const alreadyRead = existing != null && isVerseRead(existing, verse.verse);
        const committed = bibleProgressStore.markVerseRead(ref, verse.verse);
        if (!committed && !alreadyRead) break;
        bankedVerseIndex.current = cursor;
      }
      cursor += 1;
    }
    verseCursor.current = cursor;

    const currentIndex = verseIndexAt(chapter, clampedIndex);
    const currentVerse = currentIndex >= 0 ? verses[currentIndex] : verses[verses.length - 1];
    if (currentIndex >= verses.length - 1 || clampedIndex >= verses[verses.length - 1].wordStart) {
      finalVerseEntered.current = true;
    }
    if (currentVerse) bibleProgressStore.markFurthest(ref, currentVerse.verse);
  }, [chapter, ref]);

  const onFinished = useCallback((result: SessionResult, endedReason: SessionEndedReason, written: WriteResult) => {
    if (!ref || !chapter) return;
    // The recognizer's spoken-word count is an effort measure, not a display-word
    // frontier. The last frontier callback is the source of truth for coverage.
    const finalVerse = chapter.verses[chapter.verses.length - 1];
    const progress = bibleProgressStore.get(ref);
    const complete = Boolean(
      finalVerse
      && finalVerseEntered.current
      && progress
      && isChapterComplete(progress, rows?.length ?? chapter.verses.length),
    );
    if (endedReason === 'completed' && complete) {
      setCompleted(true);
    } else {
      router.push('/session/results');
    }
    void result;
    void written;
  }, [chapter, ref, rows]);

  const onContinue = useCallback(() => {
    if (next) {
      router.replace(`/session/chapter/${formatRef(next)}` as never);
    } else {
      router.push('/session/results');
    }
  }, [next]);

  if (!ref) return <View style={[styles.center, { backgroundColor: colors.background }]}><Text style={[styles.message, { color: colors.foreground }]}>Chapter not found.</Text></View>;
  if (error) return <View style={[styles.center, { backgroundColor: colors.background }]}><Text style={[styles.message, { color: colors.foreground }]}>{error}</Text></View>;
  if (!chapter) return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.foreground} /><Text style={[styles.loading, { color: scheme === 'dark' ? '#9E9EA6' : '#77777E' }]}>Opening chapter…</Text></View>;

  return (
    <ReadingSession
      passage={chapter.passage}
      meta={{ mode: 'scripture', passageId: chapter.passage.id, contentTitle: chapter.passage.title }}
      navigateToResults={false}
      onFinished={onFinished}
      onContinue={onContinue}
      onWordIndex={bankAtIndex}
      renderTopBarChild={(session) => {
        const index = Math.max(0, Math.min(session.currentWordIndex, chapter.verses.length ? chapter.verses[chapter.verses.length - 1].wordEnd - 1 : 0));
        const verseIndex = verseIndexAt(chapter, index);
        const verse = verseIndex >= 0 ? chapter.verses[verseIndex].verse : chapter.verses[chapter.verses.length - 1]?.verse ?? 1;
        return <VerseReference code={ref.code} book={ref.book} chapter={ref.chapter} verse={verse} verseCount={rows?.length ?? chapter.verses.length} />;
      }}
      renderControls={(session, handlers) => (
        <BibleControls
          status={completed ? 'done' : session.status}
          error={session.error}
          meterLevel={session.meterLevel}
          currentWordIndex={session.currentWordIndex}
          totalWords={session.words.length}
          nextLabel={nextLabel}
          onPauseToggle={handlers.onPauseToggle}
          onRestart={handlers.onRestart}
          onFinish={handlers.onStop}
          onDismiss={handlers.onErrorDismiss}
          onContinue={handlers.onContinue}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  message: { fontSize: 17, fontFamily: fonts.semibold, textAlign: 'center' },
  loading: { fontSize: 15, fontFamily: fonts.regular, marginTop: 12 },
});

