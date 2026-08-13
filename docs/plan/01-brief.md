# Speak the Bible — Shared Context Brief

**Every worker on this Run MUST read this file top to bottom before writing anything.**

Repo: `/Users/chandler/orca/clarity` (branch `main`, clean at dispatch time)
Bible DB source: `/Users/chandler/Documents/BibleScroll/Translations/kjv.db`

---

## 1. What is being built

The existing app is **Clarity** — an Expo/React Native speech-coaching app. The owner is
repurposing it as the core engine for a **new app called "Speak the Bible"**, whose central
loop is: *the user reads/speaks the entire Bible aloud, chapter by chapter, and every bit of
that is tracked.*

**Hard constraint from the owner, repeated several times: DO NOT rip out or break what
exists.** The pronunciation engine, drills, freestyle, analytics, teleprompter, and the
whole visual/UX language are considered excellent and are the reference standard. The Bible
experience is **added as a new tab (placed after Analytics)** plus targeted, additive changes
to Home and the session screen. Existing Practice content (Epic Speech, Tongue Twisters,
Minimal Pairs, Introduce Yourself, drills, freestyle, user passages) stays.

The owner's exact words on style: *"I love the design i love the design so much the UX and
everything so i don't want you to expand too far out of it but use it as full inspiration as
like close as possible to like matching the styling."* Treat the current design system as
law. New surfaces must look like they shipped with the old ones.

Tone target: **"super creative, super new design, super modern, forward thinking, Gen Z
flavoring."** The owner explicitly rejected boring/derivative ideas — they called out
"old Duolingo daily verse" style filler as *lame*. Gamification should feel like a game
you *want* to keep playing, not a chore streak-nag.

---

## 2. Ground truth: the KJV database

`kjv.db` is plain SQLite, 4.75 MB, three tables:

```sql
CREATE TABLE translations (translation TEXT PRIMARY KEY, title TEXT, license TEXT);
CREATE TABLE KJV_books  (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT);
CREATE TABLE KJV_verses (id INTEGER PRIMARY KEY AUTOINCREMENT,
                         book_id INTEGER, chapter INTEGER, verse INTEGER, text TEXT,
                         FOREIGN KEY (book_id) REFERENCES KJV_books(id));
```

Verified facts:
- `KJV_books` = **exactly 66 rows**, id 1 (Genesis) → 66 ("Revelation of John").
- `KJV_verses` = **31,102 rows**.
- `translations` = one row: `KJV | "# KJV: King James Version (1769) with Strongs Numbers and Morphology and CatchWords" | GPL`.
- Verse text is clean prose, e.g. `In the beginning God created the heaven and the earth.`
- **There are no indexes** other than the implicit PK/autoindex. A `(book_id, chapter, verse)`
  index is missing and chapter reads will table-scan without it.
- Book names use Roman-numeral style: `I Samuel`, `II Kings`, `III John`, and
  `Revelation of John` (not "Revelation"). Any display layer needs a name map for
  canonical display names + abbreviations + Old/New Testament grouping (books 1–39 OT,
  40–66 NT).
- Table names are **translation-prefixed** (`KJV_books`, `KJV_verses`). Sibling DBs exist in
  the same folder (`ASV.db`, `BSB.db`, `YLT.db`, `Geneva1599.db`, `Webster.db`, `NHEB.db`,
  `LITV.db`, `MKJV.db`, `AKJV.db`, `BBE.db`, `Darby.db`, `RLT.db`, `RNKJV.db`) — the owner
  **plans to add other translations later**, so the design must not hardcode "KJV" into
  application logic. Assume the same prefixed-table convention per file.
- The KJV file is licensed GPL per its own `translations` row — flag any licensing
  implication for shipping, but do not block on it; just note it.

---

## 3. Ground truth: the existing codebase

Expo SDK **57**, React Native 0.86, React 19.2, expo-router (with `expo-router/ui` custom
tabs), TypeScript 6, Reanimated 4, MMKV v4 for storage, `expo-speech-recognition`,
RevenueCat (`react-native-purchases`), EAS Observe, Zod 4. Package manager: **bun**
(`bun.lock` present; `packageManager` field says yarn — treat bun as authoritative,
`npm test` maps to `bun scripts/test-*.ts`).

