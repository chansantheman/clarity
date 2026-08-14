/**
 * Self-tests for the persistence layer: record keys, schema validation and
 * upgrades, quarantine, the legacy migration, write-then-verify failure modes,
 * crash recovery, word aggregates, and export/import.
 *
 * Pure JS — run with:
 *   bun scripts/test-history.ts
 *
 * The store takes its key-value backend as a parameter, so all of this runs
 * against an in-memory map with no native module and no simulator.
 */

import {
  EXPORT_KIND,
  makeRecordKey,
  normalizeWord,
  parseExport,
  parseRecord,
  parseRecordKey,
} from '@/lib/history-schema';
import { createHistoryStore, createMemoryKv, type KvBackend } from '@/lib/history-store';
import { isScorable, speakingScore } from '@/lib/score';
import { RECORD_SCHEMA_VERSION, type SessionRecord } from '@/types/history';

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
    `${label} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`,
  );
}

function section(name: string) {
  console.log(`\n== ${name}`);
}

const NOW = new Date(2026, 6, 24, 12, 0, 0).getTime();

/** A well-formed v2 payload. */
function payload(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    v: RECORD_SCHEMA_VERSION,
    id: makeRecordKey(NOW, 1),
    seq: 1,
    completedAt: NOW,
    tzOffsetMinutes: 0,
    mode: 'passage',
    endedReason: 'completed',
    passageId: 'epic-speech',
    contentTitle: 'The Epic Speech',
    durationMs: 120_000,
    accuracy: 85,
    fluency: 82,
    completeness: 90,
    intonation: 75,
    paceWpm: 150,
    targetWpm: 150,
    fillerCount: 2,
    spokenWords: 95,
    source: 'azure',
    wordCounts: { good: 90, mispronounced: 5, omitted: 3, inserted: 2 },
    challengingWords: ['peck'],
    ...overrides,
  };
}

/** The input `recordSession` takes. */
function input(overrides: Record<string, unknown> = {}) {
  return {
    mode: 'passage' as const,
    endedReason: 'completed' as const,
    passageId: 'epic-speech',
    contentTitle: 'The Epic Speech',
    durationMs: 120_000,
    accuracy: 85,
    fluency: 82,
    completeness: 90,
    intonation: 75,
    paceWpm: 150,
    targetWpm: 150,
    fillerCount: 2,
    spokenWords: 95,
    source: 'azure' as const,
    wordCounts: { good: 90, mispronounced: 5, omitted: 3, inserted: 2 },
    challengingWords: ['peck'],
    ...overrides,
  };
}

/** Runs deferred repair writes immediately so tests don't depend on timers. */
const syncSchedule = (fn: () => void) => fn();

function makeStore(over: Partial<Parameters<typeof createHistoryStore>[0]> = {}) {
  return createHistoryStore({
    kv: createMemoryKv(),
    now: () => NOW,
    tzOffsetMinutes: () => 0,
    scheduleWrite: syncSchedule,
    ...over,
  });
}

/** Fault injection: accept a write but lie on read back, or throw outright. */
function faultyKv(base: KvBackend, faults: { throwOn?: RegExp; lieOn?: RegExp }): KvBackend {
  return {
    ...base,
    set(key, value) {
      if (faults.throwOn?.test(key)) throw new Error('simulated write failure');
      if (faults.lieOn?.test(key)) return; // silently drop
      base.set(key, value);
    },
    getString: (key) => base.getString(key),
  };
}

