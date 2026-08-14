import { tokenizePassage } from '../passage-text';
import type { Passage } from '@/types/session';
import { chapterPassageId, formatChapterRef, formatVerseRef, type BibleRef } from './ref';
export const SCRIPTURE_TARGET_WPM = 130;
export const VERSE_BANK_RATIO = 0.98;

export type VerseRow = { verse: number; text: string };
export type VerseSpan = { verse: number; wordStart: number; wordEnd: number };

export type ChapterPassage = {
  passage: Passage;
  verses: readonly VerseSpan[];
};

function formatDuration(words: number): string {
  const seconds = (words / SCRIPTURE_TARGET_WPM) * 60;
  if (seconds < 60) return `~${Math.max(15, Math.round(seconds / 15) * 15)} sec`;
  return `~${Math.round(seconds / 60)} min`;
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
  const selectedRows = opts?.fromVerse == null ? rows : rows.filter((row) => row.verse >= opts.fromVerse!);
  let offset = 0;
  const verses = selectedRows.map((row) => {
    const t = tokenizePassage(row.text);
    const entry = { verse: row.verse, wordStart: offset, wordEnd: offset + t.words.length };
    offset += t.words.length;
    return entry;
  });

  const joinedText = selectedRows.map(r => r.text).join('\n\n');
  const tokenized = tokenizePassage(joinedText);

  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    if (tokenized.words.length !== offset) {
      throw new Error(`Token mapping mismatch: ${offset} vs ${tokenized.words.length}`);
    }
  }

  const durationStr = formatDuration(offset);

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

export function verseBankThreshold(verse: VerseSpan): number {
  const wordCount = verse.wordEnd - verse.wordStart;
  return wordCount <= 0
    ? verse.wordEnd
    : verse.wordStart + Math.max(1, Math.ceil(wordCount * VERSE_BANK_RATIO));
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
