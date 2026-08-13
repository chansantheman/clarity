# Lane A — Data & Architecture

The engineering substrate for Speak the Bible: how scripture gets into the binary, how it
gets queried, how a chapter becomes something the existing session engine can read, how
every verse gets tracked, and what order to build it in.

Everything below is verified against the real files in this repo, the real `kjv.db`, and the
versioned Expo SDK 57 docs. Anything I could not verify is marked `UNVERIFIED:` inline.

---

## A0. Verified ground truth (measured, not assumed)

Things I checked myself, because several of them change the design:

**The database.**

| Fact | Value | How verified |
|---|---|---|
| `kjv.db` size | 4,751,360 bytes | `ls -l` |
| `KJV_verses` rows | 31,102 | `select count(*)` |
| `KJV_books` rows | 66 | `select count(*)` |
| Distinct chapters | **1,189** | `select count(*) from (select distinct book_id,chapter from KJV_verses)` |
| Total words (whitespace count) | **791,184** | `sum(length(text)-length(replace(text,' ',''))+1)` |
| Mean words/chapter | ~665 | derived |
| Largest chapter | Psalm 119 — 176 verses, 2,446 words | grouped query |
| Smallest chapter | Psalm 117 — 2 verses, 34 words | grouped query |
| `page_size` / `encoding` / `journal_mode` | 4096 / UTF-8 / `delete` | `pragma` |
| Query plan for a chapter read, **as shipped** | `SCAN KJV_verses` + `USE TEMP B-TREE FOR ORDER BY` | `explain query plan` |
| Query plan **after** `CREATE INDEX ... (book_id, chapter, verse)` | `SEARCH KJV_verses USING INDEX` | `explain query plan` |
| Cost of that index | 4,751,360 → **5,156,864** bytes (+396 KB, +8.5%) | measured on a copy |
| gzip -9 of the indexed file | 1,791,883 bytes | measured |
| Verse text markup | essentially clean; **1 row of 31,102** contains `[` (2 John 1:9, `[but]` — an italicised-supplied-word marker) | `like '%[%'` |

**Sibling translations follow the same convention** — verified on `ASV.db`, `BSB.db`, `YLT.db`,
`Geneva1599.db`: tables are `translations`, `<CODE>_books`, `<CODE>_verses`, `sqlite_sequence`.
The prefix is the filename stem, case-sensitively (`Geneva1599_books`). All 14 files are
4.5–4.8 MB.

**Licensing.** `kjv.db`'s own `translations` row says `GPL`; `ASV.db`'s says `Public Domain`.
The KJV *text* is public domain in the US, so the GPL almost certainly attaches to the
packaging/Strong's annotations of the upstream project rather than the words. This is not a
blocker, but it is a real decision: **if the GPL claim can't be traced to a permissive
upstream, ship `ASV.db` as the bundled default and offer KJV as a download.** Flagging only —
Lane C owns the shipping call.

**The codebase.**

- `expo-sqlite` is **not** a dependency. `package.json` has `expo-asset ~57.0.7` and
  `expo-file-system ~57.0.1`, and no `metro.config.js` exists.
- `@expo/metro-config` (build/ExpoMetroConfig.js:230-236) already appends `['db']` to
  `assetExts` — the comment literally reads *"Add default support for `expo-sqlite` file
  types."* **So `require('../assets/bible/kjv.db')` resolves with no metro config change.**
- **`upgradeRecord` does not exist.** `grep -rn upgradeRecord` over the whole repo returns
  exactly one hit: the doc comment at `types/history.ts:30`. The upgrade logic actually lives
  inline in `parseRecord` (`lib/history-schema.ts:146-232`), keyed off `const version =
  isFiniteNumber(r.v) ? r.v : 1`. Anything below that says "add an `upgradeRecord` step" means
  "add a branch inside the parse function," and the new Bible module should name its step
  function honestly.
- `getAnyPassage` / `modeForId` (`lib/passage-catalog.ts`) are called from **exactly one
  place**: `app/session/[passageId].tsx:40,97`. Nothing else in the repo imports them. That
  makes a separate Bible session route cheap — `passage-catalog.ts` needs **zero** changes.
- `GlassTabItem` (`components/glass-tabs/glass-tab-bar.tsx:88-93`) is `{ name, label, icon:
  LucideIcon }`, and `tabCount` is `Children.count(children)` (line 135) — the bar is already
  dynamic, no hardcoded 3.
- `app/session/_layout.tsx` is `<Stack screenOptions={{ headerShown: false }} />` inside
  `SessionContext`, and the whole `session` group is a `fullScreenModal` (`app/_layout.tsx:91-94`).
  A new file under `app/session/` inherits all of that for free, including `setResult`.
- `bun:sqlite` works against `kjv.db` right now (bun 1.3.14, verified with a live query
  returning 31,102). The build-time preprocessing script needs **no new dependency**.

**Lucide icon (verified by reading the package source, not guessed).**
`ls node_modules/lucide-react-native/dist/types/icons | grep -iE 'book|scroll'` →
`book-open.d.ts` exists. `dist/cjs/icons/book-open.js` defines `BookOpen` as exactly two
paths: `M12 5v16` (a straight vertical line — **zero area, so it contributes nothing when
filled**) and the closed book outline. Because `GlassTabButton` renders
`<item.icon size={ICON_SIZE} color={tint} fill={tint} />` unconditionally
(glass-tab-bar.tsx:368), the tab icon *must* survive being filled. `BookOpen` does: it becomes
a solid book silhouette with a stroked spine. **`Scroll` does not** — its first path
`M19 17V5a2 2 0 0 0-2-2H4` is open and fills into a triangular blob. **Use `BookOpen`.**

---

## A1. Bible data packaging

### A1.1 Decision

**Ship a pre-indexed `kjv.db` as a bundled asset, copy it once to the device's SQLite
directory on first launch, and query it through `expo-sqlite`'s async API from a
translation-agnostic service.** That is option (a), with option (c) (download later
translations) layered on the *identical* code path.

Rejected, with reasons:

