import { BOOKS, TOTAL_VERSES, type BookMeta, type TranslationCode } from './canon';
import { CHAPTER_STATS } from './chapter-stats.generated';
import { isChapterComplete, percentComplete, versesRead, type ChapterProgress } from './progress-schema';
import { parseChapterKey } from './progress-schema';
import { chapterPassageId, parseChapterPassageId, type BibleRef } from './ref';
import type { SessionRecord } from '@/types/history';

export type ChapterRollup = {
  ref: BibleRef;
  versesRead: number;
  verseCount: number;
  percent: number;
  complete: boolean;
  /** Straight-through chapter completions, not coverage sittings. */
  completions: number;
  attempts: number;
  totalMs: number;
  firstReadAt: number | null;
  lastReadAt: number | null;
  furthestVerse: number;
};

export type BookRollup = {
  book: BookMeta;
  chaptersComplete: number;
  versesRead: number;
  percent: number;
  totalMs: number;
  lastReadAt: number | null;
};

export type BibleRollup = {
  byChapter: ReadonlyMap<string, ChapterRollup>;
  byBook: readonly BookRollup[];
  overall: {
    chaptersComplete: number;
    versesRead: number;
    percent: number;
    totalMs: number;
  };
  lastRead: { ref: BibleRef; verse: number; at: number } | null;
};

function verseCountOf(ref: BibleRef): number {
  return CHAPTER_STATS[ref.code]?.[ref.book - 1]?.[ref.chapter - 1]?.[0] ?? 0;
}

function emptyChapter(ref: BibleRef, progress?: ChapterProgress): ChapterRollup {
  const verseCount = verseCountOf(ref);
  const value = progress ?? { v: 1, f: 0, r: '' };
  return {
    ref,
    versesRead: versesRead(value),
    verseCount,
    percent: percentComplete(value, verseCount),
    complete: isChapterComplete(value, verseCount),
    completions: 0,
    attempts: 0,
    totalMs: 0,
    firstReadAt: null,
    lastReadAt: null,
    furthestVerse: value.f,
  };
}

function updateCoverage(target: ChapterRollup, progress: ChapterProgress) {
  target.versesRead = versesRead(progress);
  target.percent = percentComplete(progress, target.verseCount);
  target.complete = isChapterComplete(progress, target.verseCount);
  target.furthestVerse = Math.max(target.furthestVerse, progress.f);
}

/**
 * One pure derivation over the raw scripture records and durable verse bitmaps.
 * Invalid/non-scripture records and progress keys are ignored, so malformed
 * namespaces cannot inflate Bible totals.
 */
export function bibleRollup(
  records: readonly SessionRecord[],
  progress: ReadonlyMap<string, ChapterProgress>,
  code: TranslationCode,
): BibleRollup {
  const byChapter = new Map<string, ChapterRollup>();

  for (const [key, value] of progress) {
    const ref = parseChapterKey(key);
    if (!ref || ref.code !== code) continue;
    const id = chapterPassageId(ref);
    const current = byChapter.get(id) ?? emptyChapter(ref);
    updateCoverage(current, value);
    byChapter.set(id, current);
  }

  let lastRead: { ref: BibleRef; verse: number; at: number } | null = null;
  let lastReadSeq = -1;
  let totalMs = 0;

  for (const record of records) {
    if (record.mode !== 'scripture' || !record.passageId) continue;
    const ref = parseChapterPassageId(record.passageId);
    if (!ref || ref.code !== code) continue;

    const id = chapterPassageId(ref);
    const current = byChapter.get(id) ?? emptyChapter(ref);
    current.attempts += 1;
    if (record.endedReason === 'completed') current.completions += 1;
    current.totalMs += record.durationMs;
    current.firstReadAt = current.firstReadAt == null
      ? record.completedAt
      : Math.min(current.firstReadAt, record.completedAt);
    current.lastReadAt = current.lastReadAt == null
      ? record.completedAt
      : Math.max(current.lastReadAt, record.completedAt);
    totalMs += record.durationMs;
    byChapter.set(id, current);

    if (
      lastRead == null
      || record.completedAt > lastRead.at
      || (record.completedAt === lastRead.at && record.seq > lastReadSeq)
    ) {
      lastRead = { ref, verse: current.furthestVerse, at: record.completedAt };
      lastReadSeq = record.seq;
    }
  }

  // Progress may have been written after the most recent session record. Refresh
  // the last-read verse from the final coverage map without changing its time.
  if (lastRead) {
    const latest = byChapter.get(chapterPassageId(lastRead.ref));
    if (latest) lastRead = { ...lastRead, verse: latest.furthestVerse };
  }

  const byBook: BookRollup[] = BOOKS.map((book) => {
    let chaptersComplete = 0;
    let bookVersesRead = 0;
    let bookVerseCount = 0;
    let bookTotalMs = 0;
    let lastReadAt: number | null = null;

    for (let chapter = 1; chapter <= book.chapters; chapter += 1) {
      const ref: BibleRef = { code, book: book.id, chapter };
      const current = byChapter.get(chapterPassageId(ref));
      const verseCount = verseCountOf(ref);
      bookVerseCount += verseCount;
      if (!current) continue;
      if (current.complete) chaptersComplete += 1;
      bookVersesRead += current.versesRead;
      bookTotalMs += current.totalMs;
      if (current.lastReadAt != null) lastReadAt = Math.max(lastReadAt ?? 0, current.lastReadAt);
    }

    return {
      book,
      chaptersComplete,
      versesRead: bookVersesRead,
      percent: bookVerseCount === 0 ? 0 : bookVersesRead / bookVerseCount,
      totalMs: bookTotalMs,
      lastReadAt,
    };
  });

  const chaptersComplete = byBook.reduce((sum, book) => sum + book.chaptersComplete, 0);
  const versesReadTotal = byBook.reduce((sum, book) => sum + book.versesRead, 0);

  return {
    byChapter,
    byBook,
    overall: {
      chaptersComplete,
      versesRead: versesReadTotal,
      percent: versesReadTotal / TOTAL_VERSES,
      totalMs,
    },
    lastRead,
  };
}