// ---------------------------------------------------------------------------
section('record keys');
{
  const a = makeRecordKey(NOW, 1);
  const b = makeRecordKey(NOW + 1, 1);
  const c = makeRecordKey(NOW, 2);
  assert(a < b, 'a later timestamp sorts later');
  assert(a < c, 'same millisecond falls back to seq order');

  // The whole point of fixed-width padding: string order == numeric order.
  const shuffled = [
    makeRecordKey(NOW + 5_000, 9),
    makeRecordKey(NOW, 1),
    makeRecordKey(NOW + 5_000, 2),
    makeRecordKey(NOW - 90_000, 4),
  ];
  const byString = [...shuffled].sort();
  const byValue = [...shuffled].sort((x, y) => {
    const px = parseRecordKey(x)!;
    const py = parseRecordKey(y)!;
    return px.completedAt - py.completedAt || px.seq - py.seq;
  });
  assertEq(byString, byValue, 'lexicographic order equals chronological order');

  // Constant width across a very wide timestamp range, so ordering can't break
  // when the clock crosses a digit boundary.
  assertEq(makeRecordKey(1, 1).length, makeRecordKey(9_999_999_999_999, 1).length,
    'keys are a constant width');

  assertEq(parseRecordKey(a), { completedAt: NOW, seq: 1 }, 'round-trips');
  assertEq(parseRecordKey('nope'), null, 'rejects a foreign key');
  assertEq(parseRecordKey('s/abc/def'), null, 'rejects a malformed key');

  assertEq(normalizeWord('Peppers,'), 'peppers', 'strips punctuation and lowercases');
  assertEq(normalizeWord("don't"), "don't", 'keeps internal apostrophes');
  assertEq(normalizeWord('...'), '', 'punctuation-only normalizes to empty');
}

// ---------------------------------------------------------------------------
section('parseRecord: validation');
{
  const ok = parseRecord(payload());
  assert(ok.ok, 'a canonical v2 record parses');

  // Every required field, table-driven. These are the payloads that used to take
  // down every analytics screen.
  const rejects: [string, unknown][] = [
    ['not-an-object', 42],
    ['null', null],
    ['missing completedAt', { ...payload(), completedAt: undefined }],
    ['NaN completedAt', { ...payload(), completedAt: NaN }],
    ['unknown mode', { ...payload(), mode: 'karaoke' }],
    ['negative durationMs', { ...payload(), durationMs: -1 }],
    ['missing wordCounts', { ...payload(), wordCounts: undefined }],
    ['wordCounts not an object', { ...payload(), wordCounts: 'lots' }],
    ['wordCounts missing a key', { ...payload(), wordCounts: { good: 1 } }],
    ['wordCounts with NaN', { ...payload(), wordCounts: { good: NaN, mispronounced: 0, omitted: 0, inserted: 0 } }],
  ];
  for (const [label, raw] of rejects) {
    assertEq(parseRecord(raw).ok, false, `rejects ${label}`);
  }

  // Repaired rather than rejected: a slightly wrong value is still real history.
  const clamped = parseRecord({ ...payload(), accuracy: 140, fillerCount: -3 });
  assert(clamped.ok && clamped.record.accuracy === 100, 'clamps an out-of-range measure');
  assert(clamped.ok && clamped.record.fillerCount === 0, 'floors a negative count');

  // Pace is wpm, not a 0-100 measure, so it must not be clamped to 100.
  const fast = parseRecord({ ...payload(), paceWpm: 220 });
  assert(fast.ok && fast.record.paceWpm === 220, 'pace is not clamped to 100');

  const dirtyWords = parseRecord({ ...payload(), challengingWords: ['ok', 5, null, 'a', 'b', 'c', 'd'] });
  assert(dirtyWords.ok && dirtyWords.record.challengingWords.length === 5,
    'filters non-strings and caps challengingWords at five');
}