- **(b) Preprocess to JSON / typed TS modules.** Measured: the whole Bible as JSON is
  5,641,590 bytes — *larger* than the DB. Splitting it into 1,189 chapter modules puts 1,189
  files into the Metro graph (slow cold builds, and every one of them is a `require` the
  bundler must resolve); keeping it as one module means 5.6 MB parsed into the JS heap at
  import time. It also throws away SQL, which the lexicon/names/places collectible feature
  (owner's §4.2 idea) and any future search box will want. Worse on size, worse on memory,
  worse on capability. No.
- **`SQLite.deserializeDatabaseAsync(bytes)`** (a real SDK 57 export) would avoid the disk
  copy entirely and is inherently safe for a read-only DB — but it holds the full 5.2 MB
  resident in memory for as long as the DB is open, and multi-translation multiplies that on
  a device where the speech recognizer already owns real memory. Rejected on memory, noted as
  the fallback if the copy step ever proves flaky.
- **Opening the file in place inside the app bundle.** The bundle is read-only and SQLite
  wants to create a journal next to the database; `expo-sqlite` exposes no read-only /
  immutable open mode (the SDK 57 reference has no `PRAGMA query_only` or read-only option —
  I checked). Not possible. This is *why* the copy exists.

### A1.2 Exact install

`expo-sqlite` is not in `package.json`. Install with the Expo-aware resolver so the version
matches SDK 57, not with a bare `bun add`:

```sh
bunx expo install expo-sqlite
```

`UNVERIFIED:` the exact resolved patch version — expect `~57.0.x` to land in `dependencies`.
Do **not** hand-write a version into `package.json`.

No `plugins` entry is required for the base case. The `expo-sqlite` config plugin exists and
takes `{ enableFTS, useSQLCipher, useLibSQL }`; we want none of those in v1. `enableFTS` is
the one to revisit if full-text search across the Bible ships later — it is a native build
flag, so adding it later requires a new dev build, not just an OTA.

`expo-asset` is already both a dependency and a plugin entry in `app.json`, and Metro already
treats `.db` as an asset. **No `app.json` change is needed for A1.**

### A1.3 Pre-indexing: ship the index, don't build it on device

The shipped file has no index on `(book_id, chapter, verse)`. Verified query plans:

```
-- as shipped
QUERY PLAN
|--SCAN KJV_verses
`--USE TEMP B-TREE FOR ORDER BY

-- after CREATE INDEX KJV_verses_ref ON KJV_verses(book_id, chapter, verse)
QUERY PLAN
`--SEARCH KJV_verses USING INDEX KJV_verses_ref (book_id=? AND chapter=?)
```

**Ship it pre-indexed.** Cost is a measured +396 KB (+8.5%). The alternative — running
`CREATE INDEX` on device at first launch — costs a multi-hundred-millisecond write on the
user's very first tap, needs the copied file to be writable at exactly the wrong moment, and
has to be made idempotent and crash-safe. Paying 396 KB of binary to delete that whole class
of bug is correct. (Do **not** `VACUUM` afterwards: measured, it made the file *larger*,
5,156,864 → 5,173,248.)

### A1.4 Build-time preparation script

New: **`scripts/prepare-bible-db.ts`**, run with `bun`, using the built-in `bun:sqlite` (no
new dependency; verified working against `kjv.db`).

Inputs: a source `.db` from `~/Documents/BibleScroll/Translations/`.
Outputs, both committed:

1. `assets/bible/<code>.db` — a copy with `CREATE INDEX IF NOT EXISTS <CODE>_verses_ref ON
   <CODE>_verses(book_id, chapter, verse)` applied.
2. `lib/bible/chapter-stats.generated.ts` — the per-chapter numbers the UI needs *without
   opening the database* (see A2.2).

It also asserts the invariants, and fails loudly rather than silently shipping a broken file:

- exactly 66 books, ids 1..66 contiguous;
- `max(chapter)` per book matches the canonical chapter counts in `lib/bible/canon.ts`;
- every `(book_id, chapter)` has verses numbered 1..n with no gaps;
- no `text` is null or empty.

`npm scripts` entry: `"prepare:bible": "bun scripts/prepare-bible-db.ts"`. It is a
developer-run tool, not part of `expo start`.

### A1.5 Runtime: `services/bible-db.ts`

One module owns the asset→disk copy and the connection cache. It is the *only* file that
imports `expo-sqlite`.

```ts
// services/bible-db.ts   (async by contract — unlike services/kv.ts)
import * as SQLite from 'expo-sqlite';
import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';

import type { TranslationCode } from '@/lib/bible/canon';

/** The one place a translation code is bound to a bundled file. Adding ASV is
 *  one line here plus one file in assets/bible/. */
const BUNDLED: Partial<Record<TranslationCode, number>> = {
  KJV: require('../assets/bible/kjv.db'),
};

const open = new Map<TranslationCode, Promise<SQLite.SQLiteDatabase>>();

export function getDb(code: TranslationCode): Promise<SQLite.SQLiteDatabase> { … }
```

The install-then-open sequence:

```ts
async function install(code: TranslationCode): Promise<SQLite.SQLiteDatabase> {
  const fileName = `${code}.db`;
  const dir = new Directory(SQLite.defaultDatabaseDirectory);
  if (!dir.exists) dir.create({ intermediates: true });

  const dest = new File(dir, fileName);
  if (!dest.exists) {
    const asset = Asset.fromModule(BUNDLED[code]!);
    await asset.downloadAsync();               // no-op for a bundled asset; populates localUri
    new File(asset.localUri!).copy(dest);
  }
  return SQLite.openDatabaseAsync(fileName);   // resolves against defaultDatabaseDirectory
}
```

Verified against the SDK 57 reference: `openDatabaseAsync(databaseName, options?, directory?)`
with `directory` defaulting to `SQLite.defaultDatabaseDirectory`; `Asset.fromModule` /
`downloadAsync` / `localUri`; the `File`/`Directory`/`Paths` API in `expo-file-system` 57
(`exists`, `size`, `uri`, `copy`, `create({ intermediates })`) — which this repo already uses,
see `services/session-history.ts:26` (`new File(Paths.document, 'user', 'sessions.json')`).

`UNVERIFIED:` **`SQLite.defaultDatabaseDirectory` is typed `any` in the SDK 57 reference and
its concrete value is undocumented.** If `new Directory(...)` rejects it (e.g. it is a bare
POSIX path rather than a `file://` URI), the fallback is
`new Directory(Paths.document, 'SQLite')` — the historical iOS location — and passing
`dir.uri` as `openDatabaseAsync`'s third argument. **Spike this in 5 lines before writing the
rest of Phase 1.** It is the single riskiest unknown in this lane.

**`SQLiteProvider` with `assetSource={{ assetId: require('./kjv.db') }}` is the documented
one-liner, and I am rejecting it.** It is a React component bound to one `databaseName`, which
means the multi-translation future turns into provider remounting and a React boundary between
the Bible tab and its data. The imperative service above is the same three SDK calls without
that coupling, and it makes the downloaded-translation path (A1.7) literally the same function
with a different source for the bytes.

### A1.6 Disk, backup, and bundle-size accounting

- **Binary growth:** +5,156,864 bytes uncompressed per bundled translation; ~1.79 MB after
  gzip -9, which is a reasonable proxy for App Store thinning/compression.
  `UNVERIFIED:` the actual App Store download-size delta — measure with an EAS build, not from
  this number.
- **Device disk:** the copy adds another ~5.2 MB in the app's data container, i.e. ~10.4 MB
  total per translation once installed. Acceptable; state it in Settings' storage row.
- **iCloud backup:** the copied file lands under `Documents/` and is therefore backed up,
  even though it is perfectly regenerable from the bundle. The SDK 57 `expo-file-system`
  reference documents no backup-exclusion API (`UNVERIFIED:` whether one exists elsewhere in
  57). For v1, accept it and note it. The clean fix later is a tiny config plugin setting
  `NSURLIsExcludedFromBackupKey`. Do **not** put the database in `Paths.cache` to dodge this —
  iOS can purge the cache directory mid-session, which would fail a read in the middle of a
  chapter.
- **Deleting a translation** (Settings, later): `new File(dir, `${code}.db`).delete()` plus
  dropping the cached connection. Bundled translations reinstall from the asset on next open.

### A1.7 Staying un-hardcoded for ASV / BSB / YLT / …

Three rules, and the design falls out:

1. **The table prefix is data, not code.** Every query is built from the code:
   `` `select verse, text from ${code}_verses where book_id = ? and chapter = ? order by verse` ``.
   The code is validated against a closed union (`TranslationCode`) before it reaches a
   template string, so this is not string-concatenated user input. Values are always bound with
   `?`, never interpolated.
2. **The identifier is `TranslationCode`, defined once** in `lib/bible/canon.ts` as
   `'KJV' | 'ASV' | 'BSB' | …`, plus a `TRANSLATIONS` record carrying
   `{ code, title, license, bundled: boolean, remoteUrl?: string }`. Nothing else in the app
   ever writes the literal `'KJV'` — including the MMKV keys, which embed the code (A3.2).
   The active translation is one MMKV key, `meta/bibleTranslation`, defaulting to the
   bundled one.
3. **On-demand downloads are the same function.** `install()` above branches on
   `BUNDLED[code]` vs `TRANSLATIONS[code].remoteUrl`; the remote path uses
   `new File(dir, fileName).createDownloadTask(url)` (SDK 57 `expo-file-system`) and then falls
   into the identical `openDatabaseAsync`. The prepare script is run once per translation to
   produce the indexed file and its stats module, which are uploaded to a CDN — the *same*
   artifact either way.

Guard: `services/bible-db.ts` verifies the opened file with
`select name from sqlite_master where type='table' and name = '<CODE>_verses'` before serving
it, so a truncated download surfaces as a typed error rather than a `no such table` deep in a
query.

---

## A2. The Bible content layer — `lib/bible/*`

Five modules. Three of them are pure (no React, no `services/`, no `react-native`) and
testable under bun, matching the `lib/history-schema.ts` rule.

| File | Pure? | Responsibility |
|---|---|---|
| `lib/bible/canon.ts` | ✅ | 66 books: DB name → display name, abbreviation, testament, chapter count |
| `lib/bible/chapter-stats.generated.ts` | ✅ | Per-chapter verse & word counts, emitted by the prepare script |
| `lib/bible/ref.ts` | ✅ | The `BibleRef` type + its string form; parse/format; the `bible:` passage id |
| `lib/bible/chapter-passage.ts` | ✅ | Verse rows → a synthetic `Passage` + the word-index ↔ verse map |
| `lib/bible/queries.ts` | ❌ (async, uses `services/bible-db.ts`) | `getChapter`, `getBook`, `getVerse`, `searchText` |

### A2.1 `lib/bible/canon.ts`

The DB's names are not display names. Verified from the live table: `I Samuel`, `II Kings`,
`III John`, `Song of Solomon`, `Revelation of John`. The canon module is the one place that
translates, and it is keyed by `id`, not by name, so a translation that spells a book
differently cannot break the mapping.

```ts
export type Testament = 'old' | 'new';

export type BookMeta = {
  /** 1-66, the `<CODE>_books.id` primary key. Stable across every translation file. */
  id: number;
  /** Exactly as stored in `<CODE>_books.name` for KJV — kept for debugging and for
   *  the prepare script's cross-check, never rendered. */
  dbName: string;
  /** What the UI shows: '1 Samuel', '3 John', 'Revelation'. */
  name: string;
  /** Chapter-list headers and the live top bar: 'Gen', '1 Sam', '3 Jn', 'Rev'. */
  abbr: string;
  testament: Testament;
  /** Verified against the DB by the prepare script. */
  chapters: number;
};

export const BOOKS: readonly BookMeta[] = [ /* 66 entries, hand-written */ ];
export const OLD_TESTAMENT = BOOKS.filter(b => b.testament === 'old');   // ids 1-39
export const NEW_TESTAMENT = BOOKS.filter(b => b.testament === 'new');   // ids 40-66
export function bookById(id: number): BookMeta | undefined;
export const TOTAL_CHAPTERS = 1189;   // verified
export const TOTAL_VERSES  = 31102;   // verified
```

The chapter counts are already measured — `select book_id, max(chapter) ... group by book_id`
gives Genesis 50, Psalms 150, Obadiah 1, Jude 1, Revelation 22, and the rest. They go into
`BOOKS` literally, and the prepare script asserts them.

Why hand-written rather than generated: the *display* names and abbreviations are editorial
(Lane B will want "Psalms" vs "Psalm", "1 Corinthians" vs "1 Cor"), and the structure is
identical across all 14 translation files, so it is genuinely translation-independent. Only
the *numbers* are generated.

### A2.2 `lib/bible/chapter-stats.generated.ts` — why the UI must never await the DB

The Bible tab renders 66 book rows, and a book screen renders up to 150 chapter rows, each
with a duration chip and a progress ring. If those numbers came from SQLite, opening the tab
would be an async gate — a spinner where every other tab in this app renders instantly from
MMKV. **The counts are baked into a generated module so the entire browse experience is
synchronous. The database is opened only when a chapter is actually read.**

```ts
/** GENERATED by scripts/prepare-bible-db.ts — do not edit. */
export type ChapterStat = readonly [verses: number, words: number];
export const CHAPTER_STATS: Record<TranslationCode, readonly (readonly ChapterStat[])[]>;
//                                                  ^ index 0 = book id 1
```

1,189 pairs ≈ 15 KB of source per translation — negligible next to the 5 MB database, and
free at runtime (it is a frozen literal, not parsed JSON).

Duration estimate, the chip the owner likes:

```ts
/** Read-aloud pace for scripture, including natural pauses. */
export const SCRIPTURE_READ_WPM = 140;
export function estimateMinutes(words: number): number { return words / SCRIPTURE_READ_WPM; }
```

Sanity from the measured data: mean chapter 665 words → **~4.75 min**; Psalm 119 (2,446 words)
→ **~17 min**; Psalm 117 (34 words) → **~15 sec**. The `~2 mins` chip format from
`types/session.ts` (`Passage.duration: string`) still applies; Lane B owns the exact copy for
sub-minute and long chapters.

### A2.3 `lib/bible/ref.ts` — one identifier, everywhere

```ts
export type BibleRef = { code: TranslationCode; book: number; chapter: number };

/** Route param and MMKV-adjacent form: 'KJV.1.1'. Dots because expo-router path
 *  segments can't contain '/', and because it stays readable in a debugger. */
export function formatRef(ref: BibleRef): string;           // 'KJV.19.119'
export function parseRef(raw: string | undefined): BibleRef | null;  // total; null on anything malformed

/** The synthetic Passage id, and therefore SessionRecord.passageId. */
export function chapterPassageId(ref: BibleRef): string;    // 'bible:KJV:19:119'
export function parseChapterPassageId(id: string): BibleRef | null;

/** Display: 'Genesis 1:14' / 'Genesis 1' — uses canon.ts. */
export function formatVerseRef(ref: BibleRef, verse: number): string;
export function formatChapterRef(ref: BibleRef): string;
```

`parseRef` and `parseChapterPassageId` are **total** — every input yields a `BibleRef` or
`null`, never a throw and never a half-built object. Same contract as `parseRecordKey`
(`lib/history-schema.ts:59`).

### A2.4 `lib/bible/queries.ts`

```ts
export type VerseRow = { verse: number; text: string };

/** The one query a session needs. Indexed after A1.3, so it is a b-tree seek. */
export async function getChapter(ref: BibleRef): Promise<VerseRow[]>;
/** Chapter count for a book, from the DB — used only by the prepare script's
 *  cross-check and by dev tools. The UI uses canon.ts. */
export async function chapterCount(code: TranslationCode, book: number): Promise<number>;
export async function verseCount(ref: BibleRef): Promise<number>;
/** Whole-book fetch, for a future "read the whole book in one session" mode. */
export async function getBook(code: TranslationCode, book: number): Promise<Map<number, VerseRow[]>>;
```

`getChapter` is `db.getAllAsync<VerseRow>(sql, [book, chapter])` — verified signature. A small
LRU (8 chapters) in front of it makes "continue to next chapter" and back-navigation free;
each entry is ~4 KB (Genesis 1's concatenated text measured at 4,088 bytes).

### A2.5 The session seam — **synthetic `Passage`, on a separate route**

This is the decision the rest of the session work hangs on, so here is the constraint chain in
full:

1. `app/session/[passageId].tsx:40` calls `getAnyPassage(passageId)` **synchronously during
   first render**, because `usePracticeSession(passage)` is a hook and hooks cannot be
   conditional. `lib/passage-catalog.ts:6` says "Synchronous by contract" for exactly this
   reason.
2. Line 43 is `const passage = found ?? PASSAGES[0]`. If a Bible id resolved to `undefined`
   while its text loaded, the screen would **start a live speech session against the Epic
   Speech passage** and only then back out. That is not a theoretical risk; it is what the
   existing fallback does.
3. Chapter text comes from SQLite, which is async. There is no way to make (1) and (3) agree
   inside the existing route.

**Decision: a new route, `app/session/chapter/[ref].tsx`, that owns the async load and renders
a shared component.** To avoid duplicating 272 lines of proven session-lifecycle code, extract
the body of `app/session/[passageId].tsx` into
**`components/session/reading-session.tsx`**:

```tsx
export type ReadingSessionProps = {
  passage: Passage;                       // real or synthetic
  meta: { mode: SessionMode; passageId?: string; topicId?: string; contentTitle?: string };
  /** Rendered inside <SessionTopBar>. Passage: <LiveWpm/>. Bible: the live verse ref. */
  renderTopBarChild: (s: PracticeSession) => ReactNode;
  /** Passage: <PracticeControls/>. Bible: the scripture control set (Lane B). */
  renderControls: (s: PracticeSession, h: SessionHandlers) => ReactNode;
  /** Called on every terminal path, after recordSession() and checkpoint.end().
   *  Where the Bible route commits chapter completion. */
  onFinished?: (result: SessionResult, endedReason: SessionEndedReason, written: WriteResult) => void;
  /** Fires when the frontier crosses a word index. The Bible route uses it to
   *  bank verses incrementally (see A5). */
  onWordIndex?: (index: number) => void;
};
```

`app/session/[passageId].tsx` then becomes a ~25-line wrapper that resolves the id and renders
`<ReadingSession>` with `renderTopBarChild={s => <LiveWpm liveWpm={s.liveWpm}
targetWpm={passage.targetWpm} />}` and `renderControls={…<PracticeControls/>}`. **Its observable
behaviour must not change at all** — that is the definition of done for the extraction, and
it is why the extraction gets its own phase (Phase 3) rather than riding along with a feature.

This is the *only* refactor of existing code in the whole lane. It is a move, not a rewrite:
no logic edited, only lifted. Everything else in Lanes A/B/C is additive.

**The synthetic `Passage`** (built in `lib/bible/chapter-passage.ts`, pure):

```ts
export const SCRIPTURE_TARGET_WPM = 135;   // slower than the 150-179 speech passages

export type ChapterPassage = {
  passage: Passage;
  /** Ascending, non-overlapping, contiguous. verses[i].verse is the verse NUMBER
   *  (1-based, and NOT necessarily i+1 once `fromVerse` slicing is in play). */
  verses: readonly { verse: number; wordStart: number; wordEnd: number }[];
};

export function buildChapterPassage(
  ref: BibleRef,
  rows: readonly VerseRow[],
  opts?: { fromVerse?: number },
): ChapterPassage;
```

with

```
passage.id       = chapterPassageId(ref)          // 'bible:KJV:1:1' — resume slicing is NOT in the id
passage.title    = formatChapterRef(ref)          // 'Genesis 1'
passage.duration = formatDuration(estimateMinutes(words))
passage.text     = rows.map(r => r.text).join('\n\n')
passage.targetWpm= SCRIPTURE_TARGET_WPM
passage.category = 'bible'                        // new PassageCategory member — additive union widening
passage.artwork  = bibleArtwork(ref.book)         // deterministic per book; Lane B owns the palette
```

`passage.id` deliberately excludes any resume offset, so `SessionRecord.passageId` groups all
attempts at a chapter together no matter where they started. The offset is a route query param.

### A2.6 Preserving verse boundaries through tokenization — Lane B's contract

Lane B needs `wordIndex → verse reference` on every frame of the live top bar. It must be
exact, and it must not require touching `lib/passage-text.ts` (which the comment at line 2-4
correctly calls the single source of truth for word indices shared by the teleprompter *and*
the aligner — changing it would change speech alignment, which the owner has ruled off-limits).

**The map is built by tokenizing each verse separately with the same function, and
accumulating offsets:**

```ts
let offset = 0;
const verses = rows.map((row) => {
  const t = tokenizePassage(row.text);
  const entry = { verse: row.verse, wordStart: offset, wordEnd: offset + t.words.length };
  offset += t.words.length;
  return entry;
});
```

This is correct — not approximately, provably — because of how `tokenizePassage` is written
(`lib/passage-text.ts:46-101`):

- It splits on `/\n\s*\n/` first, so joining verses with `'\n\n'` makes **each verse its own
  raw paragraph**.
- Whitespace collapse (`replace(/\s+/g, ' ')`) and token splitting are **per raw paragraph**,
  so a verse's token count is independent of every other verse.
- `MAX_SENTENCES_PER_PARAGRAPH = 6` splits a long verse into multiple *pseudo-paragraphs*, but
  the split only re-groups `paragraphs`/`sentences` — it never adds, drops, or reorders a
  token (`words.push(token)` runs once per token in source order, lines 90-96).

So `tokenizePassage(joinedText).words.length === offset`, and word index *i* lies in verse
*v* iff `verses[v].wordStart <= i < verses[v].wordEnd`. **`buildChapterPassage` asserts that
equality in dev and in `scripts/test-bible.ts`** — if a future edit to `passage-text.ts` ever
breaks the assumption, the test fails instead of the top bar quietly showing the wrong verse.

Do **not** try to reuse `TokenizedPassage.paragraphs` as the verse map. It looks like it would
work (one paragraph per verse), but the 6-sentence split means a long verse produces *two*
paragraph entries, and the correspondence silently breaks on exactly the verses where it
matters most.

Exported for Lane B:

```ts
/** Binary search. -1 before the first verse, last index past the end. */
export function verseIndexAt(cp: ChapterPassage, wordIndex: number): number;
/** 'Genesis 1:14'. The live top bar calls this. */
export function verseRefAt(cp: ChapterPassage, ref: BibleRef, wordIndex: number): string;
```

`verseIndexAt` must be a binary search, not a `.find()`: Psalm 119 has 176 verses and the top
bar re-derives on every `currentWordIndex` change. (`sentenceAt` in `passage-text.ts:104` uses
`.find()` — fine for its size, not for this.)

---

## A3. Verse-level progress tracking

### A3.1 The core decision: **store only what cannot be derived**

`types/history.ts:37-40` states the property that governs this whole layer: *"RAW MEASURES
ONLY. There is deliberately no persisted score: every consumer recomputes… which is why
changing the score definition needs no migration or backfill."* The Bible progress layer must
obey the same rule, and when you apply it honestly, almost everything the owner asked for
turns out to be **derivable from `SessionRecord`s that already exist**:

| Requirement (§4.5) | Derivable from `SessionRecord`? | Where it lives |
|---|---|---|
| Per-chapter repeat count (2×, 3×) | ✅ count records with `passageId === 'bible:KJV:1:1'` and `endedReason === 'completed'` | derived |
| Time spent, per chapter / book / whole Bible | ✅ sum `durationMs` grouped by parsed `passageId` | derived |
| Last-read pointer | ✅ the max-`completedAt` record with a `bible:` passageId | derived |
| Per-book rollups | ✅ group the above by book id | derived |
| Streaks, minutes, daily goal | ✅ already works — `lib/stats.ts` is mode-agnostic | already derived |
| **Which verses have been read** | ❌ | **persisted** |
| **Furthest verse reached in a chapter** | ❌ | **persisted** |
| Active translation | ❌ (a setting) | **persisted** (1 key) |

So the persisted surface is **one small record per chapter the user has actually touched,
holding two fields**, plus one settings key. That is the whole thing.

Rejected: a fat `ChapterProgress` carrying `completions`, `totalMs`, `spokenWords`,
`firstReadAt`, `lastReadAt`. It is the obvious design and it is wrong here — it double-writes
data the session record already holds, it can drift out of sync with the record (the crash
path writes one and not the other), and it means "what counts as a completion" becomes a
migration instead of a one-line change to a derivation. Same reasoning that keeps
`speakingScore` out of `SessionRecord`.

**One honest consequence, and it must be surfaced in the UI:** clearing history
(`clearHistory()` → `lib/history-store.ts:559`) wipes the derived half and leaves the bitmaps,
producing "100% read, 0 sessions." The Bible settings surface (Lane C) must clear both
together, and the dev handle should too. Flagged, not hidden.

### A3.2 Key namespaces

Two new prefixes, registered in the **existing** `KEY` object in `lib/history-schema.ts` — one
registry for all namespaces means a collision is impossible by inspection, which is the
property that matters here:

```ts
export const KEY = {
  record: 's/',
  quarantine: 'q/',
  word: 'w/',
  passage: 'p/',
  meta: 'meta/',
  /** Per-chapter verse coverage: bc/<CODE>/<bbb>/<ccc>. */
  bibleChapter: 'bc/',
} as const;

export const META_KEY = {
  …,
  /** Active TranslationCode; absent means the bundled default. */
  bibleTranslation: 'meta/bibleTranslation',
} as const;
```

Key builder, in `lib/bible/progress-schema.ts`:

```ts
const BOOK_DIGITS = 3;      // 66  -> '066'
const CHAPTER_DIGITS = 3;   // 150 -> '150'

export function chapterKey(ref: BibleRef): string {
  return `${KEY.bibleChapter}${ref.code}/`
       + `${String(ref.book).padStart(BOOK_DIGITS, '0')}/`
       + `${String(ref.chapter).padStart(CHAPTER_DIGITS, '0')}`;
}
export function parseChapterKey(key: string): BibleRef | null;   // total, mirrors parseRecordKey
```

Zero-padding does the same job it does for records (`lib/history-schema.ts:42-57`), just on a
different axis: **lexicographic key order === canonical Bible order.** `bc/KJV/001/001` …
`bc/KJV/019/119` … `bc/KJV/066/022`. `getAllKeys().sort()` therefore yields Genesis→Revelation
with no sort comparator, a prefix scan of `bc/KJV/019/` gets every Psalm the user has touched,
and `bc/KJV/` partitions by translation. Three digits is deliberate headroom: 3 covers book 66
and chapter 150 with room for a translation whose versification differs.

`bc/` is not a prefix of `meta/`, `s/`, `q/`, `w/`, or `p/`, and none of them is a prefix of
it. Verified by inspection against `KEY` as it stands.

**`clearAll()` needs no change** — `lib/history-store.ts:559-573` enumerates explicit prefixes
(`KEY.record`, `KEY.quarantine`, `KEY.word`) and three meta keys, so `bc/` survives a history
clear by construction. That is the behaviour described in the paragraph above; make it
intentional by adding a comment, not by adding a branch.

### A3.3 The record

```ts
/** lib/bible/progress-schema.ts — PURE. No React, no services/, no react-native. */
export const BIBLE_PROGRESS_VERSION = 1;

export type ChapterProgress = {
  /** Schema version. Same rule as RECORD_SCHEMA_VERSION: bump when a field
   *  changes MEANING, not when one is added. */
  v: number;
  /** Furthest verse NUMBER the frontier has entered, 1-based. 0 = never opened.
   *  Monotonic — a later shorter read never lowers it. Drives "Resume at v12". */
  f: number;
  /** Coverage bitmap, lowercase hex, little-endian by byte then LSB-first within
   *  a byte: bit (v-1) set === verse v has been read end to end at least once.
   *  '' means none. Length is always even and <= ceil(maxVerses/8)*2. */
  r: string;
};
```

Single-letter keys are deliberate: this is written on every verse boundary of every chapter
(A5), so the payload is `{"v":1,"f":14,"r":"ff1f00"}` — 27 bytes — rather than ~90.

**Why a hex bitmap and not a verse count or a range list.** A verse count can't express
"read 5-20 yesterday and 1-4 today", which is exactly what a resumed chapter produces, and a
range list is unbounded in size and needs merge logic. A bitmap is fixed-size, order-free,
idempotent under re-reads, and gives an exact percentage via popcount. Worst case is Psalm 119:
176 bits = 22 bytes = **44 hex characters**; the median chapter (26 verses) is 8 characters.

**Why hex and not base64.** The module has to stay pure and run under bun *and* in Hermes.
`btoa`/`atob` availability across both is not something I can verify here, and `Buffer` is not
available in Hermes. Hex needs nothing but `toString(16)` and `parseInt`, validates with
`/^[0-9a-f]*$/`, and is legible in the MMKV debugger. The size difference is a handful of bytes.

Derived, never stored:

```ts
export function versesRead(p: ChapterProgress): number;                    // popcount
export function isVerseRead(p: ChapterProgress, verse: number): boolean;
export function percentComplete(p: ChapterProgress, verseCount: number): number;  // 0..1
export function isChapterComplete(p: ChapterProgress, verseCount: number): boolean;
export function withVerseRead(p: ChapterProgress, verse: number): ChapterProgress; // pure, monotonic
export function withFurthest(p: ChapterProgress, verse: number): ChapterProgress;  // pure, monotonic
```

`percentComplete` takes `verseCount` as an argument rather than reading
`chapter-stats.generated.ts` — that keeps `progress-schema.ts` free of a dependency on
generated data and makes it trivially unit-testable.

### A3.4 Total parsing

Exactly the `parseRecord` contract (`lib/history-schema.ts:114-232`): every payload yields
either a valid value or a stated reason, and a payload from a *newer* build is kept read-only
rather than destroyed.

```ts
export type ChapterParse =
  | { ok: true; value: ChapterProgress; upgraded: boolean; readOnly: boolean }
  | { ok: false; reason: 'not-an-object' | 'bad-version' | 'bad-furthest' | 'bad-bitmap' };

export function parseChapterProgress(raw: unknown, maxVerses: number): ChapterParse;
```

Rules, in order:

1. Not an object → `not-an-object`.
2. `v` non-finite → treat as 1 (mirrors `parseRecord`'s `const version = isFiniteNumber(r.v) ? r.v : 1`).
3. `v > BIBLE_PROGRESS_VERSION` → `readOnly: true`, parse the fields we understand and
   **never rewrite the key**. Same OTA-rollback reasoning as `ParseResult.readOnly`
   (history-schema.ts:120-128).
4. `v < BIBLE_PROGRESS_VERSION` → run `upgradeChapterProgress`, set `upgraded: true`.
5. `f` non-finite or negative → clamp to 0 rather than reject; a chapter with a good bitmap and
   a corrupt pointer is still real reading history. Clamp `f` to `maxVerses`.
6. `r` not a string, odd length, or not `/^[0-9a-f]*$/` → **`bad-bitmap`, reject**. This is the
   one field that cannot be repaired: silently zeroing it would tell the user they never read a
   chapter they did. Rejecting means the store quarantines it (see below) and the user keeps
   `f`-based resume from the quarantined copy if we ever need it.
7. Bits above `maxVerses` are masked off — a shorter versification in a new translation must not
   report 105%.

**Migrations.** Note the finding in A0: **there is no `upgradeRecord` function in this
codebase** despite `types/history.ts:30` referring to one; the upgrade lives inline in
`parseRecord`. The Bible module should not repeat that mismatch. Define the step function for
real:

```ts
/** One step per version boundary. v1 is the origin, so this is currently a
 *  no-op that exists to make the next migration a diff and not a redesign. */
function upgradeChapterProgress(raw: Record<string, unknown>, from: number): Record<string, unknown> {
  let out = raw;
  // if (from < 2) out = { ...out, /* v2 field */ };
  return out;
}
```

And, as a small correctness fix to the *existing* file (see A4.3), the same ordering discipline
applies there.

### A3.5 The store: `lib/bible/progress-store.ts` + `services/bible-progress.ts`

Mirrors `lib/history-store.ts` / `services/session-history.ts` exactly, which is also how
`services/user-passages.ts` is built:

```ts
// lib/bible/progress-store.ts — PURE, takes KvBackend (from lib/history-store.ts)
export function createBibleProgressStore(deps: {
  kv: KvBackend;
  verseCountOf: (ref: BibleRef) => number;   // injected, so the store never imports generated data
  now?: () => number;
  onWarn?: (message: string, detail?: unknown) => void;
}) {
  return {
    /** Stable array/Map identity between mutations — useSyncExternalStore requires it. */
    getAll(): ReadonlyMap<string, ChapterProgress>;
    subscribe(listener: () => void): () => void;
    get(ref: BibleRef): ChapterProgress | undefined;
    /** Monotonic + idempotent. Returns false if nothing changed (the common case
     *  on a re-read), so the caller can skip the notify. */
    markVerseRead(ref: BibleRef, verse: number): boolean;
    markFurthest(ref: BibleRef, verse: number): boolean;
    clearTranslation(code: TranslationCode): void;
    clearAll(): void;
    getStats(): { chapters: number; versesRead: number; quarantined: number };
  };
}
```

```ts
// services/bible-progress.ts — the thin binding, like services/session-history.ts
import { kv, durable } from '@/services/kv';
```

Invariants carried over from the existing store, and they are not optional:

- **Write-then-verify.** `kv.set(key, json); if (kv.getString(key) !== json) throw` — the
  "memory equals disk" rule from `lib/history-store.ts:11-19`. A verse banked in memory but not
  on disk is the same bug class that used to lose practice minutes.
- **Stable snapshot identity.** `getAll()` returns the same `Map` reference until a mutation
  succeeds, so `useSyncExternalStore` doesn't loop (see the `wordStatsList` comment,
  history-store.ts:176-183 — that exact bug).
- **Lazy synchronous hydration.** One pass over `kv.getAllKeys()` filtering `bc/`. Upper bound
  1,189 keys per translation, and only for chapters actually touched — for a realistic user,
  tens to low hundreds. Cheap enough to stay synchronous, which is what lets the chapter list
  render without a spinner.
- **Quarantine, not delete.** A `bad-bitmap` payload moves to `q/` via the same
  write-verify-then-remove sequence (history-store.ts:202-218) rather than being dropped. The
  simplest correct implementation is to export the existing `quarantine` helper's *logic* —
  `UNVERIFIED:` whether it is worth extracting from `history-store.ts` versus reimplementing
  ~15 lines in the Bible store. **Recommendation: reimplement.** Extracting it means editing a
  load-bearing file for no functional gain, and the two stores can diverge on retention policy.
- **Deferred repair writes.** Same `scheduleWrite` dependency, so hydration inside a render
  never writes mid-render.

### A3.6 Rollups: `lib/bible/rollup.ts` (pure)

The single pass that turns records + bitmaps into everything the UI shows.

```ts
export type ChapterRollup = {
  ref: BibleRef;
  versesRead: number;
  verseCount: number;
  percent: number;          // 0..1
  complete: boolean;
  /** endedReason === 'completed' attempts. This is the "2x / 3x" badge. */
  completions: number;
  attempts: number;         // all endedReasons — completions + stopped + abandoned + …
  totalMs: number;
  firstReadAt: number | null;
  lastReadAt: number | null;
  /** Where "Resume at v12" comes from. */
  furthestVerse: number;
};

export type BookRollup = {
  book: BookMeta;
  chaptersComplete: number;  // of book.chapters
  versesRead: number;        // of the book's total
  percent: number;
  totalMs: number;
  lastReadAt: number | null;
};

export type BibleRollup = {
  byChapter: ReadonlyMap<string, ChapterRollup>;   // keyed by chapterPassageId
  byBook: readonly BookRollup[];                   // 66, always, in canon order
  overall: { chaptersComplete: number; versesRead: number; percent: number; totalMs: number };
  lastRead: { ref: BibleRef; verse: number; at: number } | null;
};

export function bibleRollup(
  records: readonly SessionRecord[],
  progress: ReadonlyMap<string, ChapterProgress>,
  code: TranslationCode,
): BibleRollup;
```

**One O(records + touched chapters) pass**, memoized on the two input identities — both of
which are stable by store contract. This is the same shape as `lib/stats.ts` (`skillProfile`,
`totals`), so it reads like it belongs. Consumers get it through
`hooks/use-bible-progress.ts`:

```ts
export function useBibleRollup(): BibleRollup;   // useSyncExternalStore × 2 + useMemo
```

Note it filters records by `record.mode === 'scripture'` **and** a successful
`parseChapterPassageId(record.passageId)`, so a malformed id can never inflate a rollup.

### A3.7 The test script

New: **`scripts/test-bible.ts`**, in the same style as `scripts/test-history.ts` (hand-rolled
`assert`/`assertEq`/`section`, no test framework, `process.exit(1)` on failure). It runs the
pure modules against `createMemoryKv()` from `lib/history-store.ts` — no native module, no
simulator, no database.

`package.json`:

```json
"test": "bun scripts/test-history.ts && bun scripts/test-stats.ts && bun scripts/test-alignment.ts && bun scripts/test-wav.ts && bun scripts/test-bible.ts"
```

Coverage it must have, because these are the parts that will actually break:

1. **Keys** — `chapterKey` round-trips through `parseChapterKey`; `bc/KJV/019/119` sorts
   between `bc/KJV/019/002` and `bc/KJV/020/001`; a sorted list of shuffled refs comes back in
   canon order; `parseChapterKey` returns `null` for `s/…`, `bc/`, `bc/KJV/x/1`, `''`.
2. **Bitmap** — set/read every verse of a 176-verse chapter; idempotent re-set; popcount;
   `percentComplete` exactly 1 at full coverage; bits above `maxVerses` masked; hex string
   length invariants.
3. **Parsing** — a valid v1 payload; `v: 99` yields `readOnly` and the store never rewrites it;
   `v: 0`/missing upgrades; odd-length hex, uppercase hex, `'zz'`, `null`, `42`, `[]` each
   yield the stated reason; a negative `f` clamps rather than rejects.
4. **Store** — write-verify failure (inject a `KvBackend` whose `set` silently drops) reports
   failure and does **not** update the snapshot; snapshot identity is stable across a no-op
   `markVerseRead`; a bad payload is quarantined under `q/` and the original key removed only
   after the quarantine write verifies; `clearTranslation('KJV')` leaves `bc/ASV/…` alone.
5. **Chapter passage** (the Lane B contract) — for a synthetic 5-verse chapter and for a real
   176-verse fixture, `tokenizePassage(joined).words.length === sum of per-verse lengths`;
   `verseIndexAt` at every boundary word index, at 0, at `length-1`, and past the end; a verse
   with 7+ sentences (the `MAX_SENTENCES_PER_PARAGRAPH` case) still maps correctly; a
   whitespace-only verse yields `wordStart === wordEnd` and is skipped, not misattributed.
6. **Rollup** — 3 completed + 1 abandoned attempt at Genesis 1 gives `completions: 3`,
   `attempts: 4`; `totalMs` sums all four; a record with `mode: 'passage'` and a `bible:`
   passageId is excluded; `lastRead` picks max `completedAt`, not last array position.
7. **Ref formatting** — `formatVerseRef` for `I Samuel`→`1 Samuel 1:1`, `III John`→`3 John 1:1`,
   `Revelation of John`→`Revelation 22:21`.

Fixtures are hand-written literals in the script (a few verses of Genesis 1 and a synthetic
176-verse chapter). **The test must not open `kjv.db`** — it has to run on a machine that
doesn't have it, and `bun:sqlite` belongs to the prepare script only.

---

## A4. Session record changes

### A4.1 `SessionMode`: **add `'scripture'`**

```ts
export type SessionMode = 'passage' | 'drill' | 'freestyle' | 'scripture';
```

and correspondingly `MODES` in `lib/history-schema.ts:86`.

**Why a new member rather than reusing `'passage'` with a `bible:` id prefix.** Three concrete
places already switch on mode and would otherwise need to grow a string-prefix sniff:
`lib/stats.ts`'s consumers, `lib/recommendations.ts`, and `InflightSession.mode` — which is
what crash recovery uses to reconstruct what was interrupted (`lib/history-store.ts:391`).
Scripture reads at 135 wpm against 17th-century English; folding them into the pronunciation
skill profile would quietly poison the Analytics tab's averages and the "words to master"
list with `thee`, `wherefore`, and `Melchizedek`. A mode member makes that a one-line filter
in one place instead of a prefix check scattered across five.

Runner-up, rejected: **reuse `'passage'`, distinguish by `passageId.startsWith('bible:')`.**
It requires zero schema change and zero risk, which is genuinely attractive. It loses because
the discriminator ends up duplicated everywhere and because the record's own `mode` field
would then be lying about what the session was.

### A4.2 `RECORD_SCHEMA_VERSION`: **do not bump. It stays 2.**

The rule at `types/history.ts:29-30` is *"Bump when a field changes meaning (not when one is
added)."* Adding a member to the `SessionMode` union does not change what `mode` means — it
still means "what kind of session this was" — and every existing record's `mode` value parses
to exactly what it parsed to before. There is nothing to migrate, so **there is no
`upgradeRecord` step to write.** Saying otherwise would be cargo-culting the rule instead of
applying it.

The version *would* have to go to 3 if we made `passageId` mean "a bible reference" for
scripture records while it means "a content id" everywhere else. **We avoid that by
construction:** `passageId` for a scripture record is `bible:KJV:1:1`, which is a real,
namespaced content id in exactly the same sense as `epic-speech` or `drill-plosives`. Same
meaning, new namespace. Keep it that way.

Nothing is added to `SessionRecord` either. The verse range a session covered is *not* a field
on the record — it lives in `ChapterProgress`, where it belongs, and the results screen reads
the live in-memory session for the "you read Genesis 1:1–1:18" line. Adding
`bibleVerseStart`/`bibleVerseEnd` would duplicate persisted state for a display string. Don't.

### A4.3 The one real hazard, and its fix

`parseRecord` validates `mode` at line 155-158 and only computes `version`/`readOnly` at line
169-170 — **the enum check runs before the newer-schema check.** So a build that predates
`'scripture'` reading a scripture record does not get the documented "keep a newer schema
read-only" treatment; it returns `bad-mode`, and `hydrate()` **quarantines** the row
(history-store.ts:252-254), which *removes the original key* after the quarantine write
verifies. Quarantine is capped at 50 (`MAX_QUARANTINE`, line 79), oldest dropped first. An
OTA rollback past this release, a week of Bible reading, then a roll-forward = permanently
lost sessions.

The file's own contract (history-schema.ts:120-128) is that a newer payload is *"usable, but
the store must never rewrite it… quarantining instead would silently strand real history."*
That promise currently only holds for fields, not for enums.

**Fix — hoist the version check above the enum checks in `parseRecord`:**

```ts
// after the completedAt guard, BEFORE the mode guard:
const version = isFiniteNumber(r.v) ? r.v : 1;
const readOnly = version > RECORD_SCHEMA_VERSION;

const mode = r.mode;
if (!isString(mode) || !MODES.includes(mode as SessionMode)) {
  // A newer build's mode is not corruption. Keep the record read-only so it
  // still counts toward minutes and streaks, and never rewrite it.
  if (!readOnly) return { ok: false, reason: 'bad-mode' };
}
```

with the record's `mode` falling back to `'passage'` for the read-only case (it is only used
for filtering, and the record is never rewritten so nothing is lost on disk). Same treatment
for `endedReason`, which is already lenient (line 181-184) and therefore fine as-is.