**IMPORTANT — read the versioned docs.** `AGENTS.md` requires reading
https://docs.expo.dev/versions/v57.0.0/ before writing Expo code. Do not write SDK code
from memory.

### Routing / screens
```
app/_layout.tsx                 Root Stack; fonts, splash overlay, nav theme, EAS Observe
app/(tabs)/_layout.tsx          Custom glass tab bar; ITEMS = [index, practice, analytics]
app/(tabs)/index.tsx            Home
app/(tabs)/practice.tsx         Practice
app/(tabs)/analytics.tsx        Analytics
app/session/_layout.tsx         Session stack + SessionContext (setResult, retryToken)
app/session/[passageId].tsx     The live reading screen (teleprompter)
app/session/freestyle.tsx       Freestyle mode
app/session/results.tsx         Session complete / results
app/passage-editor.tsx          Modal for user-authored passages
app/api/speech-coach+api.ts     Server route for AI coaching
```

Adding a tab = adding a `GlassTabItem` to `ITEMS` in `app/(tabs)/_layout.tsx` (name, href,
label, Lucide icon) and a matching `app/(tabs)/<name>.tsx`. The tab bar is a liquid-glass
pill; note the comment that **glass breaks under animated opacity** — entrance animations on
anything containing a `GlassView` must be transform-only (`<IntroReveal fade={false}>`).

### Data layer
```
lib/history-schema.ts   MMKV key namespaces + total parsing/validation + migrations
lib/history-store.ts    (826 lines) the store itself
lib/stats.ts            derived stats, streaks, weekly history
lib/score.ts            speakingScore(record), isScorable()
lib/passage-catalog.ts  getAnyPassage(id), modeForId(id)
lib/passage-text.ts     tokenizePassage()
lib/metrics.ts, lib/recommendations.ts, lib/fillers.ts, lib/format.ts
services/session-history.ts, services/user-passages.ts, services/storage.ts, services/kv.ts
services/live-recognition.ts, services/azure-pronunciation.ts, services/alignment.ts,
services/scoring.ts, services/recognition-owner.ts, services/wav.ts
hooks/use-practice-session.{ts,real.ts,mock.ts}, use-session-history.ts,
hooks/use-session-checkpoint.ts, use-speaking-summary.ts, use-freestyle-session.ts
```

MMKV key namespaces (`KEY` in `lib/history-schema.ts`):
`s/` records, `q/` quarantine, `w/` word aggregates, `p/` passage, `meta/` metadata.
Record keys are `s/<paddedCompletedAt>/<paddedSeq>` so **lexicographic order == chronological
order** — `getAllKeys()` needs no sort. Any new namespace must follow this discipline.

`types/history.ts` defines `SessionRecord` (schema version 2). Design notes that matter:
- **RAW MEASURES ONLY — there is deliberately no persisted score.** Every consumer
  recomputes via `speakingScore(record)`. Preserve this property.
- `SessionMode = 'passage' | 'drill' | 'freestyle'` — a Bible mode likely needs a new member,
  which means a `history-schema.ts` parse update and possibly a `RECORD_SCHEMA_VERSION` bump.
  The file's own rule: *"Bump when a field changes meaning (not when one is added), and add
  the corresponding step to `upgradeRecord`."* Follow it.
- `SessionEndedReason = 'completed' | 'stopped' | 'abandoned' | 'interrupted' | 'error'`.
  Only `completed`/`stopped` are scorable; the rest still count toward minutes/streak.
- `tzOffsetMinutes` is snapshotted so streaks survive travel/DST. Don't break that.
- `InflightSession` is the crash-recovery checkpoint (`use-session-checkpoint.ts`).

`lib/history-schema.ts` is a **PURE module** — no React, no `services/`, no react-native
imports — because `scripts/test-history.ts` runs it under bun. Keep it that way.