// ---------------------------------------------------------------------------
section('parseRecord: schema upgrades');
{
  // A real v1 record: no version, no seq, no tz, no endedReason, and a persisted
  // overallScore that must not survive.
  const v1 = {
    id: 'abc-123',
    completedAt: NOW,
    mode: 'passage',
    passageId: 'epic-speech',
    durationMs: 120_000,
    overallScore: 88,
    accuracy: 85,
    fluency: 82,
    completeness: 90,
    intonation: 75,
    paceWpm: 150,
    targetWpm: 150,
    fillerCount: 2,
    source: 'azure',
    wordCounts: { good: 90, mispronounced: 5, omitted: 3, inserted: 2 },
    challengingWords: ['peck'],
  };
  const up = parseRecord(v1, { fallbackSeq: 7 });
  assert(up.ok, 'a v1 record upgrades');
  if (up.ok) {
    assertEq(up.upgraded, true, 'flagged as upgraded');
    assertEq(up.record.v, RECORD_SCHEMA_VERSION, 'stamped with the current version');
    assertEq(up.record.seq, 7, 'seq comes from the caller');
    assertEq(up.record.id, makeRecordKey(NOW, 7), 're-keyed so id is the storage key');
    assertEq(up.record.endedReason, 'completed', 'defaults to a deliberate finish');
    assert(typeof up.record.tzOffsetMinutes === 'number', 'gets a timezone offset');
    assert(!('overallScore' in up.record), 'the persisted score is dropped');
    // Grandfathered: no spokenWords means it stays scorable rather than being
    // retroactively erased from the user's history.
    assertEq(up.record.spokenWords, undefined, 'spokenWords stays absent');
    assert(speakingScore(up.record) != null, 'and it is still scorable');
  }

  // Idempotent: upgrading an already-upgraded record changes nothing.
  if (up.ok) {
    const again = parseRecord(up.record, { fallbackSeq: 7 });
    assert(again.ok && JSON.stringify(again.record) === JSON.stringify(up.record),
      'upgrade is idempotent');
    assertEq(again.ok && again.upgraded, false, 'and is not re-flagged as upgraded');
  }

  // A record from a NEWER build is kept and marked read-only. Quarantining it
  // would strand real history after an OTA rollback; rewriting it would delete
  // the newer build's fields.
  const future = parseRecord({ ...payload(), v: 99 });
  assert(future.ok, 'a newer-schema record is kept, not rejected');
  assertEq(future.ok && future.readOnly, true, 'and marked read-only');
  assertEq(future.ok && future.record.v, 99, 'keeping its own version');

  const futureKey = makeRecordKey(NOW, 99);
  const futureRaw = JSON.stringify({ ...payload(), id: futureKey, seq: 99, v: 99, mode: 'karaoke' });
  const futureKv = createMemoryKv({ [futureKey]: futureRaw });
  const futureStore = makeStore({ kv: futureKv });
  assertEq(futureStore.getRecords().length, 1, 'unknown future modes remain readable');
  assertEq(futureKv.getString(futureKey), futureRaw, 'future payload is never rewritten');
  assertEq(futureStore.getQuarantine().length, 0, 'future payload is not quarantined');
}


// ---------------------------------------------------------------------------
section('store: hydrate, append, snapshot identity');
{
  const store = makeStore();
  assertEq(store.getRecords().length, 0, 'an empty store hydrates to nothing');

  // The useSyncExternalStore contract: identical reference between mutations.
  const first = store.getRecords();
  assert(store.getRecords() === first, 'snapshot reference is stable');

  const written = store.recordSession(input());
  assert(written.ok, 'a healthy session persists');
  assert(store.getRecords() !== first, 'the reference changes on a mutation');
  assertEq(store.getRecords().length, 1, 'and the record is in the snapshot');
  if (written.ok) {
    assertEq(written.record.id, makeRecordKey(NOW, 1), 'id is the storage key');
    assertEq(written.record.seq, 1, 'seq starts at one');
    assertEq(written.record.contentTitle, 'The Epic Speech', 'content title is snapshotted');
  }

  // Seq is monotonic and matches the persisted counter.
  const second = store.recordSession(input());
  assertEq(second.ok && second.record.seq, 2, 'seq increments');
  assertEq(store.getStats().maxSeq, 2, 'the counter agrees with the records');

  // Silence is not practice, at ANY duration. The old guard required BOTH a short
  // duration and nothing spoken, so 15s of silence persisted as a scored session.
  const silent = store.recordSession(input({ spokenWords: 0, durationMs: 15_000 }));
  assertEq(silent.ok, false, 'a silent session is not persisted');
  assertEq(silent.ok === false && silent.reason, 'no-speech', 'and says why');
  assertEq(store.getRecords().length, 2, 'the store is unchanged');

  // ...but real speech IS practice, at any duration. Freestyle results carry
  // `words: []`, so `wordCounts.good` is 0 for every freestyle session no matter
  // how much was said — a short-duration guard keyed on it silently discarded
  // every sub-10s freestyle attempt that had a full transcript.
  const shortFreestyle = store.recordSession(
    input({
      mode: 'freestyle',
      passageId: undefined,
      topicId: 'a-place-i-love',
      durationMs: 5_000,
      spokenWords: 28,
      wordCounts: { good: 0, mispronounced: 0, omitted: 0, inserted: 0 },
      challengingWords: [],
    }),
  );
  assertEq(shortFreestyle.ok, true, 'a short freestyle session with speech IS persisted');
  assertEq(store.getRecords().length, 3, 'and reaches the store');
  // It still must not reach the skills: too short and too few words to judge.
  assertEq(
    shortFreestyle.ok === true && isScorable(shortFreestyle.record),
    false,
    'but it stays out of the skills, counting only toward effort',
  );

  // The same shape on a passage, which was never affected, must keep working.
  const shortPassage = store.recordSession(input({ durationMs: 5_000, spokenWords: 28 }));
  assertEq(shortPassage.ok, true, 'a short passage session with speech is persisted too');
}