This is a ~6-line change to `lib/history-schema.ts` plus two cases in `scripts/test-history.ts`.
Ship it **in the same release as `'scripture'`, ideally in the phase before.** Honest
scoping: it protects builds released *after* the fix, so given this app appears to be
pre-launch, real-world exposure is close to zero — but it is cheap, it is correct, and it
makes the file's own doc comment true.

### A4.4 Properties that must survive

- **No persisted score.** Nothing in this lane writes a score, a percentage, or a completion
  flag onto a `SessionRecord`. Chapter percent is popcount ÷ verse count, recomputed. ✔
- **`tzOffsetMinutes` streak semantics.** Untouched. `buildRecord` snapshots it
  (history-store.ts:470) and `recordDayKey` (`lib/stats.ts:65`) uses it. Scripture sessions
  flow through the same `recordSession` and therefore contribute to the same streak with the
  same DST/travel correctness. Do **not** build a separate "Bible streak" on a separate day
  bucketing — one streak, one definition. ✔
- **`endedReason` scorability.** `isScorable` (`lib/score.ts`) keeps `abandoned` /
  `interrupted` / `error` out of skills while counting their minutes. Correct for scripture as
  written; no change. ✔
- **Scalar-only records.** No verse arrays on the record. ✔

---

## A5. Completion detection

