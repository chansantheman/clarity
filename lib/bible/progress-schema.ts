import { KEY } from '../history-schema';
import type { BibleRef } from './ref';
import { parseRef } from './ref';

export const BIBLE_PROGRESS_VERSION = 1;

export type ChapterProgress = {
  v: number;
  f: number;
  r: string;
};

export type ChapterParse =
  | { ok: true; value: ChapterProgress; upgraded: boolean; readOnly: boolean }
  | { ok: false; reason: 'not-an-object' | 'bad-version' | 'bad-furthest' | 'bad-bitmap' };

function isFiniteNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

function upgradeChapterProgress(raw: Record<string, unknown>, from: number): Record<string, unknown> {
  let out = raw;
  // if (from < 2) out = { ...out, /* v2 field */ };
  return out;
}

export function parseChapterProgress(raw: unknown, maxVerses: number): ChapterParse {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: 'not-an-object' };
  }
  
  let obj = raw as Record<string, unknown>;
  let v = isFiniteNumber(obj.v) ? obj.v : 1;
  let readOnly = false;
  let upgraded = false;

  if (v > BIBLE_PROGRESS_VERSION) {
    readOnly = true;
  } else if (v < BIBLE_PROGRESS_VERSION) {
    obj = upgradeChapterProgress(obj, v);
    v = BIBLE_PROGRESS_VERSION;
    upgraded = true;
  }

  let f = isFiniteNumber(obj.f) ? obj.f : 0;
  if (f < 0) f = 0;
  if (f > maxVerses) f = maxVerses;

  const r = obj.r;
  if (typeof r !== 'string' || r.length % 2 !== 0 || !/^[0-9a-f]*$/.test(r)) {
    return { ok: false, reason: 'bad-bitmap' };
  }

  // Bits above maxVerses are masked off
  // We do this by dropping bytes completely beyond ceil(maxVerses/8),
  // and masking the last byte.
  const maxBytes = Math.ceil(maxVerses / 8);
  let cleanedR = r;
  if (cleanedR.length > maxBytes * 2) {
    cleanedR = cleanedR.substring(0, maxBytes * 2);
  }
  if (cleanedR.length === maxBytes * 2 && maxVerses % 8 !== 0) {
    const lastByteStr = cleanedR.substring(cleanedR.length - 2);
    let lastByte = parseInt(lastByteStr, 16);
    const validBits = maxVerses % 8;
    const mask = (1 << validBits) - 1;
    lastByte &= mask;
    cleanedR = cleanedR.substring(0, cleanedR.length - 2) + lastByte.toString(16).padStart(2, '0');
  }

  return {
    ok: true,
    value: { v, f, r: cleanedR },
    readOnly,
    upgraded,
  };
}

export function isVerseRead(p: ChapterProgress, verse: number): boolean {
  if (verse < 1) return false;
  const bitIndex = verse - 1;
  const byteIndex = Math.floor(bitIndex / 8);
  if (byteIndex * 2 >= p.r.length) return false;
  
  const byteStr = p.r.substring(byteIndex * 2, byteIndex * 2 + 2);
  const byte = parseInt(byteStr, 16);
  const bitOffset = bitIndex % 8;
  return (byte & (1 << bitOffset)) !== 0;
}

export function versesRead(p: ChapterProgress): number {
  let count = 0;
  for (let i = 0; i < p.r.length; i += 2) {
    let byte = parseInt(p.r.substring(i, i + 2), 16);
    while (byte > 0) {
      if (byte & 1) count++;
      byte >>= 1;
    }
  }
  return count;
}

export function percentComplete(p: ChapterProgress, verseCount: number): number {
  if (verseCount === 0) return 0;
  return versesRead(p) / verseCount;
}

export function isChapterComplete(p: ChapterProgress, verseCount: number): boolean {
  return percentComplete(p, verseCount) >= 1;
}

export function withVerseRead(p: ChapterProgress, verse: number): ChapterProgress {
  if (verse < 1 || isVerseRead(p, verse)) return p;
  
  const bitIndex = verse - 1;
  const byteIndex = Math.floor(bitIndex / 8);
  let newR = p.r;
  
  // Pad if necessary
  while (newR.length < (byteIndex + 1) * 2) {
    newR += '00';
  }
  
  const byteStr = newR.substring(byteIndex * 2, byteIndex * 2 + 2);
  let byte = parseInt(byteStr, 16);
  byte |= (1 << (bitIndex % 8));
  
  newR = newR.substring(0, byteIndex * 2) + byte.toString(16).padStart(2, '0') + newR.substring(byteIndex * 2 + 2);
  
  return { ...p, r: newR };
}

export function withFurthest(p: ChapterProgress, verse: number): ChapterProgress {
  if (verse <= p.f) return p;
  return { ...p, f: verse };
}

const BOOK_DIGITS = 3;
const CHAPTER_DIGITS = 3;

export function chapterKey(ref: BibleRef): string {
  return `${KEY.bibleChapter}${ref.code}/`
       + `${String(ref.book).padStart(BOOK_DIGITS, '0')}/`
       + `${String(ref.chapter).padStart(CHAPTER_DIGITS, '0')}`;
}

export function parseChapterKey(key: string): BibleRef | null {
  if (!key.startsWith(KEY.bibleChapter)) return null;
  const rest = key.substring(KEY.bibleChapter.length);
  const parts = rest.split('/');
  if (parts.length !== 3) return null;
  
  const [code, bookStr, chapStr] = parts;
  const book = parseInt(bookStr, 10);
  const chapter = parseInt(chapStr, 10);
  
  if (isNaN(book) || isNaN(chapter)) return null;
  
  return parseRef(`${code}.${book}.${chapter}`);
}
