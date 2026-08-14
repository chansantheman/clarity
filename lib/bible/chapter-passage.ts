import { tokenizePassage } from '../passage-text';
import type { Passage } from '@/types/session';
import { chapterPassageId, formatChapterRef, formatVerseRef, type BibleRef } from './ref';
import { estimateMinutes } from './chapter-stats.generated';

export const SCRIPTURE_TARGET_WPM = 135;

export type VerseRow = { verse: number; text: string };

export type ChapterPassage = {
  passage: Passage;
  verses: readonly { verse: number; wordStart: number; wordEnd: number }[];
};

function formatDuration(minutes: number): string {
  if (minutes < 1) return '< 1 min';
  return `~${Math.round(minutes)} mins`;
}

function bibleArtwork(book: number): Passage['artwork'] {
  // Deterministic colors, Lane B owns the palette later.
  return {
    base: ['#f8f9fa', '#e9ecef'],
    blob: ['#dee2e6', '#ced4da']
  };
}

export function buildChapterPassage(
  ref: BibleRef,
  rows: readonly VerseRow[],
  opts?: { fromVerse?: number }
): ChapterPassage {
  let offset = 0;
  const verses = rows.map((row) => {
    const t = tokenizePassage(row.text);
    const entry = { verse: row.verse, wordStart: offset, wordEnd: offset + t.words.length };
    offset += t.words.length;
    return entry;
  });

  const joinedText = rows.map(r => r.text).join('\n\n');
  const tokenized = tokenizePassage(joinedText);

  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    if (tokenized.words.length !== offset) {
      throw new Error(`Token mapping mismatch: ${offset} vs ${tokenized.words.length}`);
    }
  }

  const durationStr = formatDuration(estimateMinutes(offset));

  const passage: Passage = {
    id: chapterPassageId(ref),
    title: formatChapterRef(ref),
    duration: durationStr,
    text: joinedText,
    targetWpm: SCRIPTURE_TARGET_WPM,
    category: 'bible',
    artwork: bibleArtwork(ref.book),
  };

  return { passage, verses };
}

export function verseIndexAt(cp: ChapterPassage, wordIndex: number): number {
  let left = 0;
  let right = cp.verses.length - 1;
  if (wordIndex < 0) return -1;
  
  if (cp.verses.length > 0 && wordIndex >= cp.verses[cp.verses.length - 1].wordEnd) {
    return -1;
  }

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const v = cp.verses[mid];
    if (wordIndex >= v.wordStart && wordIndex < v.wordEnd) {
      return mid;
    }
    if (wordIndex < v.wordStart) {
      right = mid - 1;
    } else {
      left = mid + 1;
    }
  }
  return -1;
}

export function verseRefAt(cp: ChapterPassage, ref: BibleRef, wordIndex: number): string {
  const index = verseIndexAt(cp, wordIndex);
  if (index === -1) {
    if (wordIndex < 0 && cp.verses.length > 0) return formatVerseRef(ref, cp.verses[0].verse);
    if (cp.verses.length > 0) return formatVerseRef(ref, cp.verses[cp.verses.length - 1].verse);
    return formatChapterRef(ref);
  }
  return formatVerseRef(ref, cp.verses[index].verse);
}
