# Product, UX & Gamification

Lane B. Everything below is expressed in the components that already ship. Where a
new component is needed, its metrics are copied from a named existing file so the
new surface is indistinguishable from the old ones.

Two contracts I depend on and do not own:

- **Lane A (data)** owns `verseAt()`, chapter tokenization, `verseStarts[]`, the book-name
  map (display name + abbreviation + testament + division), the lexicon tables, and every
  MMKV namespace change.
- **Lane C (backend)** owns sync, auth, notifications, RevenueCat.

Anything I could not verify by reading a file or running a query is marked `UNVERIFIED:`.

---

## Ground numbers I measured

Run against `/Users/chandler/Documents/BibleScroll/Translations/kjv.db` (read-only), because
several design decisions below only make sense in light of the real distribution:

| measure | value |
|---|---|
| chapters | **1,189** |
| total words | **789,814** |
| words per chapter — min / median / max | 33 / 627 / 2,423 |
| minutes per chapter at 130 wpm — min / median / max | **0.3 / 4.8 / 18.6** |
| chapters that round to ≤ 1 minute | 68 |
| longest chapter | Psalms 119 (2,423 words, ~18.6 min) |
| shortest chapter | Psalms 117 (33 words, ~15 sec) |
| distinct non-sentence-initial capitalized tokens | **3,804** |
| of those, tokens appearing **exactly once** in the whole Bible | **1,649** |
| distinct `-eth` / `-est` word forms | 958 |
| distinct lowercase word types | 12,456 |

Two consequences drive §4 and §5: a "chapter" is not a uniform unit of work (15 seconds to
19 minutes), and there are 1,649 words in the Bible you can only find by reading it.

**Target WPM for scripture: 130.** That is `calm-narration`'s `targetWpm` in
`constants/passages.ts` — not `epic-speech`'s 179. KJV is archaic prose; 130 is the honest
number and it is what every "~N min" estimate below assumes.

---

## 1. The Bible tab

### 1.1 Registration

`app/(tabs)/_layout.tsx` — append to `ITEMS`, **after** `analytics`:

```ts
{ name: 'bible', href: '/bible', label: 'Bible', icon: BookOpen }
```

`BookOpen` verified (`book-open.d.ts`). The tab bar goes from 3 to 4 items.
`UNVERIFIED:` how `GlassTabBar` (vendored from expo-glass-tabs) lays out at 4 items — check
label truncation on a 375pt-wide device before committing to the label "Bible" (fallback
label: none, icon-only, if the vendored bar supports it).

**Routing.** Recommended: a nested stack inside the tab so the glass tab bar survives
drilling into a book —

```
app/(tabs)/bible/_layout.tsx     Stack, screenOptions={{ headerShown: false }}
app/(tabs)/bible/index.tsx       the tab screen (§1.2)
app/(tabs)/bible/[bookId].tsx    chapter grid (§1.4)
```

`UNVERIFIED:` whether `expo-router/ui`'s `TabSlot` renders a nested `Stack` correctly — the
custom `TabTrigger` parser is documented in `_layout.tsx` as skipping wrapper components.
**Fallback if it doesn't:** put `[bookId].tsx` at the root (`app/bible/[bookId].tsx`,
registered on the root `Stack` beside `session` and `passage-editor`). The tab bar then
hides while browsing a book, which is acceptable — `session` already does exactly that.

### 1.2 Screen composition

Same skeleton as `app/(tabs)/practice.tsx`: `Animated.ScrollView` + `useMinimizeOnScroll()`,
`contentContainerStyle={{ paddingTop: insets.top + 24, paddingHorizontal: 20, paddingBottom: 140 }}`.

| order | `IntroReveal` | content |
|---|---|---|
| 0 | `fade` / `fade={false}` | `<Text style={screenTitle}>Bible</Text>` + `<HeaderActions streak={…} />` |
| 1 | `fade={false}` | **`ContinueCard`** — resume hero (§1.3) |
| 2 | `fade` | `<SectionHeader title="Books" subtitle="66 books · 1,189 chapters" />` |
| 3 | `fade={false}` | `<SegmentedControl segments={['Old Testament','New Testament']} … />` |
| 4 | `fade={false}` | `<SearchField />` (Phase 3; §1.7) |
| 5..n | `fade={false}` | one block per division: `<SectionHeader title={division} />` + `BookRow[]` |

`screenTitle` is verbatim from `practice.tsx`: `fontSize: 34, fontFamily: fonts.bold,
letterSpacing: -0.5`. `SectionHeader` is used unmodified (22pt bold / 15pt regular,
`marginTop: 28`).

Every block that contains a `GlassView` uses `fade={false}` — the rule stated in
`app/(tabs)/index.tsx:84-87` and `components/splash/intro-reveal.tsx:30-33`. `BookRow`,
`ContinueCard`, `SegmentedControl` wrapper: all `fade={false}`.

**Divisions** (`SectionHeader` titles, in order):

- OT: `The Law` (1–5) · `History` (6–17) · `Poetry & Wisdom` (18–22) · `Major Prophets` (23–27) · `Minor Prophets` (28–39)
- NT: `Gospels` (40–43) · `The Early Church` (44) · `Paul's Letters` (45–57) · `General Letters` (58–65) · `Revelation` (66)

Each division owns one artwork gradient pair, in the exact idiom of `constants/passages.ts`
(alphas < 1 so card glass reads through). Proposed `constants/bible-art.ts`:

```ts
'law':      { base: ['rgba(45,75,230,0.95)','rgba(48,44,150,0.88)'], blob: ['rgba(255,130,80,0.95)','rgba(240,80,190,0.65)'] },
'history':  { base: ['rgba(16,130,150,0.92)','rgba(24,86,180,0.85)'], blob: ['rgba(120,255,190,0.90)','rgba(60,210,255,0.55)'] },
'poetry':   { base: ['rgba(130,60,220,0.92)','rgba(70,50,190,0.85)'],  blob: ['rgba(255,190,120,0.92)','rgba(255,110,180,0.55)'] },
'major':    { base: ['rgba(190,60,60,0.92)','rgba(120,30,90,0.85)'],   blob: ['rgba(255,200,120,0.92)','rgba(255,120,90,0.55)'] },
'minor':    { base: ['rgba(200,110,30,0.92)','rgba(140,50,60,0.85)'],  blob: ['rgba(255,225,150,0.92)','rgba(255,150,90,0.55)'] },
'gospels':  { base: ['rgba(230,190,60,0.92)','rgba(190,110,30,0.85)'], blob: ['rgba(255,250,200,0.92)','rgba(255,200,110,0.55)'] },
'acts':     { base: ['rgba(30,170,120,0.92)','rgba(20,110,120,0.85)'], blob: ['rgba(190,255,200,0.90)','rgba(90,230,190,0.55)'] },
'paul':     { base: ['rgba(60,90,200,0.92)','rgba(40,60,140,0.85)'],   blob: ['rgba(180,210,255,0.92)','rgba(120,160,255,0.55)'] },
'general':  { base: ['rgba(90,110,160,0.92)','rgba(50,60,110,0.85)'],  blob: ['rgba(210,230,255,0.90)','rgba(150,180,230,0.55)'] },
'revelation':{ base:['rgba(20,20,40,0.95)','rgba(70,20,110,0.88)'],    blob: ['rgba(255,140,60,0.95)','rgba(255,60,140,0.65)'] },
```

Rejected: a per-book gradient. 66 hand-tuned gradients is a week of design for a signal the
user can't decode; division color is legible at a glance and doubles as the badge art (§5.5).

### 1.3 `ContinueCard` — the resume hero

