# Speak the Bible — Master Plan

The spine. Every phase below links to the lane document that specifies it in full. Read this
file to know *what order to build in and why*; read the lane docs for the actual specs.

| Document | Lane | Owns |
|---|---|---|
| [`01-brief.md`](./01-brief.md) | — | The owner's intent, verified DB facts, codebase ground truth |
| [`02-data-architecture.md`](./02-data-architecture.md) | A | Data packaging, content layer, progress persistence, session seam, routes |
| [`03-product-ux.md`](./03-product-ux.md) | B | Bible tab, home, live reading screen, completion moments, gamification |
| [`04-backend-shipping.md`](./04-backend-shipping.md) | C | Auth, sync, Supabase, notifications, licensing, git, App Store |
| [`05-android.md`](./05-android.md) | — | Android: what ports, how to diverge, per-phase delta, Play Store |
| [`06-design-philosophy.md`](./06-design-philosophy.md) | — | **How it should feel.** Motion tiers, haptic vocabulary, gamification ethics |

**The one rule that governs everything: this is additive.** Practice, Drills, Freestyle,
Analytics, the pronunciation engine, and the entire design language stay. Exactly one existing
file is refactored (Phase 4, a pure code-move), and one string changes ("Start Practicing" →
"Start Speaking"). Everything else is new files.

---

## 0. Cross-lane conflict resolutions

The three lanes worked independently and disagreed in eight places. These are the coordinator's
rulings. **They override whatever the individual lane doc says** — the lane docs are otherwise
unedited, so where you see a contradiction, this table wins.

| # | Conflict | Lane A | Lane B | Ruling & why |
|---|---|---|---|---|
| 1 | `SessionMode` member name | `'scripture'` | `'bible'` | **`'scripture'`.** `bible` is already the route segment (`/bible`), the passage-id namespace (`bible:KJV:1:1`), the MMKV prefix (`bc/`), and the tab label. Reusing it for the mode makes four different things share one word. `'scripture'` names the *activity*, which is what `mode` means. |
| 2 | Book-browse route | `app/bible/[bookId].tsx` on the root stack | `app/(tabs)/bible/[bookId].tsx` in a nested stack | **Root stack (Lane A).** Lane B flagged its own nested version `UNVERIFIED:` — `expo-router/ui`'s `TabSlot` may not render a nested `Stack`, and its documented fallback *is* Lane A's design. Build the verified path. Revisit the nested version only if someone spikes it and it works; the win (tab bar visible while browsing) is real but not worth blocking on. |
| 3 | Session route path | `app/session/chapter/[ref].tsx`, `ref = 'KJV.1.1'` | `app/session/bible/[chapterId].tsx` | **Lane A's.** The `ref` format is owned by `lib/bible/ref.ts`, which is also what the resume param, the MMKV key, and the passage id are built from. One format, one parser, one place it's defined. |
| 4 | Scripture target WPM | 135 | 130 | **130.** Lane B grounded it in a real value already in the repo — `calm-narration`'s `targetWpm` in `constants/passages.ts`. 135 was an estimate. |
| 5 | Chapter completion rule | Bitmap full — every verse banked | `spokenWords/total ≥ 0.98` **and** final verse entered | **Both, composed.** Keep Lane A's storage model (chapter complete ⟺ coverage bitmap full), but bank an individual *verse* when the frontier reaches **≥ 98% of that verse's words**, not 100%. Lane B's tolerance exists to survive the recognizer swallowing a trailing word; applying it per-verse rather than per-chapter gets that robustness without a second completion rule to keep in sync. |
| 6 | Word-index → verse lookup | Binary search | Forward-only cursor | **Both, different call sites.** The live top bar uses the forward cursor (O(1) amortized, cannot regress if recognition jitters). `verseIndexAt` stays a binary search for arbitrary lookups (results sheet, resume, deep links). |
| 7 | Do scripture sessions feed the speaking score? | Not ruled | **No** | **No** — adopt Lane B. KJV at 130 wpm is not comparable to the practice corpus; folding it in would silently drag the Analytics score the owner likes. Scripture counts for minutes, streak, and progress. `lib/score.ts`'s `isScorable` is where this is enforced. |
| 8 | Which database ships | Pre-indexed `kjv.db` | — | **Neither — see Phase 1.** Lane C found `kjv.db` declares itself GPL, and separately that it contains **zero** Strong's/morphology markup despite its title. Build your own DB from clean public-domain text, or ship CC0 `BSB.db`. Lane A's entire pipeline still applies; only the *source file* changes. |