### Session screen mechanics (`app/session/[passageId].tsx`)
- `usePracticeSession(passage)` exposes `status`, `currentWordIndex`, `currentWordFraction`,
  `liveWpm`, `elapsedMs`, `meterLevel`, `fillerCount`, `error` and `start/pause/resume/stop/
  restart/cancel`.
- `<Teleprompter>` scrolls the tokenized text and highlights by `currentWordIndex`.
- `<SessionTopBar>` holds dismiss + text-size (Aa) buttons and takes a child — currently
  `<LiveWpm liveWpm targetWpm />`.
- `<PracticeControls>` = the big pill: pause/resume, restart, stop, elapsed timer, mic meter.
- Session auto-finishes when `status === 'done'` (end of passage reached) → `finishSession('completed')`.
- Every terminal path writes a record via `recordSession()` and clears the checkpoint;
  dismiss/restart mid-read bank the partial attempt as `'abandoned'` on purpose.

### Design system
- **Typography: SF Pro Rounded only.** Set weight via `fontFamily` from
  `constants/fonts.ts` (`fonts.regular` … `fonts.heavy`). **Never `fontWeight`** — iOS
  synthesizes or falls back to the system font. This rule is in `AGENTS.md`.
- **Icons: `lucide-react-native` only.** No emoji, no text glyphs, no other icon library.
  Import each icon as a named component (`import { Mic } from 'lucide-react-native'`), props
  `size`/`color`/`strokeWidth`/`fill`. Pass `fill` = `color` for "active"/solid glyphs; skip
  `fill` on multi-part icons. Type icon props as `LucideIcon`.
  **Do not guess icon names** — verify with
  `ls node_modules/lucide-react-native/dist/types/icons | grep -i <keyword>`.
- Colors: `constants/colors.ts` (`palette.light/dark`: background `#F4F4F6`/`#0B0B0D`,
  foreground `#111114`/`#FFFFFF`, card `#FFFFFF`/`#1A1A1E`) and
  `constants/session-theme.ts` (`sessionColors` accent `#3478F6`/`#4C8DFF`, good/warn/bad,
  glass control-card fills, `TELEPROMPTER_TEXT_SIZES = [28, 34, 40]`).
- Screen title style: 34pt `fonts.bold`, letterSpacing -0.5. Section title 22pt bold /
  subtitle 15pt regular. Screen padding: `paddingHorizontal: 20`, `paddingTop: insets.top + 24`,
  `paddingBottom: 140` (tab bar clearance).
- Intro stagger: `<IntroReveal order={n} fade={false|true}>` — chrome at order 0, content
  cascading. Glass-containing children must use `fade={false}`.
- `useMinimizeOnScroll()` on the screen's `Animated.ScrollView` minimizes the tab bar.

### Existing UI vocabulary worth reusing for the Bible tab
`components/passage-carousel.tsx` (the "For you" horizontal glass cards with gradient
artwork + duration + Start), `components/practice/passage-row.tsx` (the list rows used for
"Your passages" / Stories / News / Narration / Poetry — the owner specifically praised this
formatting), `components/practice/section-header.tsx`, `components/segmented-control.tsx`
(obvious fit for Old/New Testament), `components/progress-card.tsx`,
`components/words-to-master.tsx`, `components/daily-goal-card.tsx`,
`components/weekly-progress.tsx`, `components/empty-state-card.tsx`,
`components/animated-dashed-border.tsx`, `components/analytics/*`, `components/metrics/*`
(counter-card, skill-card, tick-bar, delta-label, score-value).

---

## 4. The owner's requirements, itemized

These are distilled from a long stream-of-consciousness brief. Where the owner was
undecided, that is flagged **[OPEN — recommend one option and say why]**. The owner
explicitly wants opinionated recommendations, not a menu.

### 4.1 New Bible tab (after Analytics)
- Mirrors the Practice tab's structure/feel but for scripture.
- All **66 books**, each expanding to its chapters. The owner's analogy: where Practice lists
  "Epic Speech / Tongue Twisters / Minimal Pairs / Introduce Yourself" as cards, the Bible tab
  lists chapters — chapter 1, chapter 2, chapter 3 … for every book.