New: `components/bible/continue-card.tsx`. Structure copied from
`components/practice/freestyle-card.tsx` (card glass as an absolute sibling so the button's
own `GlassView` is never nested — the iOS 26 constraint noted in that file's header).

```
card:        padding 20, borderRadius 36, borderCurve 'continuous'
cardShape:   borderRadius 36 (absolute-fill glass sibling)
glassTint:   'rgba(255,255,255,0.45)' / 'rgba(10,10,12,0.55)'
solidFallback:'rgba(244,244,246,0.96)' / 'rgba(26,26,30,0.96)'
eyebrow:     13 fonts.medium, #77777E / #9E9EA6         "Continue reading"
title:       26 fonts.bold, ls -0.4, foreground          "Genesis 1"
caption:     15 fonts.regular, secondary, marginTop 4    "verse 14 of 31 · ~3 min left"
ring:        34pt ProgressRing, absolute top 20 right 20 (§1.5)
button:      height 54, radius 27, marginTop 16, tintColor #1C1C21 / #F2F2F5
buttonLabel: 17 fonts.semibold, #FFFFFF / #111114        "Continue"
buttonIcon:  <Mic size={20} color={label} fill={label} />
```

`Mic` filled matches `DailyGoalCard` and `FreestyleCard` — this app's universal "speak now"
glyph. First-run state (no reading position): eyebrow `"Start here"`, title `"Genesis 1"`,
caption `"The beginning · ~5 min"`, button `"Start Speaking"`.

### 1.4 `BookRow` and the chapter grid

**`components/bible/book-row.tsx`** — a `PassageRow` clone plus a trailing state slot.
Do **not** modify `passage-row.tsx` (additive rule; Practice still uses it). Metrics copied
verbatim from `passage-row.tsx:144-189`:

```
row:      flexDirection row, alignItems center, gap 14, padding 12,
          borderRadius 26, borderCurve continuous, marginTop 12
thumb:    56×56, borderRadius 18, overflow hidden  (division gradient, ArtworkThumb technique)
title:    17 fonts.semibold, ls -0.2, foreground        "Genesis"
meta:     13 fonts.regular, secondary                   "50 chapters · 12 read · 2 days ago"
trailing: 34pt state slot (ring / check / nothing)      (§1.5)
```

Time-ago strings come from `timeAgo()` in `lib/format.ts` (already used in
`app/(tabs)/analytics.tsx:80`).

**Chapter grid** (`[bookId].tsx`). Decision: **a two-column grid of chapter tiles**, not a
row list.

Reasoning: Psalms has 150 chapters; at `PassageRow`'s 80pt+12pt pitch that is ~13,800pt of
scroll for one book. A 2-up grid halves it, and the owner's own request — "percent complete
as a ring **in the corner**" — presumes a card with corners, not a row. Runner-up rejected:
full-width `BookRow`s per chapter, which reads beautifully for Jude (1 chapter) and is
unusable for Psalms.

```
screen:   paddingTop insets.top + 24, paddingHorizontal 20, paddingBottom 140
header:   [ChevronLeft 44pt glass circle] "Genesis" 34 fonts.bold ls -0.5
subhead:  "50 chapters · 12 read · ~4h 10m to finish"  15 fonts.regular secondary
control:  <SegmentedControl segments={['All','Unread','Read']} /> marginTop 18
grid:     flexDirection row, flexWrap wrap, gap 12, marginTop 12
tile:     width (screenWidth - 40 - 12) / 2, height 104,
          borderRadius 26, borderCurve continuous, padding 14
          glass tint / solidFallback: PassageRow's THEME values
```

Tile content:

```
title:  17 fonts.semibold, ls -0.2, foreground            "Chapter 1"
meta:   12 fonts.medium, secondary, marginTop 2           "~5 min · 31 verses"
state:  absolute top 12 right 12, 34×34                   (§1.5)
chips:  absolute bottom 12 left 14, row gap 6             repeat chip (§1.6)
```

The tile is one `Pressable` wrapping one `GlassView isInteractive` with all content inside
it — the finding documented in `passage-carousel.tsx:186-195` and `drill-card.tsx:31-33`
(the native glass press response only fires for touches landing in the glass view's own
subtree, and nested glass does not render on iOS 26). No `pressed` opacity on the glass path.

**Estimated time formatting** (`lib/bible-format.ts`, pure):

```ts
const sec = (words / 130) * 60;
sec < 60 ? `~${Math.round(sec / 15) * 15} sec` : `~${Math.round(sec / 60)} min`;
```

Psalm 117 reads `~15 sec`, not a dishonest `~1 min`. 68 chapters land under a minute; they
should say so.

### 1.5 The three chapter states — exact spec

One new component, `components/bible/chapter-state.tsx`, rendering a 34×34 slot. Same
component serves the tile corner, the `BookRow` trailing slot, and the `ContinueCard`.

**A. Not started** — the Start affordance.

```
34×34 circle, backgroundColor: '#1C1C21' (light) / '#F2F2F5' (dark)
<Play size={13} color={'#FFFFFF' | '#111114'} fill={same} />
```

Those are `words-to-master.tsx`'s `badgeBg` / `badgeText` — the app's existing "go" pill
colors, at circle scale.

**B. Partial — the percent ring** (the owner asked for exactly this).

```
Svg 34×34, style transform [{ rotate: '-90deg' }]     ← grows from 12 o'clock
                                                        (WeeklyProgress's TodayRing precedent)
STROKE_WIDTH   3
RADIUS         (34 - 3) / 2 = 15.5
CIRCUMFERENCE  2π · 15.5 ≈ 97.39
track  <Circle stroke={'rgba(17,17,20,0.14)' | 'rgba(255,255,255,0.16)'} fill="none" />
fill   <AnimatedCircle
         stroke={sessionColors[scheme].accent}        // #3478F6 / #4C8DFF
         strokeLinecap="round"
         strokeDasharray={`${C} ${C}`}
         animatedProps={{ strokeDashoffset: C * (1 - progress) }} />
label  centered, absolute, 11 fonts.bold, foreground   "14%"
```

Track colors are `daily-goal-card.tsx`'s `THEME.track`. Fill animation:
`withTiming(pct, { duration: 900, easing: Easing.out(Easing.cubic) })` — the same 900ms cubic
used by `WeeklyProgress` and `DailyGoalCard`, so every ring in the app fills at one speed.

At 34pt outer / 3pt stroke the hollow is 28pt across; `"14%"` at 11pt bold measures ≈ 24pt.
It fits. `"100%"` never renders here — 100% is state C.

Percent is **verses spoken / verses in chapter**, not words. Verses are the unit the user
sees in the top bar (§3.1) and the unit the results sheet counts (§4.2). One denominator
everywhere.

**C. Complete.**

```
34×34 circle, backgroundColor: metricColors[scheme].positive   // #23A55A / #2ECC71
<Check size={18} color={'#FFFFFF'} strokeWidth={2.5} />
```

`positive` (not `sessionColors.good`) because `constants/metrics.ts` is the app's declared
color vocabulary and `positive` is its one earned-green. `Check` verified.
Completed tiles also drop their meta to the past tense: `"Read 2× · 3 days ago"`.

**`BookRow` trailing slot** uses the same three states at book scale: not started → nothing
rendered (the meta line already says "50 chapters"); partial → the ring, **no inner label**
(the meta carries "12 of 50 chapters" — a percent inside a book ring is redundant and the
digits get cramped); complete → the green check.

### 1.6 Repeat counts and last-read

**Repeat chip.** Reuse `words-to-master.tsx`'s chip verbatim:

```
paddingVertical 2, paddingHorizontal 7, borderRadius 6, borderCurve continuous
backgroundColor '#F3F3F5' / 'rgba(255,255,255,0.08)'
label 12 fonts.semibold, color '#8A8A90' / '#9E9EA6'
text  `${reads}×`      // U+00D7, exactly as WordsToMaster renders `{item.count}×`
```

Rendered only when `reads >= 2`. On the chapter tile it sits bottom-left. On a `BookRow` it
appends to the meta line. A book whose every chapter has `reads >= 2` earns a `Repeat2`
glyph beside its title (verified: `repeat-2.d.ts`) — that's the "read it through twice" flex.

**Last read.** Three places, one source (`timeAgo`):

1. `ContinueCard` caption — implicit ("Continue reading" + position).
2. `BookRow` meta — `"… · 2 days ago"`.
3. Completed chapter tile meta — `"Read 2× · 3 days ago"`.

### 1.7 Search (Phase 3)

66 books and 1,189 chapters need a jump-to. A glass field under the segmented control:

```
height 44, borderRadius 22, glass tint (PassageRow THEME), paddingHorizontal 16, gap 10
<Search size={18} color={secondary} strokeWidth={1.8} />
placeholder "Book, chapter, or verse"  15 fonts.regular
```

Tapping pushes `bible/search.tsx`. Parse `"gen 1"`, `"john 3:16"`, `"psalm 119"` against the
book-name + abbreviation map Lane A builds. Full-text verse search is Phase 5 (needs an
FTS5 table; the DB ships with **no indexes at all** beyond the PK autoindexes, per the brief).

---

## 2. Home screen changes — additive only

### 2.1 The CTA rename

`components/daily-goal-card.tsx:133` — `"Start Practicing"` → **`"Start Speaking"`**.

Nice consequence: `components/practice/freestyle-card.tsx:63` already says "Start Speaking".
The rename makes the app internally consistent rather than introducing a new phrase.

`app/(tabs)/index.tsx:54` — `startPractice` becomes `startSpeaking`, and routes to the
**resume target**:

```ts
const startSpeaking = () => {
  const pos = getReadingPosition();               // Lane A
  router.push(pos ? `/session/bible/${pos.chapterId}` : '/bible');
};
```

`onStartPractice` prop name on `DailyGoalCard` stays — renaming a prop is churn for nothing,
and `DailyGoalCard` has exactly one call site (`app/(tabs)/index.tsx:100`, verified by grep).
`app/passage-editor.tsx:31` carries a comment referencing "DailyGoalCard's Start Practicing
CTA" — update the comment text, no behavior change.

### 2.2 Settings — where it lives

**Decision: `app/settings.tsx`, registered on the root `Stack` as a modal, opened from the
avatar capsule in `HeaderActions`.**

Reasoning: `components/header-actions.tsx:23-25` already renders a `CircleUser` in an
`isInteractive` `GlassView` **with no `onPress`** — it is a button that does nothing today,
on Home, Practice and Analytics alike. Wiring it costs one prop and gives Settings a
persistent, discoverable, zero-new-chrome entry point. Runner-up rejected: a fourth… fifth
tab, which would push the glass pill past what it can lay out and buries a settings screen
in the app's primary navigation.

Registration mirrors `passage-editor` in `app/_layout.tsx:100-119` exactly — modal
presentation, `headerTransparent`, `headerShadowVisible: false`, `headerBlurEffect: 'none'`,
and the shared `ProgressiveBlur` as `headerBackground`.

`header-actions.tsx` change (additive):

```tsx
export function HeaderActions({ streak, onPressAvatar }: { streak: number; onPressAvatar?: () => void })
// avatar GlassView wrapped in <Pressable onPress={onPressAvatar ?? (() => router.push('/settings'))}>
```

**Settings contents** — `SectionHeader` + rows in the `RecordsCard` idiom (row height 40pt
icon tile, 16 semibold title, 13 regular caption, trailing value):

1. **Daily goal** — the reason this screen exists.
   - `<SegmentedControl segments={['Minutes','Chapters']} />`. A Bible reader thinks in
     chapters; a speech-coach user thinks in minutes. Supporting both is one extra field
     and one existing component.
   - Stepper card: value `AnimatedRoundedNumber` 38pt `fonts.bold` (DailyGoalCard's hero
     size) flanked by two 44pt circle buttons, `backgroundColor: sessionColors.circleButton`
     (`#EDEDF0` / `#2A2A2F`), glyphs `Minus` / `Plus` at 22pt strokeWidth 1.8.
   - Minutes: 5–120, step 5, default **20**. Chapters: 1–20, step 1, default **1**.
   - Data: `lib/stats.ts` keeps `DAILY_GOAL_MINUTES = 20` as the default and gains an
     optional parameter — `todayProgress(records, now, goalMinutes = DAILY_GOAL_MINUTES)`
     and likewise `weeklyHistory`. The module stays pure (no new imports), which
     `scripts/test-stats.ts` requires. The stored value lives in the `meta/` namespace
     (Lane A owns the key).
2. **Translation** — rows with a trailing `Check` on the active one, `Lock` on paywalled
   ones (both verified). KJV only in Phase 1–5. Caption on the KJV row carries the GPL note.
3. **Reading** — default teleprompter size (a 3-segment control matching
   `TELEPROMPTER_TEXT_SIZES = [28, 34, 40]`), **Auto-continue to next chapter** (toggle,
   default on — see §3.3), Keep screen awake (toggle, default on).
4. **Reminders** — time + toggle. Phase 6, Lane C.
5. **Account** — Sign in with Apple, Restore purchases. Phase 6, Lane C.
6. **About** — version, translation licenses, acknowledgements.

### 2.3 What replaces "For you"

**Decision: keep `PassageCarousel` unchanged and re-point it.** Home's carousel becomes
**"Up next"**, subtitle `"Where you left off, and what's next"`, items sourced from the
Bible instead of `PASSAGES`. `PassageItem` is `{ id, title, duration, artwork }` — a chapter
fits that shape with zero component change, and `onStart` already takes the item.

Four items, in order:

1. **Continue** — the in-progress chapter. Title `"Genesis 1"`, duration `"~3 min left"`.
2. **Next** — the chapter after your furthest point. `"Genesis 2"`, `"~4 min"`.
3. **A short one** — the shortest unread chapter in the current book (or in Psalms if the
   book is done). `"Psalm 117"`, `"~15 sec"`. This exists because 68 chapters are under a
   minute and a one-tap win on a bad day is worth more than a nag notification.
4. **A hunt** — the unread chapter in the current book with the most undiscovered Singular
   lexicon entries. Title `"Numbers 13"`, duration `"4 rare finds"` — the duration slot
   carries a non-duration string, which is fine: it's typed `string` and labelled
   "Display string" in `types/session.ts`.

Practice's own "For you" carousel is untouched. Nothing is deleted.

### 2.4 "Recently spoken"

New section, `order={5}`, between "Up next" and "Your progress".

```
title    "Recently spoken"
subtitle "The last chapters you read aloud"
body     3 × ChapterHistoryRow  (BookRow metrics: thumb 56/18, radius 26, marginTop 12)
         title 17 semibold  "Genesis 1"
         meta  13 regular   "2 days ago · 4 min · 100%"
         trailing 34pt state slot (§1.5)
footer   "See all" — 15 fonts.semibold, color sessionColors.accent, marginTop 12, alignSelf flex-end
empty    <EmptyStateCard icon={BookOpen} title="Nothing spoken yet"
                         subtitle="Read a chapter aloud and it'll show up here." />
```

Capped at 3 and it is a *log*, not a leaderboard — no scores, no deltas. "Recently read" and
"recently spoken" are the same thing in this app (you only get credit by speaking), so one
section, and its name says which.

### 2.5 `[OPEN]` "Your progress" — whole Bible or current book?

**Decision: whole Bible, with the current book as a sub-line.**

Whole-Bible progress is the only number that stays meaningful for the years this takes, and
it *is* the product promise. Current-book progress resets to 0% the moment you finish a
book — a demoralizing regression delivered at the exact instant of the biggest win. It still
appears, as a secondary line and on the Bible tab where it's actionable. **Runner-up
rejected:** current-book-only.

New `components/bible/scripture-progress-card.tsx`, sitting **above** the existing
`ProgressCard` under the same "Your progress" header. Geometry copied from
`progress-card.tsx:141-179`:

```
hero:     padding 20, borderRadius 30, overflow hidden, gap 14, glass tint = metricColors.glassTint
eyebrow:  12 fonts.bold, letterSpacing 1, metricColors.label     "BIBLE PROGRESS"
row:      value 40 fonts.heavy ls -0.5 (AnimatedRoundedNumber)   "104"
          unit  18 fonts.semibold metricColors.unit              "/1,189 chapters"
          badge right: paddingV 5 / paddingH 12, radius 50,
                bg '#1C1C21' / '#F2F2F5', label 12 fonts.bold ls 0.5   "8.7%"
meter:    <TickBar fill={104/1189} tickCount={35} height={20} />   ← ProgressCard's TICK_COUNT
metaRow:  left  13 fonts.medium metricColors.label   "OT 11% · NT 0%"
          right <DeltaLabel delta={+3} suffix="this week" />
```

Then the three-stat momentum row, `progress-card.tsx`'s `Stat` component and styles verbatim
(21 bold value / 13 medium unit / 12 medium label, 1×34 dividers):

| value | unit | label |
|---|---|---|
| chapters read | — | `chapters` |
| verses spoken | — | `verses` |
| hours aloud | `h` | `spoken` |

The existing `ProgressCard` stays directly beneath it, unchanged, still carrying the speaking
score. Two cards, two questions: *how much scripture* and *how well you speak*.

### 2.6 `[OPEN]` What fills "Words to master"

**Decision: the Lexicon takes the slot. `WordsToMaster` survives, demoted and retitled
"Hard to say", and only renders when there is real data.**

Reasoning: the per-word aggregates in the `w/` namespace are genuine, hard-won signal, and
KJV proper nouns are the hardest pronunciation targets in the corpus — deleting that section
throws away the one thing the engine knows that no other Bible app does. But it is a
*coaching* surface, not a *game* surface, and the owner asked for a game. So the Lexicon card
(§5.3) takes the prominent slot at `order={7}`, and "Hard to say" moves to `order={9}`,
gated on `toMaster.length > 0` exactly as today (`index.tsx:135`).

Section copy: title `"Hard to say"`, subtitle `"Names and words that keep tripping you"`.
The two systems cross-reference: a `WordsToMaster` row whose word is also a lexicon entry
gets the rarity dot beside it, and the Lexicon tile for a repeatedly-missed word gets a
`"tricky"` chip in `metricColors.focus` / `focusBg` (`#A96400` on `#FDEFDC`, `#F0B458` on
`rgba(240,180,88,0.16)`).

### 2.7 Final Home order

| order | section |
|---|---|
| 0 | header + `HeaderActions` (now opens Settings) |
| 1 | `WeeklyProgress` |
| 2 | `DailyGoalCard` — **"Start Speaking"** |
| 3–4 | **"Up next"** carousel |
| 5 | **"Recently spoken"** |
| 6 | "Your progress" header |
| 7 | **`ScriptureProgressCard`** + existing `ProgressCard` |
| 8 | **"The Lexicon"** card |
| 9 | "Hard to say" (`WordsToMaster`, conditional) |

Nothing was removed. Three sections were added and one section was renamed.

---

## 3. The live reading screen

New route `app/session/bible/[chapterId].tsx`, a sibling of `[passageId].tsx` inside the
existing `app/session/` stack — so `SessionContext`, the results push, the crash checkpoint,
and every terminal-path guarantee documented in `[passageId].tsx:118-222` are inherited
rather than reimplemented. **`hooks/use-practice-session` and everything under
`services/` for recognition are untouched.** A chapter is fed in as a `Passage`-shaped object
(the same trick `constants/drills.ts` documents), with `targetWpm: 130`.

### 3.1 Top bar — the current verse reference

Replaces `<LiveWpm />` in `SessionTopBar`'s `children` slot. New:
`components/session/verse-reference.tsx`. Geometry matches `live-wpm.tsx` exactly so the bar
does not shift when a Bible session opens instead of a practice session:

```
wrap:    alignItems center, gap 1
refBox:  height 25, justifyContent center, flexDirection row, alignItems flex-end
caption: 13 fonts.medium, '#77777E' / '#9E9EA6'
```

**Line 1 — the reference.** `"Genesis 1:14"`, 20pt `fonts.semibold`, color
`sessionColors[scheme].accent` (`#3478F6` / `#4C8DFF`) — the same treatment `LiveWpm` gives
the WPM figure, so the eye lands in the same place with the same weight.

Built as **two nodes**, not one string:

```tsx
<View style={styles.refBox}>
  <View style={styles.staticBox}>
    <Text style={styles.ref}>{`${bookName} ${chapter}:`}</Text>
  </View>
  <View style={styles.numBox}>
    <AnimatedRoundedNumber text={`${verse}`} value={verse}
      color={accent} fontSize={20} fontFamily={fonts.semibold}
      weight="semibold" duration={0.35} />
  </View>
</View>
```

That gets the verse **digits rolling** through the same SwiftUI `numericText` transition
`LiveWpm` and `ScoreGauge` already use — the "sing" comes free from a component that ships.
Both children sit in **fixed-height 25pt boxes**: `live-wpm.tsx:26` and
`score-gauge.tsx:79-84` both document that SwiftUI Hosts don't self-size in flex rows and
that `alignItems: 'baseline'` can't reach text inside one.

**Line 2 — caption.** `"KJV · verse 14 of 31"`. Translation code leads so multi-translation
later costs nothing.

**Verse-advance transition.** On every verse change, the whole reference block plays a 260ms
beat: `translateY` 6 → 0 and `opacity` 0.35 → 1, `withTiming(Easing.out(Easing.cubic))`.
Opacity is safe here — `SessionTopBar`'s `styles.center` is a plain `View`, not a
`GlassView` (verified, `session-top-bar.tsx:68`), so the glass-under-animated-opacity
prohibition does not apply. The two circle buttons beside it *are* glass and are not animated.

**Chapter-crossing beat.** When book or chapter changes (auto-advance, §3.3), the block also
springs `scale` 0.94 → 1 with `{ damping: 32, stiffness: 420, mass: 0.9 }` — the `SPRING`
constant from `segmented-control.tsx:22`, reused rather than re-tuned — plus
`Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)`.

**Chapter progress hairline.** The timer is going away (§3.2) and it carried one real piece
of information: *how far in am I*. Replace it honestly with a 2pt line just under the top bar:

```
position absolute, top insets.top + 6 + 44 + 10, left 20, right 20, height 2, borderRadius 1
track  sessionColors[scheme].accent at 0.12 alpha
fill   Animated.View, width via useAnimatedStyle on a shared value,
       = currentWordIndex / totalWords, color accent
```

Non-intrusive, always answerable at a glance, no digits.

**Contract with Lane A.** I need, per chapter:

```ts
type ChapterVerses = {
  verseStarts: number[];   // word index at which each verse begins, ascending
  verseNumbers: number[];  // the printed verse number at each position (1-based, may skip)
  verseCount: number;
};
```

Lookup is a **forward-only cursor**, not a binary search — `currentWordIndex` is documented
as a monotonic frontier (`types/session.ts`), so the screen holds `useRef(cursor)` and
advances while `wordIndex >= verseStarts[cursor + 1]`. O(1) amortized, zero allocation per
frame, and it cannot regress the reference if recognition jitters backwards.

### 3.2 Killing the timer — the speech ribbon

New: `components/session/speech-ribbon.tsx`. `live-waveform.tsx` stays untouched (Practice
and Freestyle keep using it — additive rule).

**Layout.** Occupies the row `LiveWaveform` occupies inside `PracticeControls`' card
(card `padding: 16`, so interior width = card width − 32). Height **44**. No text anywhere
in it. 48 bars, `width: 3`, `borderRadius: 1.5`, laid out `justifyContent: 'space-evenly'`
in a flex row (the `live-waveform.tsx` `group` technique, one group instead of two since the
clock no longer splits it).

**Four layered behaviors, all on the UI runtime:**

1. **Scroll.** A `useSharedValue<number[]>` ring buffer of 48, advanced every **55ms**
   (vs `LiveWaveform`'s 90ms — faster reads as *flowing*, slower reads as *ticking*), driven
   by the exact `useFrameCallback` + accumulator worklet in `live-waveform.tsx:55-68`. New
   sample = `meterLevel.value`. New array assignment, not mutation, so dependent styles re-run.

2. **Contour.** Bar height = `MIN + s * (MAX - MIN)` with `MIN 4`, `MAX 40`, where `s` is a
   3-tap moving average of `buffer[i-1..i+1]`. That single change turns a picket fence into a
   drawn line — it is the difference between "meter" and "the app is drawing what I say".
   Animated with `withTiming(…, { duration: 55, easing: Easing.out(Easing.quad) })`.

3. **Envelope.** Every bar is multiplied by a fixed window
   `w(i) = 0.35 + 0.65 * Math.sin(Math.PI * i / 47)`, so the band tapers to hairlines at both
   ends. This is what makes it "maneuver elegantly" rather than start and stop abruptly, and
   it hides the ring-buffer seam at the left edge for free. Precomputed once at module scope.

4. **Ink.** Bar color = `interpolateColor(level, [0, 1], [waveformBar, accent])` —
   `#C7C7CC → #3478F6` light, `#4A4A52 → #4C8DFF` dark. Loud syllables ink blue and fade back
   to gray as they scroll. `interpolateColor` is already in use in `teleprompter.tsx:54` and
   `tick-gauge.tsx:53`, so this is proven, not novel.

**The word-landed pulse — the important part.** A raw mic meter shows that a *microphone* is
working. The owner wants to see that *input is being said*. So the ribbon also reacts to
recognition, not just amplitude: the screen passes `currentWordIndex` down, and on every
change a shared `pulse` runs
`withSequence(withTiming(1, { duration: 90 }), withTiming(0, { duration: 220 }))`. The
center bar (and its two neighbors, at 60% and 30%) add `pulse * 6` to their height. The
ribbon visibly ticks once per recognized word. That is a truthful, legible, continuous
signal that the app is hearing you — and it costs one shared value.

**Idle state.** When `meterLevel` has stayed under `0.04` for 700ms, every bar collapses to
height 4 and a `breath` shared value runs
`withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) }), -1, true)`,
scaling the middle third from 4 → 7. Silence looks asleep, not dead. Speech snaps it back
with `withSpring`. Gate the repeat behind `ReduceMotion.System`, as `intro-reveal.tsx:47`
does.

**Elapsed time is still recorded** — `elapsedMs` still goes on the `SessionRecord` and still
feeds minutes, streaks and the daily goal. Only its *display* during reading goes away.

### 3.3 The control pill

Same card, same three slots, same sizes (`CIRCLE = 56`, pill `flex: 1` height 56, card
`padding 16` `borderRadius 40`, row `gap 12` `marginTop 14`). Only semantics change, and the
new "Continue to next chapter" affordance **replaces** the center pill in the one state where
pausing is meaningless — which is how it fits without the control growing.

| slot | today | Bible session | icon |
|---|---|---|---|
| left circle 56 | Restart | **Restart chapter** | `RotateCcw` (unchanged) |
| center pill | Pause / Resume | **contextual** (below) | varies |
| right circle 56 | Stop | **Finish here** | `Check`, 22pt, strokeWidth 2.5 |

`Square` → `Check` on the right: in a Bible session, ending early still means "I read this
much and it counts", and every terminal path already banks a record. A stop square reads as
discarding.

**Center pill state machine** — one line, 17pt `fonts.semibold`, `numberOfLines={1}`:

| `status` | label | glyph | fill |
|---|---|---|---|
| `listening` | `Pause` | `Pause` filled | `pillDark` (`#141418` / `#F2F2F5`) |
| `paused` | `Resume` | `Play` filled | `pillDark` |
| `processing` | `Saving…` | `ActivityIndicator` | `pillDark` |
| **`done`** | **`Continue to Genesis 2`** | `ArrowRight` 20pt strokeWidth 2.2 | **`sessionColors.accent`** |
| `error` | existing two-pill error layout, unchanged | | |

`Pause`/`Resume` stay: pausing mid-chapter is a real need (a door, a child), and neither verb
is scripture-hostile the way "stop" is. The verbs that were wrong were *stop* and *restart-
as-failure*, and both are addressed.

**Label overflow.** `"Continue to II Chronicles 21"` will not fit a ~200pt pill at 17pt. Rule:
measure against the pill width; if it doesn't fit, fall back to the **abbreviation** from
Lane A's book map (`"Continue to 2 Chr 21"`); if that still doesn't fit, `"Continue"` with the
next reference moved into a 13pt caption line above the row. The caption line is only ever
rendered in the `done` state, so the card's resting height is unchanged.

**Auto-advance.** In the `done` state the pill also draws a **3-second hairline** across its
own bottom inner edge (height 2, inset 20 each side, `pillDarkText` at 0.35 alpha, width
animated 0 → 100% over 3000ms). If untouched, it fires `Continue`. Any touch anywhere on the
card cancels it. Governed by Settings → Reading → *Auto-continue to next chapter* (default
on). This is what makes reading a book feel continuous rather than transactional.

### 3.4 `[OPEN]` When does a chapter count as complete?

**Decision: automatically, on the recognizer reaching the end — never on manual stop.**

`usePracticeSession` already flips to `status === 'done'` at end of passage, and
`app/session/[passageId].tsx:140-142` already auto-calls `finishSession('completed')` on it.
The machinery is built, proven, and the owner said completion must be *earned*, which rules
out a manual "mark complete" button (**runner-up rejected**, and the owner rejected it first).

Manual stop banks a **partial** read at `currentWordIndex / totalWords` — and that partial is
exactly the percent ring the owner asked for in §1.5. If manual stop could claim 100%, the
ring would be decorative.

**Exact rule**, to survive the real failure mode (recognition stalling on the last word or
two of a chapter):

```
complete  ⟺  spokenWords / totalWords >= 0.98  AND  the final verse was entered
partial   ⟺  otherwise (percent = spokenWords / totalWords, rounded down)
```

`spokenWords` is already on `SessionResult` (`types/session.ts`) and already carries the
"words the recognizer actually heard" semantics the eligibility gate depends on. A partial
that later gets re-read to completion **overwrites** the percent and increments `reads` —
the ring never goes backwards.

---

## 4. Session complete

### 4.1 `[OPEN]` Every chapter, or only a whole book?

**Decision: both, at two very different weights.**

- **Every chapter → a bottom sheet, ~360pt, not a screen.**
- **Every book → the full `results.tsx`-class ceremony, on its own route.**

The measured distribution forces this. The median chapter is 627 words ≈ 4:48, but 68
chapters round to a minute or less and Psalm 117 is 15 seconds. A full-screen results
ceremony after a 15-second Psalm is precisely the "added junk" the owner fears — and it also
breaks the flow of someone reading three chapters in a sitting, which is the behavior the
whole app is trying to produce. Finishing Genesis, by contrast, is 50 chapters and roughly
four hours of speaking; that deserves everything `results.tsx` does and more.

The owner loves the moment. The resolution is to keep the moment and shrink its *cost*, not
its quality.

### 4.2 Per-chapter: the "Chapter banked" sheet

A sheet over the dimmed teleprompter (`presentation: 'formSheet'` or a Reanimated sheet —
`UNVERIFIED:` which of the two behaves better under `fullScreenModal` parenting in Expo SDK
57; verify against https://docs.expo.dev/versions/v57.0.0/ before building). Content, top to
bottom:

1. **Reference + the one number that matters.**
   `"Genesis 1"` 22pt `fonts.bold` ls -0.3, centered. Under it a `TickGauge`
   (`components/session/tick-gauge.tsx`, already parametric) at reduced scale:
   `tickCount 16, startAngle 135, sweep 270, outerRadius 78, tickLength 20, tickWidth 7`,
   `fill` = foreground, `track` = `rgba(17,17,20,0.22)` / `rgba(255,255,255,0.22)`
   (`score-gauge.tsx`'s `TRACK`). In its hollow:
   `AnimatedRoundedNumber` 40pt `fonts.heavy` `"31"` + `"/31 verses"` 15pt semibold in
   `metricColors.unit`, plus the band word — **not a score band**, but the state word:
   `"Complete"` / `"14% read"`.
   **The unit of achievement is scripture spoken, not performance.** That single substitution
   is what makes this screen right for a Bible reader instead of wrong.

2. **`PlaybackPill`**, unchanged, `marginTop 10`. Hearing yourself read Genesis 1 back is
   genuinely lovely and it is already built.

3. **Three `CounterCard`s in one `GlassContainer`** (verbatim component, the
   `analytics.tsx:199-235` pattern, `gap: 10`):

   | icon | label | value | unit |
   |---|---|---|---|
   | `Clock` | Time aloud | 5 | `min` |
   | `BookOpen` | Chapters | 104 | `read` |
   | `Flame` | Day streak | n | `days` |

   "Chapters" is the **running whole-Bible total**, not this session's 1. The number that
   keeps growing is the one worth showing.

4. **The Lexicon strip** — new discoveries this chapter, 0–5 chips in a horizontal row
   (chip spec §5.4). **If empty, the row is not rendered at all.** No "0 discovered" filler.
   This is the hook that makes someone tap "Next chapter".

5. **Footer** — `ResultsFooter`'s exact geometry (two pills, height 60, radius 30, `gap 12`,
   `paddingHorizontal 20`, over a `ProgressiveBlur`) with the roles **reversed**:
   - left, glass: `Done` + `Check`
   - right, tinted `pillDark`: **`Next chapter`** + `ArrowRight`

   In an app whose thesis is "read the whole Bible", the forward action is the inked one.

**Explicitly absent, and why:** no speaking score, no `SkillCard`, no fillers, no pacing, no
articulation, no `AiCoachingCard`, no `WordBreakdown`. Those measure *performance*; someone
reading scripture aloud is not performing, and the owner said the coach isn't even wired up.
All of it stays exactly where it is on the Practice results screen.

**One exception, opt-in:** if ≥ 3 words came back `mispronounced`, a single quiet row at the
bottom — `"3 words to revisit"` 15pt semibold + `ChevronRight` — that pushes the existing
`WordBreakdown`. One line, no judgment, zero noise for the 90% of chapters that don't need it.
This is how the engine's real value survives without becoming the point.

### 4.3 Per-book: `app/session/book-complete.tsx`

Full screen, chrome identical to `results.tsx` (`SessionTopBar` + `ResultsFooter`,
`paddingTop: insets.top + 62`, `paddingBottom: insets.bottom + 150`, `paddingHorizontal: 20`),
same `Haptics.notificationAsync(Success)` on mount, same fade-in staging.

1. **Hero gauge** — `ScoreGauge`'s exact geometry (`tickCount 20, startAngle 135, sweep 270,
   outerRadius 120, tickLength 30, tickWidth 9`, 350ms delay, 1100ms cubic fill). Hollow holds
   `"50"` 56pt heavy + `"/50"` 20pt, band word = **the book name**, `"GENESIS"`.
2. **The badge you just earned** (§5.5) as a hero tile, 120×120, the division gradient with
   the book name — this is the "Territory" collection's 1/66.
3. **`RecordsCard`, book edition** — reused verbatim, rows:
   `Clock` "Time in this book" · `Flame` "Most chapters in a day" · `Calendar` "Days from
   first to last" · `Gem` "Rarest find" (caption = the word and where).
4. **Lexicon haul** — every entry found while reading this book, as a chip wrap.
5. **Footer**: `Done` (glass) / **`Start Exodus`** (tinted) + `ArrowRight`.

---

## 5. Gamification — the Lexicon, and badges that aren't a streak nag

The design rule I'd hold to throughout: **every reward is earned by scripture spoken, never
by consecutive days.** Exactly one streak badge exists so the streak still means something,
and that's the whole streak ladder. The owner rejected the daily-verse nag; the antidote is a
collection with a real, enormous, *finite* denominator.

### 5.1 What is collectible

Four suits — four reads as a set, and each has a different feel:

| suit | what | icon (verified) | rough size |
|---|---|---|---|
| **Names** | people — Melchizedek, Jael, Onesimus | `UsersRound` | ~1,200 curated |
| **Places** | cities, rivers, regions, mountains | `MapPinned` | ~700 curated |
| **Words** | archaic KJV vocabulary — *besom, holpen, wot, firmament, selvedge* | `Feather` | ~800 curated |
| **Relics** | objects and creatures with weight — ark, ephod, urim, leviathan, manna, mammon | `Gem` | ~200 curated |

≈ **2,900 entries**. Big enough to be a lifetime, small enough to be a set.

### 5.2 Rarity — grounded in the actual corpus

Frequency comes from a query over `KJV_verses`, not from taste:

| tier | rule | color | source |
|---|---|---|---|
| Common | ≥ 100 occurrences | `metricColors.unit` — `#9A9AA0` / `#7C7C84` | existing |
| Uncommon | 20–99 | `sessionColors.accent` — `#3478F6` / `#4C8DFF` | existing |
| Rare | 3–19 | `#7B5CF0` | **one new hex** — a violet between the accent blue and the warn orange |
| **Singular** | **exactly 1 occurrence in the whole Bible** | `sessionColors.warn` — `#FF9F0A` | existing (gold reads as treasure) |

I measured **1,649 tokens that appear exactly once** in the entire KJV. That is the pitch, and
it is a fact, not a hook: *there are 1,649 words in the Bible that appear exactly once, and the
only way to find them is to read it out loud.* Put that sentence on the Lexicon screen's empty
state.

### 5.3 Extraction — how the entries get built

Feasible, and I checked the failure mode. Naive "capitalized token" extraction yields **3,804**
distinct tokens, but the top of that list is `Lord, I, God, Israel, David, Jesus, O, Moses,
Jerusalem, Judah, Egypt, Christ, … The, Behold, What, Son, Father` — i.e. it drags in pronouns,
interjections, sentence-start artifacts, and divine titles. So:

**Build pipeline (offline script, output committed as JSON — this is not runtime work):**

1. `SELECT text FROM <T>_verses` — tokenize on `[A-Za-z][A-Za-z'-]*`.
2. Take tokens capitalized in **non-sentence-initial** position (split on `[.!?:;]\s+` and skip
   index 0 of each fragment). → 3,804 candidates.
3. Subtract a hand-written stoplist: `I, O, The, And, But, Behold, Lord, God, LORD, Father, Son,
   Spirit, Christ, Jesus, Amen, Selah, Verily, Thus, Now, Then, For, Yea, Woe, Hallelujah, …`
   (~120 entries; divine names get their own non-collectible treatment — they are not trading
   cards).
4. Classify the remainder into **Names** vs **Places** vs **Relics** with a curated seed list.
   `UNVERIFIED:` a public-domain KJV proper-noun gazetteer (Easton's / Smith's Bible Dictionary,
   both public domain) would do most of this mechanically — verify licensing before shipping,
   and note the KJV DB itself is GPL per its `translations` row.
5. **Words** suit: the 958 `-eth`/`-est` forms plus a curated archaic list, filtered against a
   modern-English wordlist so `priest`, `rest`, `lest`, `beth` (all false positives my probe
   surfaced) don't ship.
6. Emit `lexicon.json`: `{ id, word, suit, rarity, occurrences, firstRef, gloss }` plus, per
   chapter, `hits: { wordIndex, entryId }[]` precomputed against the same tokenizer the
   teleprompter uses (`lib/passage-text.ts` — **must be the same tokenizer**, or the indices
   won't line up with `currentWordIndex`).

Step 6's per-chapter hit list is what makes runtime discovery O(1): no scanning during a
session, just a cursor over a small sorted array.

### 5.4 Discovery — the mechanic

**A token is discovered when the recognition frontier crosses it and its verdict is not
`omitted`.** You have to say the word out loud. Not tap it, not scroll past it, not "complete
the chapter" — *say it*. That single rule is why this app's engine is the reason the game
works, and no other Bible app can copy it.

A `mispronounced` verdict still counts. Nobody is losing Mahershalalhashbaz on a technicality.

**In-session reveal — a chip, not a modal.** It must never cover the text being read.

```
component  components/session/discovery-chip.tsx
position   absolute, top = insets.top + 6 + 44 + 12, alignSelf center
size       height 34, borderRadius 17, paddingHorizontal 14, gap 7
material   GlassView glassEffectStyle="regular" isInteractive={false}
content    <SuitIcon size={15} color={rarityColor} strokeWidth={2} />
           <Text 14 fonts.semibold, foreground>{word}</Text>
enter      translateY 12 → 0, scale 0.92 → 1, 220ms Easing.out(cubic)   ← TRANSFORM ONLY
exit       translateY 0 → -14 after 2200ms; it slides up behind SessionTopBar's
           ProgressiveBlur, which supplies the fade for free
haptic     Common/Uncommon → impactAsync(Light);  Rare/Singular → notificationAsync(Success)
queue      max 1 on screen; drains at 1 per 2.4s so a genealogy verse doesn't strobe
```

**No animated opacity** — the chip contains a `GlassView`, and the codebase's own rule
(`intro-reveal.tsx:30-33`) is that iOS glass renders empty under an ancestor with animated
opacity. Sliding it behind the existing top blur is both compliant and better-looking.

### 5.5 Where it lives

**1. Home — "The Lexicon" card** (`components/bible/lexicon-card.tsx`). Metrics from
`words-to-master.tsx`: `borderRadius 30, borderCurve continuous, overflow hidden,
paddingVertical 6`, glass tint `rgba(255,255,255,0.45)` / `rgba(10,10,12,0.55)`.

```
header  paddingLeft 18 / paddingRight 12 / paddingTop 12 / paddingBottom 10
        left   "1,204 of 2,900 found"   15 fonts.semibold, secondary
        right  dark pill: paddingV 8 / paddingH 14, radius 50, bg badgeBg
               <Gem size={13} …/> + "Open"  14 fonts.semibold
suits   4 rows, hairline dividers (StyleSheet.hairlineWidth, marginLeft 18)
        row: paddingLeft 18 / paddingRight 12 / paddingVertical 10
             36pt icon tile (metricColors.iconTile bg) + suit icon 18pt
             name 16 fonts.semibold ls -0.2
             caption 13 fonts.regular secondary  "412 / 1,203"
             trailing <TickBar fill={412/1203} tickCount={14} height={8} tickWidth={3} />
latest  horizontal chip row of the 3 most recent finds, paddingHorizontal 18, paddingBottom 12
```

The card always shows something new, which is the entire reason it earns the prime slot.

**2. `app/lexicon/index.tsx` — the collection.** Pushed from the card and from Analytics.

```
header    "The Lexicon" 34 fonts.bold ls -0.5 + HeaderActions
control   <SegmentedControl segments={['Names','Places','Words','Relics']} />   ← 4 segments
grid      3 columns, aspectRatio 1, gap 10, borderRadius 20
found     glass tile; word 15 fonts.semibold centered; 6pt rarity dot top-right
missing   <AnimatedDashedBorder borderRadius={20} strokeColor={dashed} strokeWidth={1.5}
            dashLength={5} gapLength={5}>  ← the component AddPassageRow already uses
          content: the word REDACTED TO ITS SHAPE — first letter, then '·' per remaining
          letter:  M······h        (13 fonts.semibold, secondary)
```

The redaction is the design decision I'd defend hardest. A padlock says "you don't have this".
A silhouette says "*there is something specific here and you can almost see it*" — and it
teaches word length, which is exactly the tell that makes you notice the word when you finally
read it. Runner-up rejected: `Lock` glyphs, which is what every other collection app does.

`UNVERIFIED:` `SegmentedControl` with 4 segments at 15pt semibold — "Places" and "Relics" are
short, but check the 375pt case; if it's tight, drop to 13pt for the 4-segment variant via a
new optional `labelSize` prop.

**3. Entry sheet.** Word 34pt `fonts.bold`; rarity chip; suit name; `"Found in Genesis 10:8 ·
3 Aug"`; the verse text at 17pt `fonts.regular` with the word inked `sessionColors.accent`;
a 36pt speaker button (`words-to-master.tsx`'s exact `speaker` style, `Volume2` 19pt filled);
`"Appears 1× in the whole Bible"`; and a `Play` pill — **"Read a chapter it's in"** — which is
how a collection screen turns back into reading.

**4. Analytics.** One more `CounterCard` in the existing 2×2 grid:
`{ icon: Gem, label: 'Lexicon', value: found, unit: 'found' }`.

### 5.6 Badges

`app/badges/index.tsx`. Four families:

- **Territory** — one per book, 66 total. `"Genesis, spoken."` Art = the division gradient
  (§1.2) as a 1:1 tile, using `passage-row.tsx`'s `ArtworkThumb` gradient technique scaled up.
  The book-scale mirror of the Lexicon.
- **Distance** — real denominators from the real 1,189: `First Words` (1 chapter) → 10 → 50 →
  100 → 250 → 500 → **`The Whole Thing`** (1,189).
- **Feats** — the personality:
  - `Longhand` — finish Psalm 119 (2,423 words, ~19 min) in one sitting.
  - `Featherweight` — Psalm 117 (33 words). The joke badge. Everyone gets it. That's the point.
  - `Genealogist` — a full begat chapter (1 Chronicles 1–9) without pausing.
  - `Dawn Patrol` / `Vigil` — a chapter before 6am / after midnight.
  - `Round Trip` — the same chapter three times.
  - `Cover to Cover` — every chapter of one book, in order, no skips.
- **Streak** — exactly one: `Faithful`, 30 days. No 3/7/14/60/100 ladder. The streak still
  exists (it's in `HeaderActions` on every screen); it is simply not the game.

Display: 3-column grid, 1:1 tiles, radius 20. Earned = gradient tile + name 13pt semibold
beneath. Unearned = `AnimatedDashedBorder` tile, suit icon at low opacity, **criterion always
visible as the caption**. Never a mystery badge — knowing what's next is motivation; hiding it
is a nag.

### 5.7 Notification tone (hand-off note to Lane C)

The nudge is a **find**, not a verse: *"Numbers 13 has 4 words that appear nowhere else in the
Bible."* / *"You're 3 chapters from finishing Genesis."* Never *"Here's your daily verse."*
The owner named that pattern as the thing to avoid.

---

## 6. Drills and Freestyle — their actual role

**Decision: keep both exactly where they are, and give each one scripture-specific job. No
relocation, no rebrand of the existing surfaces.**

**Drills → add a fifth drill, `Hard Names`.** `constants/drills.ts`'s header comment says it
outright: drills are `Passage`-shaped so the entire session flow works on them unchanged, and
only the `drill-` id prefix marks the record's mode. So:

```ts
{ id: 'drill-hard-names', title: 'Hard Names', duration: '~1 min',
  category: 'drill', skills: ['accuracy'], targetWpm: 90, artwork: <minor-prophets pair>,
  text: /* generated */ }
```

The text is **generated from the user's own `w/` aggregates** — the lexicon-entry words with
the worst hit rate, 8–12 of them, spaced as short lines the way `drill-minimal-pairs` is:
`"Mahershalalhashbaz. Nebuchadnezzar. Zerubbabel. Melchizedek."` This is the honest answer to
"what are drills for in a Bible app": biblical proper nouns are the single hardest
pronunciation target in the corpus, drills are the app's existing remediation loop, and the
data to build the drill already exists. `UNVERIFIED:` a generated drill means `DRILLS` can no
longer be a frozen module constant — it needs a `useHardNamesDrill()` hook that composes a
`Passage` at render time and registers it with `lib/passage-catalog.ts` so `getAnyPassage`
resolves it. Check `passage-catalog.ts`'s lookup before building.

**Freestyle → one new entry point, on the Bible side only.** After a chapter, the sheet's
overflow offers **"Say it back"** — a freestyle prompt generated from the reference:
`{ id: 'bible-recall-gen-1', title: 'Genesis 1', prompt: 'From memory, what happened in
Genesis 1?' }`. Same `FreestyleTopic` shape, same `app/session/freestyle.tsx`, same
transcript-based results. It is recall practice, which is what a person reading the Bible
actually wants and what freestyle is mechanically perfect for. **Practice's Freestyle card is
untouched.**

Nothing is deleted, nothing moves, and both now have a reason to exist in this app.

---

## 7. Analytics tab additions

All additive, all **below** the existing content, all in the existing vocabulary. I
deliberately did **not** add a Speaking/Scripture mode switch — a switch hides half the app
behind a tap, and the owner likes what's there.

Existing content (`SpeakingScoreCard`, `SkillCard`, the four effort `CounterCard`s,
`RecordsCard`) stays at orders 2–8, unchanged. Then:

**order 9–10 — `ScriptureProgressCard`.** The same component Home uses (§2.5). One card, two
screens, no chance of the two disagreeing — the discipline `progress-card.tsx`'s header
comment already establishes for the speaking score.

**order 11 — Scripture counters.** A second `GlassContainer` 2×2, exactly the
`analytics.tsx:199-235` structure:

| icon | label | value | unit | delta |
|---|---|---|---|---|
| `BookOpen` | Chapters read | n | `read` | ✓ |
| `AudioLines` | Verses spoken | n | `verses` | ✓ |
| `Gem` | Lexicon | n | `found` | ✓ |
| `Repeat` | Re-reads | n | `again` | — |

All four icons verified.

**order 12 — the Bible strip.** One horizontal row, 66 tiny book tiles, each filled from the
bottom in proportion to chapters read:

```
tile      width 4, height 36, borderRadius 2
track     metricColors.track   ('rgba(17,17,20,0.10)' / 'rgba(255,255,255,0.14)')
fill      metricColors.tick    ('#111114' / '#FFFFFF'), inner View, height = pct * 36
gap       2 between books, 12 between the OT block (39) and the NT block (27)
labels    "OLD" / "NEW" 11 fonts.bold letterSpacing 1, metricColors.label, marginTop 8
```

Total width ≈ 66×4 + 65×2 + 12 = 406pt, so it needs a horizontal `ScrollView` on a 375pt
screen, or 3pt tiles with 1.5pt gaps to fit at 335pt (screen − 40). Prefer **fitting**: this
should be one glance, not a scroll. It uses nothing new and it is the single most striking
scripture visualization available — the whole Bible, your progress through it, on one line.
Tapping a tile jumps to that book.

**order 13 — `RecordsCard`, scripture edition.** Reused verbatim:

| icon | title | caption | value |
|---|---|---|---|
| `Clock` | Longest single read | `Psalms 119 · 3 weeks ago` | 19 `min` |
| `Flame` | Most chapters in a day | `12 Mar` | 7 `chapters` |
| `Gem` | Rarest find | `"Mahershalalhashbaz" · Isaiah 8` | — (score-style tier chip) |
| `BookOpen` | Books finished | `Genesis, Exodus, Ruth` | 3 `books` |

---

## 8. Phasing

Phase numbers are Lane-B-local; the coordinator should interleave them with Lane A's data
phases (marked **[A]** where I hard-depend) and Lane C's backend phases.

### Phase B1 — Bible tab, read-only browse

**Depends on [A]:** book/chapter metadata, word counts, `bible-format` inputs.
**Files:** `app/(tabs)/_layout.tsx` (+1 `ITEMS` entry), `app/(tabs)/bible/_layout.tsx`,
`app/(tabs)/bible/index.tsx`, `app/(tabs)/bible/[bookId].tsx`,
`components/bible/{book-row,chapter-tile,chapter-state,continue-card}.tsx`,
`constants/bible-art.ts`, `lib/bible-format.ts`.
**Done when:** all 66 books render grouped by division under an OT/NT segmented control; every
book opens to a full chapter grid; every chapter tile shows a correct `~N min`/`~N sec`
estimate; every state renders as **not-started** (no progress data exists yet); the tab bar
lays out correctly at 4 items; `paddingBottom: 140` clears the bar on the longest book.
**Parallel:** everything here is independent of Phase B2/B3.

### Phase B2 — the reading session

**Depends on [A]:** `ChapterVerses` (`verseStarts`, `verseNumbers`, `verseCount`), chapter text
tokenized by `lib/passage-text.ts`, `SessionMode` gaining a Bible member.
**Files:** `app/session/bible/[chapterId].tsx`, `components/session/verse-reference.tsx`,
`components/session/speech-ribbon.tsx`, `components/session/bible-controls.tsx`.
**Done when:** the reference updates within one word of crossing a verse boundary and the digits
roll; the ribbon flows, inks on volume, pulses once per recognized word, and breathes when
silent; the control card is the same height it is today in every state; `done` shows
`Continue to <next>` and auto-advances after 3s unless touched; a manual stop banks a partial
and the tile shows the correct ring; the 0.98 completion rule holds on a chapter where the last
word is swallowed. **Speech recognition code is untouched — verify by diff.**
**Parallel:** B2 can be built against a stubbed `verseAt()` before [A] lands.

### Phase B3 — Home changes + Settings

**Depends on [A]:** reading position, per-chapter/per-book progress aggregates, `meta/` goal key.
**Files:** `app/(tabs)/index.tsx`, `components/daily-goal-card.tsx` (one string),
`components/header-actions.tsx` (+1 optional prop), `app/settings.tsx`, `app/_layout.tsx`
(+1 `Stack.Screen`), `lib/stats.ts` (optional `goalMinutes` param),
`components/bible/{scripture-progress-card,chapter-history-row}.tsx`.
**Done when:** the CTA says "Start Speaking" and resumes the saved position; the avatar opens
Settings on all three tabs; changing the daily goal moves the `WeeklyProgress` ring and the
`DailyGoalCard` percent immediately; "Up next" and "Recently spoken" render real data and
correct empty states; `scripts/test-stats.ts` still passes under bun (proving `lib/stats.ts`
stayed pure).
**Parallel:** independent of B2.

### Phase B4 — completion moments

**Depends on:** B2.
**Files:** `app/session/bible/complete.tsx` (sheet), `app/session/book-complete.tsx`,
`components/bible/lexicon-strip.tsx`.
**Done when:** the sheet appears after every chapter, sits ≤ 360pt, dismisses to the next
chapter in one tap, and shows **zero** performance metrics; the "N words to revisit" row appears
only at ≥ 3 mispronunciations; finishing a book routes to the full screen instead of the sheet;
the book screen's gauge, badge tile, records and haul all render from real data.

### Phase B5 — the Lexicon

**Depends on [A]:** `lexicon.json` + per-chapter hit lists from the offline extraction script
(§5.3), and a `lex/` MMKV namespace for discovered ids + timestamps.
**Files:** `scripts/build-lexicon.ts` (offline), `constants/lexicon-suits.ts`,
`components/session/discovery-chip.tsx`, `components/bible/lexicon-card.tsx`,
`app/lexicon/index.tsx`, `app/lexicon/[entryId].tsx`, `app/(tabs)/index.tsx` (+1 section),
`app/(tabs)/analytics.tsx` (+1 `CounterCard`).
**Done when:** reading Genesis 10 aloud fires discovery chips for the names in it and for
nothing else; the chip never covers teleprompter text and never animates opacity; the Home card
shows four suits with correct fractions; the grid redacts undiscovered words to their shape;
re-reading a chapter fires no duplicate chips; the extraction script's stoplist keeps `I`, `O`,
`The`, `Behold`, `Lord` out of the collection.
**Parallel:** B5's extraction script can be written any time — it touches nothing in the app.

### Phase B6 — badges, drills, analytics

**Depends on:** B4, B5.
**Files:** `constants/badges.ts`, `app/badges/index.tsx`, `hooks/use-hard-names-drill.ts`,
`lib/passage-catalog.ts` (register the generated drill), `app/(tabs)/analytics.tsx`
(scripture sections), `components/analytics/bible-strip.tsx`.
**Done when:** 66 Territory badges exist and unlock on book completion; every unearned badge
shows its criterion; the Hard Names drill generates from real `w/` data and runs through the
unmodified session flow; the Bible strip fits on one line at 375pt; the scripture `RecordsCard`
rows populate.

### Phase B7 — search, translations, polish

**Depends on [A]:** FTS index; **[C]:** RevenueCat entitlements.
**Files:** `app/(tabs)/bible/search.tsx`, Settings translation section.
**Done when:** `"john 3:16"`, `"psalm 119"`, `"gen 1"` all resolve; the translation picker
switches the whole app (no hardcoded "KJV" anywhere in app logic — the brief's requirement,
since sibling `.db` files use the same prefixed-table convention).

### What can run in parallel

```
B1 ─┬─ B3 ──┐
    │       ├─ B6
B2 ─┴─ B4 ──┤
            │
B5 ─────────┘        (B5's extraction script: any time, zero app dependencies)
B7                   (after B1; gated on [A] FTS and [C] RevenueCat)
```

B1, B2 and the B5 extraction script are three genuinely independent workstreams. B3 needs B1's
routes only for its links and can be built with placeholders.

---

## 9. Cross-lane notes

- **[A]** `SessionMode` needs a Bible member; per `lib/history-schema.ts`'s own rule, adding a
  field is not a version bump but changing a field's meaning is. Adding `'bible'` to the union
  is additive — no `RECORD_SCHEMA_VERSION` bump — but `upgradeRecord` and the parse must accept
  it, and `lib/score.ts`'s `isScorable` must decide whether Bible records feed the speaking
  score. **My recommendation: they should not.** A Bible session's minutes, streak and progress
  count; its *speaking score* does not, because scripture read at 130 wpm against archaic
  vocabulary is not comparable to the practice corpus and would silently drag the score the
  owner's Analytics tab is built around. Keep the two economies separate.
- **[A]** The percent ring, the `ContinueCard`, "Recently spoken" and the Bible strip all need
  the same aggregate: per-chapter `{ versesSpoken, verseCount, reads, lastReadAt, msSpoken }`.
  Build it once.
- **[A]** The lexicon hit lists must be produced by **`lib/passage-text.ts`'s tokenizer**, not a
  second one, or `wordIndex` won't line up with `currentWordIndex`.
- **[C]** Notification copy tone: §5.7.
- **[C]** Monetization surface that fits this plan: KJV + the full Lexicon free; paid unlocks
  additional translations, side-by-side translation compare, and audio export of your own
  readings. Do not paywall progress, badges, or discovery — the collection is the retention
  engine, and gating it converts the one thing people would tell their friends about into a
  reason not to.
- **Axiom:** of the three transferable skills named in the brief, only `axiom-design` (HIG /
  Liquid Glass reasoning) bears on this lane, and the app's own glass findings — documented
  inline in `passage-carousel.tsx`, `daily-goal-card.tsx` and `intro-reveal.tsx` — are more
  specific and more trustworthy than general guidance, so I followed those. `axiom-integration`
  and `axiom-shipping` belong to Lane C.