### A5.1 Recommendation

**A chapter completes automatically when the recognizer reaches the last word — i.e. keep the
existing `status === 'done'` → `finishSession('completed')` path
(`app/session/[passageId].tsx:140-142`) exactly as it is. A manual stop banks partial credit
and never completes a chapter.**

The owner's requirement in §4.1 is explicit that completion is *earned*, not declared, and
this is already how the engine behaves — `usePracticeSession` flips to `'done'` when the
aligner's frontier reaches the end of the tokenized passage
(`hooks/use-practice-session.real.ts:774`). Building a "mark complete" affordance would mean
adding code to *weaken* a property we already have. Runner-up rejected: **complete on manual
stop**, which is simpler to reason about but lets a user tap stop after verse 2 and bank
Genesis 1 — that destroys the meaning of the 66-book progress bar the entire app is being
built around, and it makes the 2×/3× repeat badge meaningless.

### A5.2 The commit rule (this is what makes it robust)

Progress is banked **incrementally, on verse boundaries, during the session** — not once at
the end.

```
Verse v is banked  ⟺  the frontier index reaches verses[i].wordEnd
                       (every word in the verse has been matched)
furthest = the verse number containing the current frontier index
Chapter is complete ⟺ every verse in the chapter is banked
```

Because the last verse's `wordEnd === words.length`, "the last verse is banked" and "the
engine flips to `'done'`" are **the same event**. There is no second completion rule to keep in
sync, and nothing to special-case.