---

## 1. What the workers found that changes the plan

Five discoveries that no one asked for and that materially affect what gets built. Each is
verified — file and line are in the lane doc.

**1. A latent data-loss bug in the existing history store.** `parseRecord` validates `mode`
*before* it checks the schema version (`lib/history-schema.ts:155-170`). The file's own contract
says a record from a newer build must be kept read-only, never destroyed — but because the enum
check runs first, an older build reading a `'scripture'` record returns `bad-mode`, and
`hydrate()` **quarantines it, which deletes the original key**. Quarantine is capped at 50,
oldest dropped. An OTA rollback → a week of reading → roll-forward loses sessions permanently.
Six-line fix, specified in Lane A §A4.3. **This must ship in or before the phase that adds
`'scripture'`.**

**2. `upgradeRecord` does not exist.** `types/history.ts:30` documents it; a repo-wide grep finds
exactly that one mention. The upgrade logic is inline in `parseRecord`. Any instruction anywhere
that says "add an `upgradeRecord` step" means "add a branch inside the parse function."

**3. The Azure Speech key ships inside the app bundle.** `hooks/use-practice-session.real.ts:592`
reads `process.env.EXPO_PUBLIC_AZURE_SPEECH_KEY`; `EXPO_PUBLIC_*` values are inlined at build
time and extractable from any downloaded app in minutes. Anyone can bill Azure to the owner's
account. Separately, `services/azure-pronunciation.ts:136` POSTs recorded audio to Microsoft —
which is "collection" under Apple's definition and is currently **undeclared** in the privacy
manifest (`NSPrivacyCollectedDataTypes` is an empty array). Apple cross-checks app behaviour,
privacy policy, and nutrition labels; disagreement is a 5.1.1 rejection. **This is the highest-value
fix in the whole plan and it has nothing to do with the Bible.** Phase 0.

**4. Three of the sibling translation files forbid commercial use.** `AKJV.db`, `LITV.db`, and
`MKJV.db` declare non-commercial-only terms; `NHEB.db`'s license is unknown. The obvious Pro-tier
plan ("unlock more translations") walks straight into that. `BSB.db` is **CC0** — the cleanest
license in the folder. Audit `translations.license` on every file before it ships.

**5. The App Store 12+ age tier no longer exists.** Replaced 2026-01-31 by 4+/9+/13+/16+/18+. Any
advice naming 12+ is stale. This app is 4+ or 9+.

---

## 2. The phase sequence

Sixteen phases in four acts. Each phase is **one branch, one merge, one testable "done"**.
Phase numbers here are the canonical ones; the lane docs' internal numbering (A1–A8, B1–B7,
C0–C6) maps into these.

### Act I — Foundations (nothing user-visible)

**Phase 0 — Hygiene and identity.** *(Lane C §4.15 Phase 0, §4.12)*
Move the Azure key behind a server route (the pattern already exists at
`app/api/speech-coach+api.ts`). De-duplicate the mic/speech permission strings — they're set in
both `ios.infoPlist` and the plugin options, and which one wins is unverified. Investigate and
probably remove `NSPhotoLibraryUsageDescription`. Add EAS channels. **Decide** whether the bundle
id changes at all — keeping `com.schroedernathan.clarity` is the lower-risk default, and nobody
has chosen a replacement.
*Done when:* the JS bundle contains no Azure key and pronunciation still works.