- Each chapter shows an **estimated time** (the owner likes the current `~2 mins` duration
  chip) and a **completion state**, not just "Start":
  - not started → the existing "Start" affordance
  - partially read → **percent complete as a ring/circle in the corner** (e.g. "14%")
  - fully read → a clear completed state (the owner wants "it was completed" to be visible,
    but was clear it is **not** a manual "mark complete" button — completion is *earned*)
- **Repeat counts**: if the user reads something 2× or 3×, the UI must show that.
- Fast navigation to **Old Testament / New Testament** and then to a specific book. The
  owner liked the `segmented-control` + grouped-rows formatting from "Your passages".
- Show **last read** / how far along they are.

### 4.2 Home screen (additive)
- Keep the greeting, streak, and daily-goal card — the owner loves them.
- Rename the CTA **"Start Practicing" → "Start Speaking"** (or similar).
- **Daily goal is currently not user-settable** — the owner wants a way to set it, probably
  in a Settings surface that does not exist yet. **[OPEN — where does Settings live?]**
- "For you" should become the Bible equivalent + include **"Recently read" / "Recently
  spoken"** sections.
- "Your progress" — **[OPEN]** should it be progress through the *whole Bible*, or through
  the *current book*? Owner floated both.
- "Words to master" — **[OPEN]** owner is unsure what belongs here now. Their own idea, which
  they liked: **collectible lexicon** — interesting/archaic KJV words, **biblical names**,
  **biblical places** discovered as you read, to gamify continued reading ("find all the
  characters in the Bible", "find all the cool lexicon/places in the Old Testament").

### 4.3 Live reading session screen
- **Do not touch speech recognition** — the owner considers it excellent as-is.
- Keep the Aa text-size control (top left). Loved.
- Top bar currently shows live WPM + target WPM + "warming up". Replace with **the verse
  reference the user is currently on** — as the transcript advances into the next verse, the
  reference updates (e.g. `Genesis 1:14`). The owner called this "the best most brilliant way
  for it to be". Possibly also show translation + book/chapter.
- **Remove the count-up timer** — no longer meaningful. Replace with *"a cool design… when
  someone's speaking it maneuvers very elegantly, or draws, like there's input being said."*
  (An expressive live-input visualization. `components/session/live-waveform.tsx` exists as a
  starting point.)
- The big control pill (pause/stop/restart): the owner likes the design but the verbs are
  wrong for reading scripture. Wants something like **"Continue to next chapter"** without
  the control becoming huge. **[OPEN — propose the exact control set and layout.]**
- **[OPEN — the key interaction decision]**: does a chapter register as complete when the
  user *manually stops*, or automatically **once the recognizer detects the last word was
  read**? Owner asked for a recommendation.

### 4.4 Session-complete / results screen
- Owner loves the existing results presentation (score, fillers, pacing, flow, articulation,
  recording playback, grade, word breakdown, AI coach) and the way it animates in.
- But: **most of that is not what a Bible reader needs.** The AI coach isn't wired up and the
  owner doesn't want pronunciation-coaching noise here.
- **[OPEN]**: what actually belongs on a scripture session-complete screen? Should it appear
  after **every chapter**, or only after a **whole book**? Owner worries about "added junk"
  but likes the moment. Propose a concrete design.

### 4.5 Tracking (non-negotiable)
*"obviously every time someone completes stuff i want it to be like fully tracked right fully
tracked everything"* — per verse, per chapter, per book, per translation, repeat counts,
last-read position, time spent, streaks.

### 4.6 Gamification
- Badges / awards / achievements. *"I want them to feel like it's a game."*
- The collectible lexicon / biblical names / biblical places idea from 4.2.
- Must not feel like a generic streak-nag. Gen Z, modern, creative.

### 4.7 Existing sections the owner is unsure about
- **Drills** and **Freestyle** — the owner likes them and does *not* want them deleted, but
  isn't sure what role they play in a Bible app. **[OPEN — propose a role, or propose
  relocating/rebranding them.]** Ideas welcome (e.g. drills on hard biblical names?).

