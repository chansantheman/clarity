/**
 * Self-tests for the bible domain.
 *
 * Pure JS — run with:
 *   bun scripts/test-bible.ts
 */

import { parseRef, formatRef, chapterPassageId, parseChapterPassageId, formatChapterRef, formatVerseRef } from '../lib/bible/ref';
import { bibleRollup } from '../lib/bible/rollup';
import type { SessionRecord } from '../types/history';
import { parseChapterProgress, withVerseRead, withFurthest, isVerseRead, versesRead, percentComplete, isChapterComplete, chapterKey, parseChapterKey } from '../lib/bible/progress-schema';
import { createBibleProgressStore } from '../lib/bible/progress-store';
import { buildChapterPassage, verseBankThreshold, verseIndexAt, verseRefAt } from '../lib/bible/chapter-passage';
import { createMemoryKv, type KvBackend } from '../lib/history-store';

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
  assertEq(parseRef('KJV.001x.1'), null, 'rejects trailing book characters');
  assertEq(parseRef('KJV.1.1.extra'), null, 'rejects extra ref segments');
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

  assertEq(parseChapterProgress({ v: 1, f: 0, r: '0F' }, 8).ok, false, 'uppercase hex is rejected');
  assertEq(parseChapterProgress({ v: 1, f: 0, r: '0' }, 8).ok, false, 'odd-length hex is rejected');
  assertEq(parseChapterProgress({ v: 1, f: 0, r: 'zz' }, 8).ok, false, 'non-hex is rejected');
  const old = parseChapterProgress({ v: 0, f: -4, r: '01' }, 8);
  assert(old.ok && old.upgraded && old.value.f === 0, 'old version upgrades and clamps furthest');
  const future = parseChapterProgress({ v: 99, f: 2, r: '01' }, 8);
  assert(future.ok && future.readOnly, 'future progress is read-only');
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

section('progress-schema: full bitmap and defensive math');
{
  let p = { v: 1, f: 0, r: '' };
  for (let verse = 1; verse <= 176; verse += 1) p = withVerseRead(p, verse);
  assertEq(p.r.length, 44, '176 verses use exactly 44 hex characters');
  assertEq(versesRead(p), 176, 'full bitmap popcount is exact');
  assertEq(percentComplete(p, 176), 1, 'full bitmap is 100%');
  assertEq(isChapterComplete(p, 176), true, 'full bitmap completes the chapter');
  assertEq(percentComplete(p, 0), 0, 'zero verse chapters never divide by zero');
  assertEq(percentComplete({ v: 1, f: 0, r: 'ff' }, 1), 1, 'percentage is capped at 100%');
}

section('progress-schema: keys');
{
  const ref = { code: 'KJV' as const, book: 1, chapter: 1 };
  const key = chapterKey(ref);
  assertEq(key, 'bc/KJV/001/001', 'formats key');
  assertEq(parseChapterKey(key), ref, 'parses key');
  assertEq(parseChapterKey('s/not-a-bible-key'), null, 'rejects a history key');
  assertEq(parseChapterKey('bc/'), null, 'rejects an empty key');
  assertEq(parseChapterKey('bc/KJV/x/001'), null, 'rejects a non-numeric book');
  assertEq(parseChapterKey('bc/KJV/001/1x1'), null, 'rejects a non-canonical chapter width');
}

section('progress-store: write, verify, quarantine');
{
  const kv = createMemoryKv();
  const store = createBibleProgressStore({ kv, verseCountOf: () => 10, scheduleDeferred: (fn) => fn() });
  const ref = { code: 'KJV' as const, book: 1, chapter: 1 };

  store.markVerseRead(ref, 1);
  assertEq(store.markVerseRead(ref, 11), false, 'out-of-range verse is rejected');
  assertEq(store.markFurthest(ref, 11), false, 'out-of-range furthest verse is rejected');
  const p = store.get(ref);
  assertEq(p, { v: 1, f: 0, r: '01' }, 'get returns marked verse');

  const restartedStore = createBibleProgressStore({ kv, verseCountOf: () => 10, scheduleDeferred: (fn) => fn() });
  assertEq(restartedStore.get(ref), p, 'coverage survives store hydration');

  // Deferred schema repair cannot overwrite a verse boundary committed after
  // hydration has scanned the old payload.
  const pending: (() => void)[] = [];
  const oldKv = createMemoryKv({
    [chapterKey(ref)]: JSON.stringify({ v: 0, f: 0, r: '01' }),
  });
  const oldStore = createBibleProgressStore({ kv: oldKv, verseCountOf: () => 10, scheduleDeferred: (fn) => pending.push(fn) });
  oldStore.getAll();
  oldStore.markVerseRead(ref, 2);
  for (const task of pending) task();
  assertEq(JSON.parse(oldKv.getString(chapterKey(ref))!).r, '03', 'deferred repair preserves a newer write');

  // corrupt the data in kv
  kv.set(chapterKey(ref), JSON.stringify({ v: 1, f: 0, r: 'invalid-hex' }));
  
  const store2 = createBibleProgressStore({ kv, verseCountOf: () => 10, scheduleDeferred: (fn) => fn() });
  const p2 = store2.get(ref);
  assertEq(p2, undefined, 'corrupted record is quarantined');

  const qKeys = kv.getAllKeys().filter(k => k.startsWith('q/'));
  assertEq(qKeys.length, 1, 'one quarantined key');

  // A failed update must preserve the last verified value on disk and in memory.
  const persistent = createMemoryKv({ [chapterKey(ref)]: JSON.stringify(p) });
  const lying: KvBackend = {
    ...persistent,
    set: () => {},
  };
  const failedStore = createBibleProgressStore({ kv: lying, verseCountOf: () => 10, scheduleDeferred: (fn) => fn() });
  const beforeSnapshot = failedStore.getAll();
  assertEq(failedStore.markVerseRead(ref, 2), false, 'a dropped progress write reports failure');
  assertEq(failedStore.getAll(), beforeSnapshot, 'failed progress keeps snapshot identity');
  assertEq(persistent.getString(chapterKey(ref)), JSON.stringify(p), 'failed update keeps disk value');

  // A newer progress schema is readable but never writable by this build.
  const futureRaw = JSON.stringify({ v: 99, f: 1, r: '01', futureField: 'keep me' });
  const futureKv = createMemoryKv({ [chapterKey(ref)]: futureRaw });
  const futureStore = createBibleProgressStore({ kv: futureKv, verseCountOf: () => 10, scheduleDeferred: (fn) => fn() });
  assertEq(futureStore.markVerseRead(ref, 2), false, 'future progress remains read-only');
  assertEq(futureKv.getString(chapterKey(ref)), futureRaw, 'future progress is not rewritten');

  const bsbRef = { code: 'BSB' as const, book: 1, chapter: 1 };
  const mixedKv = createMemoryKv({
    [chapterKey(ref)]: JSON.stringify(p),
    [chapterKey(bsbRef)]: JSON.stringify({ v: 1, f: 0, r: '01' }),
  });
  const mixedStore = createBibleProgressStore({ kv: mixedKv, verseCountOf: () => 10, scheduleDeferred: (fn) => fn() });
  mixedStore.clearTranslation('KJV');
  assertEq(mixedKv.contains(chapterKey(ref)), false, 'clearTranslation removes only KJV');
  assertEq(mixedKv.contains(chapterKey(bsbRef)), true, 'clearTranslation preserves BSB');
}

