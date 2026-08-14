import { createBibleProgressStore } from '@/lib/bible/progress-store';
import { kv } from './kv';
import { CHAPTER_STATS } from '@/lib/bible/chapter-stats.generated';
import type { BibleRef } from '@/lib/bible/ref';

function verseCountOf(ref: BibleRef): number {
  const stats = CHAPTER_STATS[ref.code];
  if (!stats) return 0;
  const bookStats = stats[ref.book - 1];
  if (!bookStats) return 0;
  const chapStats = bookStats[ref.chapter - 1];
  if (!chapStats) return 0;
  return chapStats[0]; // verses
}

export const bibleProgressStore = createBibleProgressStore({
  kv,
  verseCountOf,
  onWarn: (msg, err) => console.warn(msg, err),
});
