import { getDb } from '@/services/bible-db';

import type { TranslationCode } from './canon';
import type { BibleRef } from './ref';

export type VerseRow = {
  verse: number;
  text: string;
};

type BookVerseRow = VerseRow & { chapter: number };

/** Eight chapters is enough for adjacent navigation without retaining an
 * unbounded copy of the Bible in the JS heap. */
const CHAPTER_CACHE_LIMIT = 8;
const chapterCache = new Map<string, Promise<VerseRow[]>>();

function cacheChapter(key: string, request: Promise<VerseRow[]>): Promise<VerseRow[]> {
  chapterCache.set(key, request);
  while (chapterCache.size > CHAPTER_CACHE_LIMIT) {
    const oldest = chapterCache.keys().next().value as string | undefined;
    if (oldest == null) break;
    chapterCache.delete(oldest);
  }
  void request.catch(() => {
    // A transient install/query failure must not poison this key for the rest of
    // the JS context. The next screen visit gets a fresh attempt.
    if (chapterCache.get(key) === request) chapterCache.delete(key);
  });
  return request;
}

/** Fetch one indexed chapter. The translation code is a closed union before it
 * reaches the table identifier, and all row values remain bound parameters. */
export function getChapter(ref: BibleRef): Promise<VerseRow[]> {
  const key = `${ref.code}:${ref.book}:${ref.chapter}`;
  const cached = chapterCache.get(key);
  if (cached) {
    // Treat a hit as recently used for the small LRU window.
    chapterCache.delete(key);
    chapterCache.set(key, cached);
    return cached;
  }

  const request = getDb(ref.code).then((db) =>
    db.getAllAsync<VerseRow>(
      `SELECT verse, text FROM ${ref.code}_verses WHERE book_id = ? AND chapter = ? ORDER BY verse ASC`,
      [ref.book, ref.chapter],
    ),
  );
  return cacheChapter(key, request);
}

/** Backwards-compatible alias for callers from the data-layer spike. */
export const fetchChapter = getChapter;

export async function chapterCount(code: TranslationCode, book: number): Promise<number> {
  const db = await getDb(code);
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(DISTINCT chapter) AS count FROM ${code}_verses WHERE book_id = ?`,
    [book],
  );
  return row?.count ?? 0;
}

export async function verseCount(ref: BibleRef): Promise<number> {
  const rows = await getChapter(ref);
  return rows.length;
}

/** Fetch every chapter in a book in one indexed query for future book-reading
 * mode and developer verification. The UI uses generated stats for browsing. */
export async function getBook(code: TranslationCode, book: number): Promise<Map<number, VerseRow[]>> {
  const db = await getDb(code);
  const rows = await db.getAllAsync<BookVerseRow>(
    `SELECT chapter, verse, text FROM ${code}_verses WHERE book_id = ? ORDER BY chapter ASC, verse ASC`,
    [book],
  );
  const grouped = new Map<number, VerseRow[]>();
  for (const row of rows) {
    const chapter = grouped.get(row.chapter);
    const verse = { verse: row.verse, text: row.text };
    if (chapter) chapter.push(verse);
    else grouped.set(row.chapter, [verse]);
  }
  return grouped;
}