Wiring: `ReadingSession`'s `onWordIndex(index)` (A2.5) fires on frontier change; the Bible
route calls

```ts
const i = verseIndexAt(cp, index);
if (i > lastBankedRef.current) {
  bibleProgress.markVerseRead(ref, cp.verses[lastBankedRef.current + 1 … i].verse);  // may span
  lastBankedRef.current = i;
}
bibleProgress.markFurthest(ref, cp.verses[Math.max(0, i)].verse);
```

Both calls are **monotonic and idempotent** and return `false` when nothing changed, so a
frontier that ticks within a verse costs a comparison and no write. The frontier can jump
several verses at once (the aligner skips ahead on a confident match), hence the range form.

### A5.3 What this buys on each terminal path

| Path | `endedReason` | Verses banked | Chapter completes? | Time counted |
|---|---|---|---|---|
| Frontier reaches end (`status === 'done'`) | `completed` | all | **yes** | yes |
| User taps stop mid-chapter | `stopped` | those fully read | no | yes, scorable |
| Dismiss mid-read (`handleDismiss`, line 151) | `abandoned` | those fully read | no | yes, not scorable |
| Restart mid-read (`handleRestart`, line 199) | `abandoned` | those fully read | no | yes, not scorable |
| App killed / crash | `interrupted` (via `recoverInflight`) | **those fully read** | no | yes, via checkpoint |
| Recognizer error | `error` | those fully read | no | yes, not scorable |

