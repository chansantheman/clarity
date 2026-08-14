import { useMemo, useSyncExternalStore } from 'react';

import { type BookMeta, type TranslationCode } from '@/lib/bible/canon';
import { bibleRollup, type BibleRollup } from '@/lib/bible/rollup';
import { CHAPTER_STATS } from '@/lib/bible/chapter-stats.generated';
import {
  chapterKey,
  isChapterComplete,
  percentComplete,
  versesRead,
  type ChapterProgress,
} from '@/lib/bible/progress-schema';
import { chapterPassageId, parseChapterPassageId, type BibleRef } from '@/lib/bible/ref';
import { bibleProgressStore } from '@/services/bible-progress';
import { getRecords, subscribe as subscribeHistory } from '@/services/session-history';
import type { SessionRecord } from '@/types/history';

export type ChapterProgressView = {
  percent: number;
  versesRead: number;
  verseCount: number;
  complete: boolean;
  reads: number;
  lastReadAt: number | null;
  furthestVerse: number;
};

function verseCountOf(ref: BibleRef): number {
  return CHAPTER_STATS[ref.code]?.[ref.book - 1]?.[ref.chapter - 1]?.[0] ?? 0;
}

function recordsForChapter(records: readonly SessionRecord[], ref: BibleRef): SessionRecord[] {
  const id = chapterPassageId(ref);
  return records.filter((record) => record.mode === 'scripture' && record.passageId === id);
}

export function useBibleProgress(code: TranslationCode = 'KJV') {
  const progress = useSyncExternalStore(
    bibleProgressStore.subscribe,
    bibleProgressStore.getAll,
    bibleProgressStore.getAll,
  );
  const records = useSyncExternalStore(subscribeHistory, getRecords, getRecords);

  return useMemo(() => {
    const getChapter = (ref: BibleRef): ChapterProgressView => {
      const value = progress.get(chapterKey(ref)) ?? ({ v: 1, f: 0, r: '' } satisfies ChapterProgress);
      const verseCount = verseCountOf(ref);
      const matching = recordsForChapter(records, ref);
      const reads = matching.filter((record) => record.endedReason === 'completed').length;
      return {
        percent: percentComplete(value, verseCount),
        versesRead: versesRead(value),
        verseCount,
        complete: isChapterComplete(value, verseCount),
        reads,
        lastReadAt: matching.reduce<number | null>(
          (latest, record) => Math.max(latest ?? 0, record.completedAt),
          null,
        ),
        furthestVerse: value.f,
      };
    };

    const getBook = (bookMeta: BookMeta) => {
      let complete = 0;
      let versesReadTotal = 0;
      let versesTotal = 0;
      let lastReadAt: number | null = null;
      for (let chapterNumber = 1; chapterNumber <= bookMeta.chapters; chapterNumber += 1) {
        const view = getChapter({ code, book: bookMeta.id, chapter: chapterNumber });
        if (view.complete) complete += 1;
        versesReadTotal += view.versesRead;
        versesTotal += view.verseCount;
        if (view.lastReadAt != null) lastReadAt = Math.max(lastReadAt ?? 0, view.lastReadAt);
      }
      return {
        complete,
        chapters: bookMeta.chapters,
        percent: bookMeta.chapters === 0 ? 0 : complete / bookMeta.chapters,
        versesRead: versesReadTotal,
        versesTotal,
        lastReadAt,
      };
    };

    return { getChapter, getBook };
  }, [code, progress, records]);
}

export function useBibleRollup(code: 'KJV' | 'BSB' = 'KJV'): BibleRollup {
  const progress = useSyncExternalStore(
    bibleProgressStore.subscribe,
    bibleProgressStore.getAll,
    bibleProgressStore.getAll,
  );
  const records = useSyncExternalStore(subscribeHistory, getRecords, getRecords);
  return useMemo(() => bibleRollup(records, progress, code), [code, progress, records]);
}

export function parseBibleRecordRef(record: SessionRecord): BibleRef | null {
  return record.mode === 'scripture' && record.passageId ? parseChapterPassageId(record.passageId) : null;
}