### 4.8 Backend / production (final phase)
- **Sign in with Apple**.
- **Supabase** — the owner is "setting up Supabase super well" and wants a schema + sync
  design. **[OPEN — Supabase vs iCloud vs both; recommend one and justify.]** Note the app is
  currently **local-first MMKV**; any sync design must preserve offline-first behavior and
  must reconcile with the existing key/schema discipline.
- **Notifications**: streak reminders, and a daily-verse-style nudge — but explicitly *not*
  the boring version.
- **Holy Scroll interlink**: the owner has another app called Holy Scroll
  (email domain `holyscroll.app`) and wants ideas for how the two apps interconnect
  (shared account, shared reading position, cross-promotion, shared streak, etc.).
- RevenueCat is already a dependency — monetization surface is presumably paywalled
  translations/features. **[OPEN — propose a monetization shape.]**
- *"Anything else I would need to know for production."*

### 4.9 Process / documentation deliverable
The owner says plainly: *"i'm not sure how git works and commits and branches and other
things and work trees i don't know like the right way to do it each phase."*

So the final deliverable must include a **beginner-safe, concrete git workflow** — branch per
phase, what to commit, how to write a commit message, when to merge, what a worktree is and
when to bother — written for someone who does not know git. No hand-waving.

And: *"can you please update this to like an agents.md file as well with everything or like a
phase md file… I need to like have a structured flow of literally everything that can work
phase by phase and all information and ideas and brainstorm that's like fully fleshed out
written in there with design language this and that what's next expectations."*

---

## 5. Note on Axiom skills

The owner asked for Axiom skills to be used. **Axiom is a Swift/SwiftUI/Xcode toolchain** —
its auditors and skills target native iOS source. This project is **Expo / React Native /
TypeScript**, so most Axiom skills (axiom-swiftui, axiom-data, axiom-concurrency,
axiom-uikit) have no applicable surface here. The genuinely transferable ones are
**axiom-design** (Apple HIG, Liquid Glass, SF Symbols/typography reasoning),
**axiom-integration** (push notifications, StoreKit/IAP, App Intents, widgets — as concepts
the Expo layer wraps), and **axiom-shipping** (App Store submission, privacy manifests,
rejection risks, age rating, export compliance). Use those three where they genuinely apply
and say so explicitly; do not fabricate applicability for the rest. The native iOS project
does exist at `ios/` (prebuild output), so entitlements/Info.plist-level advice is real.

---

## 6. Rules for your output

1. **Write exactly one markdown file**, at the path your task specifies, under
   `/Users/chandler/orca/clarity/docs/plan/`. Create the directory if needed. Do not edit any
   other file in the repo — three workers are running in this same worktree concurrently and
   anything else will collide. Do not run `git commit`, `git checkout`, or `git branch`.
2. **Verify before you assert.** Read the real files. Quote real symbol names, real paths,
   real line references. If you claim an API exists in Expo SDK 57, check
   https://docs.expo.dev/versions/v57.0.0/ or `node_modules`. Mark anything you could not
   verify as `UNVERIFIED:` inline — do not launder a guess into a fact.
3. **Be decisive on every `[OPEN]` item.** Give one recommendation, state the reasoning in
   two or three sentences, and note the runner-up you rejected. The owner asked for opinions.
4. **Respect the constraints**: additive only; nothing existing gets deleted; SF Pro Rounded
   via `fontFamily`; Lucide icons only (verified names); the design system in §3 is law;
   `history-schema.ts` stays pure; no persisted scores.
5. **Structure your file for a phased build.** Every recommendation should say which phase it
   lands in, what files it touches, and what "done" looks like. Assume a coordinator will
   concatenate your file with two siblings into a master `PHASES.md`, so use `##`-level
   headings and don't restate this brief.
6. Length: thorough beats short. This is a planning document the owner will build from for
   weeks. But every paragraph must carry information — no filler, no restating the obvious.