The crash row is the point. Because verses are banked as they are read rather than at
`finishSession`, a chapter interrupted by a kill keeps its coverage **without any change to
`hooks/use-session-checkpoint.ts` or `InflightSession`**. The checkpoint's job stays what it
is — recovering *minutes* (`elapsedMs`, `spokenWords`) into an `interrupted` record — and the
verse coverage arrives by a separate, already-durable path. If instead we committed coverage
only at the end, we would have to teach `InflightSession` about verse indices, teach
`recoverInflight` to reconstruct them (which it cannot, because it has no access to the
tokenized text), or lose the data. Incremental commit deletes the whole problem.

Cost: one small MMKV write per verse boundary. A 31-verse chapter is 31 writes of ~27 bytes
over several minutes. MMKV is memory-mapped and synchronous; this is nothing. (For comparison
the existing checkpoint writes a larger payload every 5 s.)

### A5.4 Partial reads and resume

A partially-read chapter shows **"Resume at v12"** alongside its percentage ring — offered,
never forced; tapping the row itself starts from verse 1.

Mechanism: `app/session/chapter/[ref].tsx?from=12` → `buildChapterPassage(ref, rows, {
fromVerse: 12 })` slices `rows` before joining. Word indices restart at 0 for the slice and the
verse map is built from the sliced rows, so `verseIndexAt` stays correct with no offset
arithmetic anywhere. `passage.id` is unchanged (`bible:KJV:1:1`), so the resumed attempt rolls
up with every other attempt at that chapter, and its `SessionRecord`'s accuracy/completeness
correctly describe the portion actually read.

