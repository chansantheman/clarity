/**
 * Self-tests for the bible domain.
 *
 * Pure JS — run with:
 *   bun scripts/test-bible.ts
 */

import { parseRef, formatRef, chapterPassageId, parseChapterPassageId, formatChapterRef, formatVerseRef } from '../lib/bible/ref';
import { parseChapterProgress, withVerseRead, withFurthest, isVerseRead, versesRead, percentComplete, isChapterComplete, chapterKey, parseChapterKey } from '../lib/bible/progress-schema';
import { createBibleProgressStore } from '../lib/bible/progress-store';
import { buildChapterPassage, verseIndexAt, verseRefAt } from '../lib/bible/chapter-passage';
import { createMemoryKv } from '../lib/history-store';

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: unknown) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${label}`, detail !== undefined ? JSON.stringify(detail) : '');
  }
}

function assertEq<T>(actual: T, expected: T, label: string) {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${label} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`
  );
}

function section(name: string) {
  console.log(`\n== ${name}`);
}

section('BibleRef parse and format');
{
  const ref = parseRef('KJV.1.1');
  assertEq(ref, { code: 'KJV', book: 1, chapter: 1 }, 'valid ref parses');
  assertEq(formatRef(ref!), 'KJV.1.1', 'formats correctly');

  assertEq(parseRef('KJV.999.1'), null, 'invalid book');
  assertEq(parseRef('KJV.1.999'), null, 'invalid chapter');
}

section('chapterPassageId');
{
  const ref = { code: 'KJV' as const, book: 1, chapter: 1 };
  const id = chapterPassageId(ref);
  assertEq(id, 'bible:KJV:1:1', 'generates ID');
  assertEq(parseChapterPassageId(id), ref, 'parses ID');
}

section('progress-schema: parseChapterProgress');
{
  assertEq(parseChapterProgress(null, 10).ok, false, 'null is rejected');
  assertEq(parseChapterProgress({}, 10).ok, false, 'missing r is rejected');
  assertEq(parseChapterProgress({ v: 1, f: 0, r: 'zzz' }, 10).ok, false, 'invalid hex is rejected');

  const p1 = parseChapterProgress({ v: 1, f: 5, r: '03' }, 10);
  assertEq(p1.ok, true, 'valid progress parses');
  if (p1.ok) {
    assertEq(p1.value, { v: 1, f: 5, r: '03' }, 'returns object');
    assertEq(isVerseRead(p1.value, 1), true, 'verse 1 read');
    assertEq(isVerseRead(p1.value, 2), true, 'verse 2 read');
    assertEq(isVerseRead(p1.value, 3), false, 'verse 3 not read');
    assertEq(versesRead(p1.value), 2, 'verses read count is 2');
    assertEq(percentComplete(p1.value, 10), 0.2, 'percent is 20%');
  }

  const p2 = parseChapterProgress({ v: 1, f: 5, r: 'ff' }, 4);
  assertEq(p2.ok, true, 'valid with extra bits');
  if (p2.ok) {
    assertEq(p2.value.r, '0f', 'masked to maxVerses');
  }
}

section('progress-schema: mutations');
{
  let p = { v: 1, f: 0, r: '' };
  
  p = withVerseRead(p, 1);
  assertEq(p.r, '01', 'marks 1 read');
  assertEq(versesRead(p), 1, 'count 1');

  p = withVerseRead(p, 9);
  assertEq(p.r, '0101', 'marks 9 read in second byte');
  assertEq(versesRead(p), 2, 'count 2');

  p = withFurthest(p, 15);
  assertEq(p.f, 15, 'marks furthest 15');
  p = withFurthest(p, 5);
  assertEq(p.f, 15, 'does not decrease furthest');
}

section('progress-schema: keys');
{
  const ref = { code: 'KJV' as const, book: 1, chapter: 1 };
  const key = chapterKey(ref);
  assertEq(key, 'bc/KJV/001/001', 'formats key');
  assertEq(parseChapterKey(key), ref, 'parses key');
}

section('progress-store: write, verify, quarantine');
{
  const kv = createMemoryKv();
  const store = createBibleProgressStore({ kv, verseCountOf: () => 10, scheduleDeferred: (fn) => fn() });
  const ref = { code: 'KJV' as const, book: 1, chapter: 1 };

  store.markVerseRead(ref, 1);
  const p = store.get(ref);
  assertEq(p, { v: 1, f: 0, r: '01' }, 'get returns marked verse');

  // corrupt the data in kv
  kv.set(chapterKey(ref), JSON.stringify({ v: 1, f: 0, r: 'invalid-hex' }));
  
  const store2 = createBibleProgressStore({ kv, verseCountOf: () => 10, scheduleDeferred: (fn) => fn() });
  const p2 = store2.get(ref);
  assertEq(p2, undefined, 'corrupted record is quarantined');

  const qKeys = kv.getAllKeys().filter(k => k.startsWith('q/'));
  assertEq(qKeys.length, 1, 'one quarantined key');
}

section('chapter-passage: tokenize tracking');
{
  const ref = { code: 'KJV' as const, book: 1, chapter: 1 };
  const rows = [
    { verse: 1, text: "In the beginning God created the heaven and the earth." }, // 10 words
    { verse: 2, text: "And the earth was without form, and void;" } // 8 words
  ];

  const cp = buildChapterPassage(ref, rows);
  assertEq(cp.verses.length, 2, '2 verses');
  assertEq(cp.verses[0], { verse: 1, wordStart: 0, wordEnd: 10 }, 'verse 1 spans 0-10');
  assertEq(cp.verses[1], { verse: 2, wordStart: 10, wordEnd: 18 }, 'verse 2 spans 10-18');

  assertEq(verseIndexAt(cp, 0), 0, 'word 0 is verse 1');
  assertEq(verseIndexAt(cp, 9), 0, 'word 9 is verse 1');
  assertEq(verseIndexAt(cp, 10), 1, 'word 10 is verse 2');
  assertEq(verseIndexAt(cp, 17), 1, 'word 17 is verse 2');
  assertEq(verseIndexAt(cp, 18), -1, 'word 18 out of bounds');

  assertEq(verseRefAt(cp, ref, 0), 'Genesis 1:1', 'word 0 is Gen 1:1');
  assertEq(verseRefAt(cp, ref, 10), 'Genesis 1:2', 'word 10 is Gen 1:2');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