**Phase 1 — The Bible database.** *(Lane A §A1, gated by Lane C §4.9)*
**First, resolve licensing** — it decides what file you build against. Then: `scripts/prepare-bible-db.ts`
(bun, `bun:sqlite`, no new dependency) emits a pre-indexed `assets/bible/<code>.db` plus a
generated `chapter-stats` module, asserting 66 books / 1,189 chapters / 31,102 verses.
`bunx expo install expo-sqlite`. `services/bible-db.ts` owns the asset→disk copy.
**Spike first:** what `SQLite.defaultDatabaseDirectory` actually is — it's typed `any` and
undocumented, and everything downstream assumes the answer.
*Done when:* a dev build reads Genesis 1 from the on-device copy, the second launch doesn't
re-copy, and `explain query plan` shows `SEARCH … USING INDEX`.

**Phase 2 — Pure Bible modules + tests.** *(Lane A §A2, §A3)*
`lib/bible/{canon,ref,chapter-passage,progress-schema,progress-store,rollup}.ts` and
`scripts/test-bible.ts`. All pure — no React, no `react-native`, no `services/` — so bun runs
them, same rule as `lib/history-schema.ts`. Runs fully parallel with Phase 1.
*Done when:* all seven test groups pass and `npm test` includes them.

**Phase 3 — Schema safety.** *(Lane A §A4)*
Add `'scripture'` to `SessionMode` and `MODES`. **Hoist the version check above the enum checks
in `parseRecord`** (finding #1). `RECORD_SCHEMA_VERSION` stays **2** — adding a union member
changes no field's meaning, so there is nothing to migrate and no migration to write.
*Done when:* `{v:3, mode:'karaoke'}` parses read-only and is never rewritten, while
`{v:2, mode:'karaoke'}` still returns `bad-mode`.

**Phase 4 — Extract `ReadingSession`.** *(Lane A §A2.5)*
Lift the body of `app/session/[passageId].tsx` into `components/session/reading-session.tsx`,
leaving a ~25-line wrapper. **This is a move, not a rewrite** — if any line in the diff is a
*change* rather than a *move*, back it out. The only refactor in the entire plan.
*Done when:* an existing passage session behaves identically on all six terminal paths.

**Phase 5 — Progress store wiring.** *(Lane A §A3.5)*
`services/bible-progress.ts` + `hooks/use-bible-progress.ts`. Write-then-verify, stable snapshot
identity, quarantine-not-delete — the same invariants `lib/history-store.ts` already enforces.

### Act II — The reading experience

**Phase 6 — The Bible session route.** *(Lane A §A6, Lane B §3)*
`app/session/chapter/[ref].tsx`. The verse-reference top bar with rolling digits
(`AnimatedRoundedNumber`, already in the repo). The **speech ribbon** replacing the count-up
timer — 48 bars, contour-smoothed, envelope-tapered, inking blue on volume, and pulsing once per
*recognized word* so it shows input being understood rather than just a mic level. The control
pill keeps its geometry; `Stop` becomes `Finish here` (a `Check`), and the center pill becomes
`Continue to Genesis 2` in the `done` state with a 3-second auto-advance hairline.
**Speech recognition is untouched — verify by diff.**

**Phase 7 — Bible tab and browse.** *(Lane A §A6.1, Lane B §1)*
Fourth tab after Analytics, `BookOpen` (verified fill-safe under the tab bar's unconditional
`fill`; `Scroll` is not — it fills into a blob). 66 books grouped into ten canonical divisions,
each with its own gradient. Chapter **grid**, not a list — Psalms has 150 chapters and a row list
is ~13,800pt of scroll. The three chapter states: Start pill / **percent ring** / green check.
*Watch:* four tabs at `ITEM_WIDTH_EXPANDED = 80` is 320pt of items — check a 375pt device.

**Phase 8 — Home and Settings.** *(Lane B §2)*
"Start Practicing" → **"Start Speaking"**. Settings finally exists at `app/settings.tsx`, opened
from the avatar in `HeaderActions` — which is *already* an interactive glass capsule with no
`onPress`, i.e. a button that does nothing today. That's where the daily goal becomes settable
(minutes **or** chapters). "For you" → "Up next"; new "Recently spoken"; whole-Bible progress
card above the existing one.

**Phase 9 — Completion moments.** *(Lane B §4)*
**Per chapter: a ~360pt sheet. Per book: the full ceremony.** The measured distribution forces
this — the median chapter is ~4:48 but 68 chapters are under a minute and Psalm 117 is 15
seconds; a full-screen results ceremony after a 15-second Psalm is exactly the "added junk" the
owner feared. The sheet shows verses spoken, not a performance score: no fillers, no pacing, no
articulation, no AI coach. One quiet opt-in row appears only if ≥3 words were mispronounced.

### Act III — The game

**Phase 10 — The Lexicon.** *(Lane B §5)*
Four collectible suits — Names, Places, Words, Relics, ~2,900 entries. Rarity is measured from
the corpus, not taste: **1,649 tokens appear exactly once in the entire KJV.** That's the pitch,
and it's a fact. **A word is discovered when the recognition frontier crosses it and the verdict
isn't `omitted`** — you have to *say it out loud*. That single rule is why this app's engine
makes the game work and no other Bible app can copy it. Undiscovered entries are redacted to
their *shape* (`M······h`), not padlocked.

**Phase 11 — Badges, drills, analytics.** *(Lane B §5.6, §6, §7)*
Territory (66, one per book), Distance (real denominators from 1,189), Feats (`Longhand` for
Psalm 119; `Featherweight` for Psalm 117 — the joke badge everyone gets), and **exactly one**
streak badge, so the streak still means something without being the game. Drills gain a fifth
entry, `Hard Names`, generated from the user's own per-word aggregates — biblical proper nouns
are the hardest pronunciation target in the corpus, which is the honest answer to "what are
drills for in a Bible app." Freestyle gains "Say it back" recall prompts.

### Act IV — Backend and ship

**Phase 12 — Sync seam, auth, Supabase.** *(Lane C §4.3–4.5, §4.15 Phases 1–3)*
Local-first stays local-first: MMKV remains the source of truth, a queue drains to Supabase in
the background. **Two schema corrections that matter:** `repeat_count` is *not* MAX-mergeable
(two offline devices each reading once merge to 1, losing a read) — it becomes an append-only
`chapter_completions` log where the count is `count(*)`. Streaks likewise can't be merged as a
derived integer; they become an `activity_days` set. RLS is **per-table, per-operation** — a
single `FOR ALL` policy hands clients UPDATE and DELETE on append-only logs. The first-login
merge is the highest-risk code in the plan: it is the only place that can destroy user data.

**Phase 13 — Notifications.** *(Lane C §4.6)*
Fixed local time, not a rolling 24h offset (which walks the reminder into the middle of the
night). Content is a *find*, not a verse: *"Numbers 13 has 4 words that appear nowhere else in
the Bible."* Never "here's your daily verse" — the pattern the owner named as the thing to avoid.

**Phase 14 — Unlocks and Holy Scroll.** *(Lane C §4.10, §4.11)*
The app is entirely free (no RevenueCat, no paid tiers). Special themes, fonts, colors, and layouts are unlockable through a "share with a friend" gimmick to encourage group commission and sharing the Bible. Holy Scroll interlinks via a shared Supabase account
(Tier 1); the App Group / local SSO path (Tier 2) requires both apps on team `R23HRQJN98` and two
identifiers nobody has supplied yet.

**Phase 15 — Ship.** *(Lane C §4.12, §4.13)*
Privacy policy, nutrition labels (including Azure as a named processor), the 5-tier age rating,
Xcode's Privacy Report, a demo account with real reading history, TestFlight, submit.

### Dependency graph

```
Phase 0 ─── (independent, do first)

Phase 1 ─┐
Phase 2 ─┼─► Phase 4 ─► Phase 6 ─┬─► Phase 7 ─► Phase 8
Phase 3 ─┘        └─► Phase 5 ───┘        └─► Phase 9 ─► Phase 10 ─► Phase 11

Phase 12 ─► Phase 13 ─► Phase 14 ─► Phase 15
   (12 needs 3 and 5; everything else in Act IV is sequential)
```

Phases **1, 2, and 3 run fully in parallel** — disjoint files, disjoint concerns. The Lexicon
extraction script (Phase 10) touches nothing in the app and can be written at any time.
Phase 4 must not overlap with any other edit to `app/session/[passageId].tsx`.

---

## 3. Design language — the invariants

Lifted from the code, not invented. These are what make a new screen indistinguishable from an
old one. **How things should *feel* — motion tiers, haptic meanings, the ethics of the
gamification — is [`06-design-philosophy.md`](./06-design-philosophy.md), and it is binding on
every new surface in this plan.**

- **Type: SF Pro Rounded, always, via `fontFamily`** from `constants/fonts.ts`. **Never
  `fontWeight`** — iOS synthesizes or falls back to the system font.
  Screen title 34/`bold`/ls -0.5 · section title 22/`bold`/ls -0.3 · subtitle 15/`regular` ·
  row title 17/`semibold`/ls -0.2 · meta 13/`regular`.
- **Icons: Lucide only.** No emoji, no other library. Verify every name against
  `node_modules/lucide-react-native/dist/types/icons` — do not guess. Pass `fill` = `color` for
  solid glyphs; skip it on multi-part icons.
- **Screen frame:** `paddingHorizontal: 20`, `paddingTop: insets.top + 24`,
  `paddingBottom: 140` (tab-bar clearance), `Animated.ScrollView` + `useMinimizeOnScroll()`.
- **Glass breaks under animated opacity.** Anything containing a `GlassView` animates
  transform-only — `<IntroReveal fade={false}>`. This is the single most repeated finding in the
  codebase (`intro-reveal.tsx:30-33`, `passage-carousel.tsx:186-195`, `daily-goal-card.tsx`), and
  it constrains the ribbon, the discovery chip, and every new card.
- **Nested glass does not render on iOS 26.** A card's glass is an absolute-fill *sibling*, never
  a parent of a button's own glass (`freestyle-card.tsx`).
- **One ring speed:** `withTiming(900ms, Easing.out(Easing.cubic))`, growing from 12 o'clock
  (`rotate: -90deg`). Every ring in the app fills identically.
- **Colors** come from `constants/colors.ts`, `constants/session-theme.ts`, and
  `constants/metrics.ts`. The whole plan introduces **one** new hex: `#7B5CF0` for the Rare
  lexicon tier.
- **Reuse before you build.** `SegmentedControl`, `TickBar`, `TickGauge`, `CounterCard`,
  `RecordsCard`, `PlaybackPill`, `AnimatedRoundedNumber`, `AnimatedDashedBorder`,
  `EmptyStateCard`, `ProgressiveBlur` all already do what the new screens need.

## 4. Non-negotiable engineering invariants

- **`lib/` stays pure.** No React, no `react-native`, no `services/` imports in
  `lib/history-schema.ts`, `lib/stats.ts`, or anything under `lib/bible/` except `queries.ts`.
  Bun runs these directly in `scripts/test-*.ts`; that's the point.
- **No persisted scores.** `types/history.ts:37-40` is explicit: raw measures only, every consumer
  recomputes. The Bible layer obeys it — chapter percent is popcount ÷ verse count, never stored.
- **Store only what cannot be derived.** Repeat counts, time spent, last-read, and book rollups
  all fall out of `SessionRecord`s that already exist. The only persisted new state is *which
  verses have been read* (a hex bitmap) and *the furthest verse*.
- **Total parsing.** Every payload yields a valid value or a stated reason. Newer-schema payloads
  are kept read-only, never destroyed.
- **Write-then-verify.** `set`, then read back, then treat as committed. Memory must equal disk.
- **`tzOffsetMinutes` is snapshotted per record** so streaks survive travel and DST. One streak,
  one definition — do not build a separate "Bible streak."
- **Never invent an identifier.** Bundle ids, App Group ids, team ids, ASC ids: read them from the
  repo or leave an ALL-CAPS placeholder. Both worker passes on Lane C violated this and both were
  caught; the second one did it inside a section titled "read them, never invent them."

## 5. How a phase gets verified

Every phase above ends in a "done when." This is how you actually establish it, rather than
reading the diff and hoping. Two tools are installed for exactly this.

**For anything Expo: use the Expo skills and MCP server, not memory.** The `expo` plugin
(v1.9.8) ships 21 auto-loading skills; `expo-router`, `expo-dev-client`, `expo-upgrade`,
`eas-workflows`, `eas-app-stores`, and `eas-observe` are the ones this plan touches. The Expo
**MCP server** (`https://mcp.expo.dev/mcp`) gives live documentation and EAS access. SDK 57 is
recent enough that model training is stale on it — that is the whole reason these exist.

**For anything visual or behavioural: use `agent-device`.** It drives a real running build —
accessibility tree, taps, scrolling, deep links, logs, network, screenshots. Reading code tells
you a screen *should* render; agent-device tells you it *did*. The `agent-device` and
`ios-simulator` skills are installed and load automatically.

```bash
agent-device doctor                      # run first; reports devices, Metro, missing tooling
agent-device open <AppName> --platform ios
agent-device snapshot -i                 # accessibility tree with @ids — snapshot before acting
agent-device press @e2 --settle
agent-device screenshot ./artifacts/phase-7-bible-tab.png
```

### What each phase should be verified with

| Phase | Verify with |
|---|---|
| 0 — Hygiene | Grep the built bundle for the Azure key. `agent-device` a real session to confirm pronunciation still works through the server route. |
| 1 — Database | `bun scripts/prepare-bible-db.ts` assertions; `explain query plan` on the **on-device** copy; confirm the second launch skips the copy via `agent-device logs`. |
| 2 — Pure modules | `bun scripts/test-bible.ts`. No device needed — that is the point of the purity rule. |
| 3 — Schema safety | `bun scripts/test-history.ts` with the two new read-only/`bad-mode` cases. |
| 4 — `ReadingSession` extraction | **Read the diff first** — it must be a move, not a rewrite. Then run one full session of each kind on a **real device** and compare behaviour. |
| 5 — Progress store | Seed a chapter, restart the app, confirm it survived. `agent-device` for the restart. |
| 6 — Session route | **Device-only.** The verse reference advancing, the ribbon reacting to speech, auto-advance firing — none of it is meaningful on a simulator. |
| 7 — Bible tab | `agent-device snapshot -i` on a **375pt device** for the four-tab overflow risk; screenshot the three chapter states. |
| 8 — Home + Settings | Change the daily goal, confirm the ring and percent move immediately. `bun scripts/test-stats.ts` proves `lib/stats.ts` stayed pure. |
| 9 — Completion moments | Screenshot the sheet; confirm it sits ≤360pt and shows zero performance metrics. |
| 10 — Lexicon | **Device-only.** Read Genesis 10 aloud, confirm chips fire for the right words and for nothing else, and that re-reading fires no duplicates. |
| 11 — Badges / drills | `agent-device` the badge grid; confirm every unearned badge shows its criterion. |
| 12–14 — Backend | Adversarial RLS check (sign in as A, read B's rows, expect zero). Two-device offline convergence. Sandbox purchase + restore. |
| 15 — Ship | Xcode Privacy Report; TestFlight; the review-notes demo account. |

### The two constraints that make simulator passes lie

1. **This app cannot run in Expo Go** — `react-native-mmkv`, `react-native-nitro-modules`,
   `expo-speech-recognition`, `react-native-purchases`, and the custom
   `plugins/with-scene-delegate.js` plugin do not exist there. Always target a development build.
2. **Speech recognition cannot be meaningfully exercised on a simulator.** Anything touching live
   recognition — Phases 6, 10, and the completion rule in every phase — is **device-only**.
   `EXPO_PUBLIC_MOCK_PRACTICE=1` runs the UI against a fake engine, which is useful for layout
   and useless for verifying the engine.

**Say which one you did.** "Verified on device", "verified on simulator", or "not verified" are
three different claims. A simulator pass reported as a pass is the failure mode this section
exists to prevent.

Also: `/ios` and `/android` are gitignored, so a fresh clone needs `npx expo prebuild` before
agent-device has anything to open.

---

## 6. Android — what actually crosses over

Expo genuinely does the heavy lifting: one codebase, both platforms, and this project is already
wired for Android (adaptive icons with a monochrome layer, `RECORD_AUDIO` and foreground-service
permissions, an `android.package`). But "same code" is not "same app," and three things in this
repo do not cross over cleanly. None is a blocker; all three need a decision.

### Everything in this plan is platform-agnostic

The whole Bible layer — SQLite packaging, `lib/bible/*`, the coverage bitmaps, rollups, the
session seam, the progress store — is plain TypeScript over `expo-sqlite` and MMKV, both of which
ship Android. **Zero Android-specific work in Phases 1–5, 9–11.** `expo-speech-recognition` has an
`android/` directory too, so the core loop is real on both.

### 1. Liquid Glass does not exist on Android — and it is the design language

`expo-glass-effect` has **no `android/` directory at all**. On Android, `GlassView` is literally
`<View {...props} />` and `isLiquidGlassAvailable()` returns `false`. **24 component files use it.**

The good news is that this app was built correctly: every one of those files already branches on
`isLiquidGlassAvailable()` and falls back to a `solidFallback` color (`rgba(244,244,246,0.96)` /
`rgba(26,26,30,0.96)`). Android renders solid cards instead of glass. It works and it does not
crash — but the material, the depth, and the interactive press response are gone, and those are
most of what makes this app look like it does.

Also iOS-gated by hand: the carousel's off-center depth blur (`passage-carousel.tsx:269`) and the
tab-bar haptics (`glass-tab-bar.tsx:143`).

**Decision to make:** ship Android with the flat fallback and accept it is a visually lesser
version, or design a deliberate Android material (elevation, Material 3 surfaces) rather than
letting it default to "iOS with the good parts removed." Do not discover this at submission time.

### 2. SF Pro Rounded cannot ship in an Android build

This is the landmine. The five `.otf` faces in `assets/fonts/` are bundled and loaded through
`expo-font`, so they will *render* on Android — but **Apple's SF font license permits use only on
Apple platforms.** Shipping SF Pro Rounded inside an APK/AAB is a license violation, and it is the
kind that is trivial to detect because the font files are right there in the bundle.

`UNVERIFIED:` the current exact wording of Apple's SF font EULA — read it before deciding, since
it has been revised. But plan for needing a substitute: **Nunito** and **Quicksand** are the
closest free rounded faces, and both are on Google Fonts with open licenses. That means a
platform-conditional font map in `constants/fonts.ts` — the one file the whole type system already
routes through, so the change is contained.

### 3. Auth — settled

**The owner has decided: Google *and* Apple sign-in on both platforms.** That removes auth as a
divergence question. Sign in with Apple runs through the web flow on Android; Google is native on
Android and web-based on iOS; Supabase supports both, so Lane C's schema is unchanged. It also
means App Store Guideline 4.8 is genuinely triggered (the app offers a third-party login), and
offering Apple alongside it satisfies exactly that. Watch one launch-day trap: Android requires the
**release keystore's SHA-1** registered with Google, so Google sign-in can work in debug and fail
in release.

### 4. The hardware back button is a live bug

There is **no `BackHandler` or `beforeRemove` anywhere in the app**. On Android, back unmounts the
session route, whose cleanup calls `cancel()` — not `stop()` — so **no record is written and the
minutes are lost**. That is the exact bug `handleDismiss`'s comment says was already fixed once for
the button path. Worse here: verse coverage is banked incrementally, so coverage would survive
while the record vanishes, producing "100% read, 0 sessions." **Fix it in Phase 4**, inside the
extracted `ReadingSession`, so both routes inherit one exit path — worth doing whether or not
Android ever ships.

### Harmless iOS-only pieces

`plugins/with-scene-delegate.js` (UIKit scene lifecycle for iOS 27), `appleTeamId`, and the Icon
Composer icons simply do not apply on Android — they are not compatibility problems.
`components/animated-rounded-number.ios.tsx` has a non-`.ios` sibling, so Android gets a working
fallback for the rolling digits; only the SwiftUI `numericText` transition is lost.

### Your Android setup, concretely

The SDK is installed at `~/Library/Android/sdk`, but **`adb` is not on your PATH** — which is
exactly why `agent-device doctor` reports Android inventory as unavailable and why the
`android-emulator` skill is currently inert. And **no AVDs exist yet**, so there is no emulator to
boot.

```bash
# add to ~/.zshrc
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator"

# then create an AVD in Android Studio (Device Manager → Add), and:
adb devices
agent-device doctor          # Android inventory should now resolve
bunx expo run:android
```

An emulator is fine for layout, navigation, and the glass fallback. It is **not** fine for speech
recognition — same rule as the iOS simulator. Since you have no Android device, treat Android
speech as unverified until you get one.

### Recommendation

**Ship iOS first — but fix the back button in Phase 4 and keep the font swap ready.** Nothing in
Phases 0–11 blocks Android later: the logic is portable and the glass fallbacks already exist. The
two genuinely Android-shaped decisions (the font substitute, and whether Android gets a designed
material or the flat fallback) are better made once you know whether anyone is on Android.

**Full detail — dependency audit, the divergence techniques, Android platform behaviours, a
per-phase delta table, and machine setup — is in [`05-android.md`](./05-android.md).**

---

## 7. Working in git, one phase at a time

Full beginner-safe guide in [`04-backend-shipping.md` §4.14](./04-backend-shipping.md) — including
what `git status` is telling you, why `git add .` is a bad habit when `.env.local` is in the repo,
how to undo *uncommitted* work, how to survive a merge conflict, and what a worktree actually is.

The loop per phase:

```bash
git checkout main && git pull          # start from current main
git checkout -b phase-6-bible-session  # one branch per phase
# ...work...
git status                             # look before you stage — every time
git add <specific files>               # not "."
git commit -m "Add Bible session route with verse-reference top bar"
git checkout main && git merge phase-6-bible-session
```

One phase = one branch = one merge. If a phase is taking more than a few days, it was too big —
split it at a "done when" boundary.

---

## 8. Still open — owner decisions

Nobody should guess these.

1. **The licensing call (gates Phase 1).** Build your own KJV database from verified public-domain
   text, or ship CC0 `BSB.db`? Lane C recommends building your own with BSB as fallback.
2. **Does the bundle id change?** Keeping `com.schroedernathan.clarity` preserves the ASC record,
   provisioning, TestFlight testers, and installed users' local data.
3. **`group.SHARED_APP_GROUP_ID_TBD`** and **`HOLY_SCROLL_BUNDLE_ID_TBD`** — needed only if you
   want Tier 2 Holy Scroll SSO. Requires both apps on team `R23HRQJN98`.
4. **Are there real users on the current bundle id in production?** Decides whether a bundle-id
   change needs a migration story or can be a clean break.
5. **Does Android ship at all, and when?** §6 recommends iOS-first. If it ships, two sub-decisions
   follow: a replacement for SF Pro Rounded (a license requirement, not a preference — Nunito is
   the recommendation), and whether Android gets a designed material or the flat glass fallback.
   Auth is no longer one of these — Google + Apple on both platforms is settled.
6. **`minSdkVersion` 33 (Android 13)?** Recommended, because audio recording and continuous
   recognition — the core loop — are unavailable below it. Supporting Android 12 means shipping a
   build where reading a chapter doesn't properly work.