Completion of a resumed slice: reaching the end of the *slice* fires `'done'`, which banks the
final verse, which makes the bitmap full, which makes `isChapterComplete` true. So reading
1–11 on Monday and 12–31 on Tuesday completes the chapter — correctly — without any
cross-session bookkeeping. This is the payoff for storing coverage as a bitmap instead of a
count.

`completions` (the 2×/3× badge) counts `endedReason === 'completed'` records, so a chapter
finished in two sittings shows 100% with `completions: 1`? **No — it shows `completions: 0`,
because neither sitting ended `completed` for the whole chapter.** Decision: the badge counts
**full-chapter completions** and the ring counts **coverage**, and they are allowed to
disagree; a chapter can read 100% with 0 completions. That is honest, and it gives the
gamification layer (Lane B/C) a real distinction to work with: *covered* vs *read straight
through*. Lane B must not label the badge "times read" — it is "straight-through reads".

---

## A6. Navigation and routes

### A6.1 The tab

`app/(tabs)/_layout.tsx`, appended **after** analytics — one line, and the bar sizes itself
(`tabCount = Children.count(children)`, glass-tab-bar.tsx:135):

```ts
import { AudioLines, BookOpen, ChartColumn, Home } from 'lucide-react-native';

const ITEMS: (GlassTabItem & { href: string })[] = [
  { name: 'index',     href: '/',          label: 'Home',      icon: Home },
  { name: 'practice',  href: '/practice',  label: 'Practice',  icon: AudioLines },
  { name: 'analytics', href: '/analytics', label: 'Analytics', icon: ChartColumn },
  { name: 'bible',     href: '/bible',     label: 'Bible',     icon: BookOpen },
];
```

`BookOpen` is verified present and verified fill-safe (A0). `onIndexSelected` already maps
`ITEMS[i].href`, so ordering needs no other edit.

**Layout warning for Lane B:** `ITEM_WIDTH_EXPANDED = 80` (glass-tab-bar.tsx:40), so four tabs
is 320 pt of items plus the pill's padding. On the 375 pt-wide device class that is tight.
`UNVERIFIED:` whether it overflows — check on an iPhone SE / mini before shipping, and if it
does, the fix is a narrower `ITEM_WIDTH_EXPANDED`, not dropping a tab.

### A6.2 Route tree

Using the conventions actually in this repo — root `Stack` in `app/_layout.tsx:89`, a
`fullScreenModal` `session` group at line 91-94, `typedRoutes: true` in `app.json`:

```
app/(tabs)/bible.tsx                 Bible tab. Old/New segmented control + 66 book rows.
                                     Renders synchronously from canon.ts + chapter-stats +
                                     the progress store. Never opens the database.

app/bible/[bookId].tsx               Chapter list for one book. Pushed onto the ROOT stack
                                     (same level as app/session and app/passage-editor), so
                                     it slides over the tab bar the way session does.
                                     Also synchronous — counts and rings come from
                                     chapter-stats + the store.

app/session/chapter/[ref].tsx        The live reading session. Inside the existing session
                                     group, so it inherits fullScreenModal presentation,
                                     headerShown:false, and SessionContext (setResult) for
                                     free. Params: ref = 'KJV.1.1', optional ?from=<verse>.
                                     Owns the ONE async load (getChapter), shows a brief
                                     loading state, then renders <ReadingSession>.

app/session/results.tsx              UNCHANGED. Lane B branches its content on
                                     result.mode === 'scripture'.
```

No `Stack.Screen` declaration is needed in `app/_layout.tsx` for `app/bible/` — expo-router
picks it up from the file system, and it needs none of the custom header options that
`passage-editor` declares. If a title bar is wanted, Lane B adds `app/bible/_layout.tsx`
rather than touching the root.

`ref` uses dots (`KJV.1.1`) because a path segment cannot contain `/` and because
`formatRef`/`parseRef` (A2.3) are then the only place that format is known. Navigation from a
chapter row:

```ts
router.push(`/session/chapter/${formatRef(ref)}` as never);
router.push(`/session/chapter/${formatRef(ref)}?from=${resumeVerse}` as never);
```

(The `as never` cast matches the existing `router.navigate(ITEMS[i].href as never)` pattern at
_layout.tsx:54 — typed routes don't know about the dynamic segment's shape.)

### A6.3 Prefetching so the session never shows a spinner

The chapter route's `getChapter` is a single indexed b-tree seek returning ~4 KB. It will be
fast. But the transition into a fullScreenModal is exactly where a flash of loading state is
most visible, so: the chapter list calls `void getChapter(ref)` on row press (warming the LRU
in `lib/bible/queries.ts`) **before** `router.push`. By the time the route mounts the promise
is usually already resolved and the loading state never paints. The route still renders it
correctly if it isn't — this is an optimization, not a correctness dependency. Deep links and
cold starts take the honest loading path.

---

## A7. Phasing

Dependencies are on phase completion. "Parallel-safe" means the phase touches no file another
concurrently-runnable phase touches.

### Phase 1 — Data pipeline and the database on device
**Depends on:** nothing. **Parallel-safe with:** Phase 2.

**Files:** `package.json` (add `expo-sqlite`, add `prepare:bible` script) · new
`scripts/prepare-bible-db.ts` · new `assets/bible/kjv.db` · new
`lib/bible/chapter-stats.generated.ts` · new `services/bible-db.ts` · new
`lib/bible/queries.ts`.

**First task, before anything else:** the 5-line spike from A1.5 confirming what
`SQLite.defaultDatabaseDirectory` actually is and that `new Directory(…)` / `File.copy` accept
it. Everything downstream assumes the answer.