section('rollup: records and coverage');
{
  const ref = { code: 'KJV' as const, book: 1, chapter: 1 };
  let progress = { v: 1, f: 1, r: '' };
  progress = withVerseRead(progress, 1);
  const progressMap = new Map([[chapterKey(ref), progress]]);
  const record = (overrides: Partial<SessionRecord>): SessionRecord => ({
    v: 2,
    id: 'test',
    seq: 1,
    completedAt: 1_000,
    tzOffsetMinutes: 0,
    mode: 'scripture',
    endedReason: 'completed',
    passageId: chapterPassageId(ref),
    durationMs: 1_000,
    accuracy: 0,
    fluency: 0,
    completeness: 0,
    intonation: 0,
    paceWpm: 0,
    targetWpm: 130,
    fillerCount: 0,
    spokenWords: 10,
    source: 'live',
    wordCounts: { good: 0, mispronounced: 0, omitted: 0, inserted: 0 },
    challengingWords: [],
    ...overrides,
  });
  const rollup = bibleRollup([
    record({}),
    record({ id: 'abandoned', seq: 2, completedAt: 2_000, endedReason: 'abandoned', durationMs: 2_000 }),
    record({ id: 'second-completion', seq: 3, completedAt: 3_000 }),
    record({ id: 'wrong-mode', mode: 'passage' }),
    record({ id: 'bad-id', passageId: 'bible:KJV:not-a-ref' }),
  ], progressMap, 'KJV');
  const chapter = rollup.byChapter.get(chapterPassageId(ref));
  assert(!!chapter, 'creates a rollup for touched chapter');
  assertEq(chapter?.versesRead, 1, 'coverage comes from the bitmap');
  assertEq(chapter?.attempts, 3, 'only scripture records with valid ids count');
  assertEq(chapter?.completions, 2, 'completed attempts count separately');
  assertEq(chapter?.totalMs, 4_000, 'all valid attempt time is summed');
  assertEq(rollup.byBook.length, 66, 'always returns all canonical books');
  assertEq(rollup.byBook[0].chaptersComplete, 0, 'partial coverage does not complete a chapter');
  assertEq(rollup.lastRead?.at, 3_000, 'last read uses the latest valid scripture record');
  assertEq(rollup.lastRead?.verse, 1, 'last read carries the furthest covered verse');
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
  assertEq(verseBankThreshold(cp.verses[0]), 10, 'a complete ten-word verse banks at its end');
  assertEq(verseBankThreshold({ verse: 3, wordStart: 18, wordEnd: 18 }), 18, 'an empty verse has a stable threshold');

  assertEq(verseRefAt(cp, ref, 0), 'Genesis 1:1', 'word 0 is Gen 1:1');
  assertEq(verseRefAt(cp, ref, 10), 'Genesis 1:2', 'word 10 is Gen 1:2');

  const edge = buildChapterPassage(ref, [
    { verse: 1, text: 'One. Two. Three. Four. Five. Six. Seven.' },
    { verse: 2, text: '   ' },
    { verse: 3, text: 'Eight.' },
  ]);
  assertEq(edge.verses[1], { verse: 2, wordStart: 7, wordEnd: 7 }, 'whitespace verse keeps an empty span');
  assertEq(verseIndexAt(edge, 7), 2, 'word after an empty verse maps to the next verse');
  assertEq(verseIndexAt(edge, 8), -1, 'edge passage ends after its final word');

  const longFixture = buildChapterPassage(
    ref,
    Array.from({ length: 176 }, (_, index) => ({ verse: index + 1, text: `Verse ${index + 1}.` })),
  );
  assertEq(longFixture.verses.length, 176, '176-verse fixture maps every verse');
  assertEq(longFixture.verses[175].wordEnd, 352, 'long fixture offsets remain contiguous');
  assertEq(verseIndexAt(longFixture, 351), 175, 'long fixture final word maps correctly');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