// ---------------------------------------------------------------------------
section('store: write failure semantics');
{
  // Memory must equal disk. A write that cannot be verified is not added to the
  // snapshot, and the caller is told so it can stop trusting the store.
  const throwing = makeStore({ kv: faultyKv(createMemoryKv(), { throwOn: /^s\// }) });
  const failed1 = throwing.recordSession(input());
  assertEq(failed1.ok, false, 'a throwing write reports failure');
  assertEq(failed1.ok === false && failed1.reason, 'persist-failed', 'with the right reason');
  assertEq(throwing.getRecords().length, 0, 'and nothing enters the snapshot');
  assert(failed1.ok === false && failed1.record != null,
    'the record still comes back so the UI can show the finished session');

  // A backend that accepts the write but loses it must be caught by verification.
  const lying = makeStore({ kv: faultyKv(createMemoryKv(), { lieOn: /^s\// }) });
  const failed2 = lying.recordSession(input());
  assertEq(failed2.ok, false, 'a silently-dropped write is caught by read-back');
  assertEq(lying.getRecords().length, 0, 'and does not enter the snapshot');

  assertEq(makeStore().getStats().durable, true, 'a real backend reports durable');
  assertEq(makeStore({ durable: false }).recordSession(input()).ok && makeStore({ durable: false }).getStats().durable,
    false, 'the memory fallback reports itself as not durable');
}

// ---------------------------------------------------------------------------
section('store: quarantine isolates a bad record');
{
  const kv = createMemoryKv();
  // One good record, one unparseable, one structurally invalid.
  kv.set(makeRecordKey(NOW, 1), JSON.stringify(payload({ id: makeRecordKey(NOW, 1), seq: 1 })));
  kv.set(makeRecordKey(NOW + 1, 2), '{not json');
  kv.set(makeRecordKey(NOW + 2, 3), JSON.stringify({ ...payload(), wordCounts: 'broken' }));

  const store = makeStore({ kv });
  const records = store.getRecords();
  assertEq(records.length, 1, 'the good record still hydrates');
  const quarantined = store.getQuarantine();
  assertEq(quarantined.length, 2, 'both bad rows are quarantined');
  assert(quarantined.some((q) => q.reason === 'invalid-json'), 'the unparseable row says why');
  assert(quarantined.some((q) => q.reason === 'bad-wordCounts'), 'the invalid row says why');
  // Moved aside, not left to fail on every boot.
  assertEq(kv.contains(makeRecordKey(NOW + 1, 2)), false, 'the bad key is removed');
  assert(quarantined.every((q) => q.raw.length > 0), 'the original payload is preserved');
}

// ---------------------------------------------------------------------------
section('store: legacy sessions.json migration');
{
  const legacy = JSON.stringify({
    version: 1,
    records: [
      { ...payload(), v: undefined, seq: undefined, id: 'old-2', completedAt: NOW },
      { ...payload(), v: undefined, seq: undefined, id: 'old-1', completedAt: NOW - 86_400_000 },
    ],
  });

  const kv = createMemoryKv();
  const store = makeStore({ kv, readLegacyJson: () => legacy });
  assertEq(store.getRecords().length, 2, 'both legacy records import');
  assertEq(
    store.getRecords().map((r) => r.seq),
    [1, 2],
    'seq follows chronological order, not file order',
  );
  assertEq(store.getStats().migratedLegacy, true, 'the guard is set');

  // Retrying must not duplicate. seq is index-derived, so a retry regenerates
  // byte-identical keys and every write is a no-op.
  const store2 = makeStore({ kv, readLegacyJson: () => legacy });
  assertEq(store2.getRecords().length, 2, 'a second launch does not duplicate');

  // A partial migration (guard never set) also converges, because keys are a pure
  // function of the record.
  const kv3 = createMemoryKv();
  makeStore({ kv: kv3, readLegacyJson: () => legacy });
  kv3.remove('meta/migratedJsonV1');
  const store4 = makeStore({ kv: kv3, readLegacyJson: () => legacy });
  assertEq(store4.getRecords().length, 2, 'an interrupted migration converges on a retry');

  // The version field the old store wrote but never read is finally honoured.
  const future = JSON.stringify({ version: 9, records: [payload()] });
  const store5 = makeStore({ kv: createMemoryKv(), readLegacyJson: () => future });
  assertEq(store5.getRecords().length, 0, 'refuses to import a newer legacy version');

  const store6 = makeStore({ kv: createMemoryKv(), readLegacyJson: () => 'not json' });
  assertEq(store6.getRecords().length, 0, 'an unreadable legacy file does not throw');
}

// ---------------------------------------------------------------------------
section('store: crash recovery from a checkpoint');
{
  const kv = createMemoryKv();
  kv.set(
    'meta/inflight',
    JSON.stringify({
      startedAt: NOW - 300_000,
      updatedAt: NOW - 200_000,
      mode: 'passage',
      passageId: 'epic-speech',
      contentTitle: 'The Epic Speech',
      targetWpm: 150,
      elapsedMs: 95_000,
      spokenWords: 140,
      fillerCount: 3,
    }),
  );

  const store = makeStore({ kv });
  const records = store.getRecords();
  assertEq(records.length, 1, 'the interrupted session is recovered');
  assertEq(records[0].endedReason, 'interrupted', 'marked interrupted');
  assertEq(records[0].durationMs, 95_000, 'keeping the practice time it earned');
  // Effort only: unscorable by construction, so the zeros never reach a skill.
  assertEq(speakingScore(records[0]), null, 'and contributes no score');
  assertEq(kv.contains('meta/inflight'), false, 'the checkpoint is cleared');

  // Recovered exactly once.
  assertEq(makeStore({ kv }).getRecords().length, 1, 'not recovered twice');

  // A checkpoint with nothing spoken is discarded rather than recorded.
  const kv2 = createMemoryKv();
  kv2.set('meta/inflight', JSON.stringify({
    startedAt: NOW - 300_000, updatedAt: NOW - 200_000, mode: 'passage',
    targetWpm: 150, elapsedMs: 95_000, spokenWords: 0, fillerCount: 0,
  }));
  assertEq(makeStore({ kv: kv2 }).getRecords().length, 0, 'a silent checkpoint is discarded');

  // A checkpoint written seconds ago is STILL recovered: hydration only runs in a
  // fresh JS context, so it can only be from a dead run, and reopening the app
  // right after a crash is the most common real case.
  const kv3 = createMemoryKv();
  kv3.set('meta/inflight', JSON.stringify({
    startedAt: NOW - 20_000, updatedAt: NOW - 1_000, mode: 'passage',
    targetWpm: 150, elapsedMs: 20_000, spokenWords: 40, fillerCount: 1,
  }));
  assertEq(makeStore({ kv: kv3 }).getRecords().length, 1, 'a recent crash is still recovered');

  // Too little practice time to be worth a record.
  const kv4 = createMemoryKv();
  kv4.set('meta/inflight', JSON.stringify({
    startedAt: NOW - 5_000, updatedAt: NOW - 2_000, mode: 'passage',
    targetWpm: 150, elapsedMs: 3_000, spokenWords: 8, fillerCount: 0,
  }));
  assertEq(makeStore({ kv: kv4 }).getRecords().length, 0, 'a trivial checkpoint is discarded');
}

// ---------------------------------------------------------------------------
section('store: word mastery aggregates');
{
  const store = makeStore();
  const words = [
    { word: 'peppers', status: 'mispronounced' },
    { word: 'pickled', status: 'good' },
    // Fillers are already penalized through fillerCount; they are not words to
    // master, so they must never enter the aggregates.
    { word: 'um', status: 'inserted' },
    { word: '.', status: 'good' },
  ];
  store.recordSession(input({ words }));
  const stats = store.getWordStats();
  assertEq(stats.length, 2, 'only real reference words are aggregated');
  const peppers = stats.find((s) => s.word === 'peppers')!;
  assertEq(peppers.mispronounced, 1, 'a miss is counted');
  assertEq(peppers.everMissed, true, 'and flagged as ever-missed');
  assertEq(peppers.cleanStreak, 0, 'with no clean streak');
  const pickled = stats.find((s) => s.word === 'pickled')!;
  assertEq(pickled.cleanStreak, 1, 'a clean reading starts a streak');
  assertEq(pickled.everMissed, false, 'and is not marked as ever-missed');

  // A clean run after a miss builds the streak that defines "mastered".
  store.recordSession(input({ words: [{ word: 'peppers', status: 'good' }] }));
  assertEq(store.getWordStats().find((s) => s.word === 'peppers')!.cleanStreak, 1,
    'a later clean reading rebuilds the streak');

  // An abandoned session must not touch mastery: everything past the stop point
  // is marked omitted and would look like a collapse.
  const before = JSON.stringify(store.getWordStats());
  store.recordSession(input({
    endedReason: 'abandoned',
    words: [{ word: 'peppers', status: 'omitted' }, { word: 'pickled', status: 'omitted' }],
  }));
  assertEq(JSON.stringify(store.getWordStats()), before, 'an abandoned session leaves mastery alone');
}

// ---------------------------------------------------------------------------
section('store: export / import');
{
  const store = makeStore();
  store.recordSession(input({ words: [{ word: 'peppers', status: 'mispronounced' }] }));
  store.recordSession(input({ completedAt: NOW + 1_000 }));
  const blob = store.exportHistory();

  const parsed = parseExport(blob);
  assert(parsed.ok, 'an export parses back');
  assertEq(parsed.ok && parsed.records.length, 2, 'with every record');
  assertEq(JSON.parse(blob).kind, EXPORT_KIND, 'and is tagged');

  // Round trip: clear, restore, everything comes back.
  const restored = makeStore();
  const summary = restored.importHistory(blob);
  assertEq(summary.imported, 2, 'import restores both records');
  assertEq(restored.getRecords().length, 2, 'and the snapshot reflects them');
  assertEq(restored.getWordStats().length, 1, 'word aggregates travel too');

  // Idempotent: ids are a pure function of (completedAt, seq), so a second import
  // is a no-op rather than a doubled history.
  const again = restored.importHistory(blob);
  assertEq(again.imported, 0, 'a second import imports nothing');
  assertEq(again.duplicates, 2, 'and reports them as duplicates');
  assertEq(restored.getRecords().length, 2, 'the history is unchanged');

  // A malformed blob returns a summary instead of throwing.
  assertEq(makeStore().importHistory('not json').ok, false, 'invalid JSON is reported');
  assertEq(makeStore().importHistory('{"kind":"nope"}').ok, false, 'a wrong envelope is reported');

  // Invalid rows are counted, not thrown.
  const tampered = JSON.stringify({
    kind: EXPORT_KIND,
    version: 1,
    exportedAt: NOW,
    records: [payload(), { ...payload(), mode: 'karaoke' }],
    words: [],
  });
  const mixed = makeStore().importHistory(tampered);
  assertEq(mixed.imported, 1, 'the good row imports');
  assertEq(mixed.invalid, 1, 'the bad row is counted as invalid');

  // Replace wipes first.
  const target = makeStore();
  target.recordSession(input({ passageId: 'other', contentTitle: 'Other' }));
  target.importHistory(blob, 'replace');
  assertEq(target.getRecords().length, 2, 'replace substitutes the whole history');
}

// ---------------------------------------------------------------------------
section('store: clear');
{
  const store = makeStore({ readLegacyJson: () => null });
  store.recordSession(input());
  assertEq(store.getRecords().length, 1, 'a record exists');
  store.clearAll();
  assertEq(store.getRecords().length, 0, 'clear empties the store');
  assertEq(store.getWordStats().length, 0, 'including word aggregates');
  assertEq(store.getStats().maxSeq, 0, 'and resets the counter');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