**Done when:** `bun scripts/prepare-bible-db.ts` regenerates the indexed asset and the stats
module and passes its own invariant assertions; a dev build opens the app, calls
`getChapter({ code:'KJV', book:1, chapter:1 })`, and logs 31 verses; the second launch does
**not** re-copy the file (log it); `explain query plan` on the on-device copy shows `SEARCH …
USING INDEX`; `assets/bible/kjv.db` is 5,156,864 bytes.

### Phase 2 — Pure Bible modules + tests
**Depends on:** nothing. **Parallel-safe with:** Phase 1.

**Files:** new `lib/bible/canon.ts`, `lib/bible/ref.ts`, `lib/bible/chapter-passage.ts`,
`lib/bible/progress-schema.ts`, `lib/bible/progress-store.ts`, `lib/bible/rollup.ts` · new
`scripts/test-bible.ts` · `package.json` (test script).

`rollup.ts` needs the `'scripture'` mode from Phase 4 to filter on; until then it filters on a
locally-declared constant and Phase 4 replaces it with the union member. That keeps Phases 2
and 4 independent.

**Done when:** `bun scripts/test-bible.ts` passes all seven groups from A3.7 and `npm test`
runs it as part of the chain. Zero imports of React, `react-native`, or `services/` in
`lib/bible/*` except `queries.ts`. Verified by grep, and by the fact that bun runs it at all.

### Phase 3 — Extract `ReadingSession`
**Depends on:** nothing technically, but do it **after** Phase 1 & 2 land so the
Bible route has something to consume. **NOT parallel-safe with anything Lane B does to
`app/session/[passageId].tsx`** — coordinate.

**Files:** new `components/session/reading-session.tsx` · `app/session/[passageId].tsx`
(shrinks to a wrapper).

**Done when:** an existing passage session is behaviourally identical — start on mount, the
`'done'` auto-finish, dismiss→`abandoned`, restart→`abandoned`+re-arm, stop→`stopped`, the
retry-token restart, and `checkpoint.end()` on every terminal path. Verify by reading the diff
(it must be a move, not a rewrite) and by running one full session of each kind on device. If
anything in the diff is a *change* rather than a *move*, back it out and do it in its own
commit.

### Phase 4 — `'scripture'` mode + the `parseRecord` ordering fix
**Depends on:** nothing. **Parallel-safe with:** Phases 1, 2, 3 (different files) — but it
touches two files the whole app depends on, so land it on its own and run `npm test` before and
after.

**Files:** `types/history.ts` (union member) · `lib/history-schema.ts` (`MODES`, the version-
before-enum hoist from A4.3, the two new `KEY`/`META_KEY` entries from A3.2) ·
`scripts/test-history.ts` (cases for the read-only unknown-mode path).

**Done when:** `bun scripts/test-history.ts` passes with two new assertions — a `{ v: 3, mode:
'karaoke' }` payload parses `ok` with `readOnly: true` and is never rewritten, while a
`{ v: 2, mode: 'karaoke' }` payload still returns `bad-mode`. `RECORD_SCHEMA_VERSION` is still
`2` (assert it). No migration written, because none is needed (A4.2).

### Phase 5 — `services/bible-progress.ts` + `hooks/use-bible-progress.ts`
**Depends on:** 2, 4.

**Files:** new `services/bible-progress.ts` · new `hooks/use-bible-progress.ts`.

**Done when:** the dev handle (`services/history-dev.ts` pattern) can seed a chapter, and a
throwaway screen renders "Genesis: 3/50 chapters, 14%" from the real store, surviving an app
restart. `getStorageStats()`-equivalent reports the `bc/` key count.

### Phase 6 — The Bible session route
**Depends on:** 1, 2, 3, 4, 5.

**Files:** new `app/session/chapter/[ref].tsx`.

**Done when:** navigating to `/session/chapter/KJV.1.1` loads Genesis 1, reads it end to end,
writes a `SessionRecord` with `mode: 'scripture'` and `passageId: 'bible:KJV:1:1'`, banks all
31 verses, and lands on the existing results screen. Then: stop at verse 12 → 11 verses banked,
`furthest: 12`, no completion. Then: `?from=12` → finishes the chapter, bitmap full,
`completions` still 0 (per A5.4). Then: force-quit mid-chapter → verses banked survive and an
`interrupted` record appears.

### Phase 7 — Tab and browse routes
**Depends on:** 2, 5 (data), 6 (for the row to navigate to). **This is Lane B's surface** —
Lane A's contribution is the route skeleton and the `ITEMS` entry.

**Files:** `app/(tabs)/_layout.tsx` (one array entry) · new `app/(tabs)/bible.tsx` · new
`app/bible/[bookId].tsx`.

**Done when:** the tab appears after Analytics with a filled `BookOpen` glyph, the bar doesn't
overflow on a 375 pt device, book → chapter → session navigates, and **no screen in the browse
path awaits the database** (verify by stubbing `getDb` to reject and confirming the tab and
book list still render fully).

### Phase 8 — Multi-translation plumbing
**Depends on:** 1, 2, 5. Safe to defer past launch.

**Files:** `lib/bible/canon.ts` (the `TRANSLATIONS` record) · `services/bible-db.ts` (remote
branch) · `scripts/prepare-bible-db.ts` (batch mode) · wherever Settings lands (Lane C).

**Done when:** a second translation's `.db` + stats module are produced by the same script,
switching the active translation re-keys every rollup (`bc/ASV/…` progress is independent of
`bc/KJV/…`), and deleting a downloaded translation frees the disk without touching its
progress keys.

### Parallelism summary

```
Phase 1 ─┐
Phase 2 ─┼─► Phase 3 ─► Phase 6 ─► Phase 7
Phase 4 ─┘        └─► Phase 5 ─┘
                                  Phase 8 (any time after 5)
```

Phases **1, 2, and 4 can run fully concurrently** — disjoint files, disjoint concerns. Phase 3
must not overlap with any Lane B edit to `app/session/[passageId].tsx`. Everything from Phase 6
on is sequential because each builds on the last one's seam.

---

## A8. Open items resolved in this lane, in one place

| Question | Decision | Rejected runner-up |
|---|---|---|
| How does the Bible ship? | Pre-indexed `.db` asset, copied once to the SQLite dir, queried via `expo-sqlite` | JSON/TS preprocessing (larger, heavier, loses SQL); `deserializeDatabaseAsync` (5.2 MB resident) |
| Add the missing index? | Yes, at build time, shipped in the file (+396 KB) | `CREATE INDEX` on device at first launch |
| `SQLiteProvider` or imperative? | Imperative `services/bible-db.ts` | `SQLiteProvider assetSource` — couples one DB to a React boundary |
| Chapter as a `Passage`? | Yes, synthetic, but on a **new route** with an extracted `ReadingSession` | Teaching `getAnyPassage` to return Bible chapters (breaks its synchronous contract) |
| Verse map source | Tokenize each verse separately and accumulate offsets | Reusing `TokenizedPassage.paragraphs` (silently wrong on 7+-sentence verses) |
| What gets persisted per chapter? | **Only** furthest verse + a hex coverage bitmap | A fat record with completions/time/timestamps (double-writes derivable data) |
| Bitmap encoding | Lowercase hex | base64 (`btoa` availability across bun + Hermes unverified) |
| New `SessionMode` member? | Yes, `'scripture'` | `'passage'` + `passageId` prefix sniffing |
| Bump `RECORD_SCHEMA_VERSION`? | **No.** Stays 2 — adding a union member changes no field's meaning | Bumping to 3 "to be safe" (a migration with nothing to migrate) |
| Chapter completion trigger | Automatic, on the recognizer reaching the last word (already how the engine works) | Manual stop = complete |
| When is progress written? | Incrementally, on verse boundaries during the session | Once at `finishSession` (loses everything to a crash) |
| Tab icon | `BookOpen` (verified fill-safe) | `Scroll` (fills into a blob under `GlassTabButton`'s unconditional `fill`) |
| 100% coverage vs "times read" | Allowed to disagree; ring = coverage, badge = straight-through reads | Forcing them to agree |

## A9. Things I could not verify

- `SQLite.defaultDatabaseDirectory`'s concrete value and whether `expo-file-system`'s
  `Directory`/`File` accept it directly (SDK 57 types it `any` and documents no value).
  **Spike this first in Phase 1.**
- The resolved `expo-sqlite` patch version for SDK 57 — let `bunx expo install` decide.
- Whether SDK 57 exposes any iCloud-backup-exclusion API. The `expo-file-system` reference does
  not mention one.
- The actual App Store download-size delta from a 5.16 MB asset (gzip -9 = 1.79 MB is a proxy,
  not a measurement).
- Whether four tabs at `ITEM_WIDTH_EXPANDED = 80` overflow the glass pill on a 375 pt-wide
  device.
- The provenance of `kjv.db`'s `GPL` license row versus the KJV text's public-domain status.
  `ASV.db` self-reports `Public Domain` and is the safe alternative if this can't be resolved.
