# Design Philosophy — Optimizing for Feelings

> *"If software is to have soul, it must feel more like the world around it… the value of the
> tools, objects, and artworks that we as humans have surrounded ourselves with for thousands of
> years goes so far beyond their functionality."*
> — The Browser Company, *Optimizing for Feelings*

This is the document that decides what the app **feels** like. The other plan documents decide
what it does. When they conflict, this one wins on questions of feel and they win on questions of
correctness.

It is written as **rules with reasons**, not as vibes. That is deliberate, and it is the one
methodological idea taken from Emil Kowalski's *Agents with Taste*:

> *"Almost every 'taste' decision has a logical reason if you look close enough."*

A rule without its reason cannot be applied to a case it didn't anticipate, and it cannot be
argued with when it's wrong. Every rule below carries its because.

---

## 1. The thesis

**Reading the Bible aloud is already meaningful. The app's entire job is to not get in the way,
and then to make the moment of doing it feel like something.**

Most apps in this category optimize for the wrong thing — daily active users, streak retention,
notification open rates — and the result is what The Browser Company calls *"endless sequels that
everyone enjoys but no one truly loves."* This app optimizes for how it feels to speak a chapter
out loud and watch it land.

That is not a soft goal. It is the *only* durable one, because every functional feature here is
copyable in a weekend and the feel is not.

---

## 2. What each source contributes

Honest summaries, including where a source is less relevant than it looks.

### Optimizing for Feelings — The Browser Company *(the leading philosophy)*

The argument: optimizing for metrics produces software that works and that nobody loves. Their
counter-example is a Fort Greene restaurant — *"overflowing natural light, handmade textile seat
cushions, a caramel wood grain throughout"* — where a Silicon Valley optimizer would only see
functional deficiencies, but where the *"hand-crafted touches give our environment its humanity
and spirit."*

Three practices, all three of which apply here:

1. **Look inward.** Design from conviction, not data. (O'Keeffe: *"I have things in my head that
   are not like what anyone has taught me… so I decided to start anew."*)
2. **Look away from screens.** Take cues from architecture, print, sculpture, liturgy — not from
   other Bible apps.
3. **Cede control.** Let people shape the software into something of theirs, rather than being
   *"a daily active user"* in a drab gray cubicle.

**What this means concretely for us:** the Bible is the oldest, most typographically considered
object in the Western world. Look at psalters, illuminated manuscripts, letterpress, and the
Cambridge editions — not at Duolingo. Point 3 is why the teleprompter's `Aa` size control matters
more than it looks: it is the user shaping the reading surface to themselves.

### The HEY Way — Basecamp

The stances that transfer:

- **Convention over configuration.** *"You shouldn't have to write programmatic if/then
  statements."* Opinionated defaults over settings screens.
- **Attention is the currency.** No unread counts, no badges — *"Email isn't a game, you don't
  need to keep score."*
- **Rename things when the old name carries the old model.** HEY replaced "archive" with a **Flow**;
  signatures with **Name Tags**. Naming is design.
- **Consent before access.** Nothing reaches you until you allow it.

**What this means concretely:** "Start Practicing" → "Start Speaking" is already an instance of
the renaming principle, and there are more to make. And point 2 is a direct challenge to the
gamification plan — see §3, which is the most important section in this document.

### Developing Taste / 7 Practical Animation Tips — Emil Kowalski

The craft layer, and the source of most of §5. Taste is trainable: surround yourself with great
work, **analyze *why* it works** rather than whether you like it, then practise and get critique.
He is honest about the Ira Glass taste gap — *"your taste is good enough to tell that your work is
not on par yet"* — which is a normal phase, not a verdict.

The animation tips are specific and we adopt nearly all of them verbatim in §5.

### Software with a Soul — NFX

**Honest caveat: this essay is about something different than the others.** It argues that AI has
driven *"the marginal cost of humanness to zero"*, letting products deliver empathy and presence
at scale — digital clones, 24/7 companions, synthetic personas. That is a business-model thesis
about AI, not a craft thesis about micro-interactions.

One line does transfer, and it is worth keeping: *"It's computer interaction the way our brains
are originally programmed — to interact with other beings."* The useful reading for us is a
warning, not a mandate. **We are not adding an AI companion to the Bible.** The existing AI coach
is already being cut from the scripture flow (Lane B §4.2) precisely because performance-coaching
noise is wrong here. Presence, in this app, comes from the *text* and from the user's own voice —
not from a synthetic personality. Borrow the humanness goal; reject the implementation.

### The Robinhood line — the ethical boundary

You raised Robinhood being sued for making its app too addictive. That belongs in this document as
a **hard constraint**, because it is the exact failure mode a gamified Bible app can fall into,
and because it is the same critique The Browser Company makes of engagement optimization.

**The test: does the mechanic make the user glad they opened the app, or anxious about not
opening it?** Confetti on a completed chapter is the first. A red badge counting days you might
lose is the second. We ship the first and never the second. Concretely, this rules out: loss-framed
streak warnings, artificial scarcity, variable-ratio reward schedules, infinite/unbounded
progression, and anything that manufactures urgency around a book that has waited 400 years.

---

## 3. The central tension, and how it resolves

**HEY says *"you don't need to keep score."* You asked for a game. Those are in direct conflict,
and pretending otherwise would produce an incoherent app.**

Here is the resolution, and it is the single most important design decision in this document:

> **Score the scripture, not the person.**

Every number in this app should describe **the text you have spoken**, never **how good or
faithful you are**. The difference is not cosmetic:

| Scores the person ✗ | Scores the scripture ✓ |
|---|---|
| "12-day streak — don't lose it!" | "104 of 1,189 chapters spoken" |
| "You're falling behind" | "3 chapters left in Genesis" |
| A level, a rank, a grade | A collection with a finite, known denominator |
| Mystery badges you must guess at | Every criterion visible before you earn it |
| Unbounded points that inflate forever | 1,189 chapters. 66 books. 2,900 lexicon entries. It ends. |

This is why the gamification design in Lane B already holds up under HEY's critique:

- **Exactly one streak badge exists** (`Faithful`, 30 days) and that is the whole streak ladder.
  The streak still exists — it's in `HeaderActions` on every screen — but it is *not the game*.
- **The denominators are real and finite.** 1,189 chapters is not a treadmill; it is a destination.
  A finite denominator is the structural opposite of an engagement loop.
- **Every unearned badge shows its criterion.** *"Knowing what's next is motivation; hiding it is
  a nag."*
- **Discovery requires speaking the word aloud.** The reward is downstream of the actual practice,
  never of merely opening the app. This is the strongest anti-Robinhood property we have: **you
  cannot farm this game without doing the real thing.**
- **`Featherweight`** — the joke badge for Psalm 117 (15 seconds) that everyone gets — exists to
  signal the whole system is playful, not judgmental.

**The rule that falls out:** a mechanic is legitimate if it would still make sense to someone who
read the whole Bible and then deleted the app. Collections, maps, and records survive that test.
Streaks, levels, and badges-for-showing-up do not.

---

## 4. The principles

Seven, each with its because. These are the ones to apply when this document didn't anticipate
your case.

**1. The text is the interface. Everything else gets out of its way.**
*Because* the words are the point, and every pixel of chrome competes with them. This is why the
teleprompter fills the screen, why the timer is being removed, and why the results sheet drops
seven performance metrics. When in doubt, remove the thing that isn't scripture.

**2. Respond instantly; celebrate slowly.**
*Because* responsiveness and ceremony are different jobs. A tap must acknowledge within ~100ms or
the app feels broken; a completed book should take its time. Micro-interactions are fast (§5);
completions are allowed to breathe. Never invert this.

**3. Earned, never granted.**
*Because* an achievement you didn't earn is worthless and everyone knows it. Chapter completion is
detected by the recognizer reaching the last word — there is deliberately no "mark as read"
button. Lane A puts it well: adding one would mean *writing code to weaken a property we already
have*.

**4. Nothing is a mystery.**
*Because* hidden criteria create anxiety, and anxiety is the Robinhood failure mode. Show the
criterion, show the denominator, show the percentage. The one exception is the lexicon's redacted
word shape (`M······h`), and that works precisely *because* it reveals the shape — it says *there
is something specific here*, not *you don't have this*.

**5. Motion explains, or it doesn't happen.**
*Because* decoration is noise on the tenth viewing. Every animation should answer *where did this
come from*, *what just changed*, or *what is happening right now*. The verse reference rolls to
show the number changed. The ribbon moves to show you are being heard. A thing that moves for
attention alone gets cut.

**6. One vocabulary, everywhere.**
*Because* inconsistent motion reads as amateurism even when nobody can say why. One ring speed.
One press response. One haptic per meaning. §5 and §6 are that vocabulary, and they are derived
from what the app already does — they are a codification, not a redesign.

**7. Quiet by default; loud when earned.**
*Because* an app that celebrates everything celebrates nothing. Reading a verse gets nothing.
Finishing a chapter gets a sheet. Finishing a book gets the full screen. Finishing the Bible gets
whatever we can build. The gradient is the point.

---

## 5. The motion system

**These values are extracted from the app as it exists.** They are already consistent; this
section makes that consistency a rule instead of a coincidence.

### The four tiers

| Tier | Duration | Curve | For | Existing example |
|---|---|---|---|---|
| **Response** | **≤ 150ms** | `Easing.out(Easing.quad)` or a spring | Press states, toggles, immediate acknowledgement | *(missing — see §8)* |
| **Transition** | **200–350ms** | `Easing.out(Easing.cubic)` or `EASE_OUT` | Things entering, leaving, or moving between states | Verse-advance beat (260ms), tab pill (`SLIDE_SPRING` 420ms) |
| **Entrance** | **400–600ms** | `Easing.out(Easing.cubic)`, staggered | First paint of a screen; happens once per visit | `IntroReveal` — 450ms, 80ms stagger, 120ms base delay |
| **Ceremony** | **600–1200ms** | `Easing.out(Easing.cubic)` | Earned moments; rare by construction | Ring/gauge fills (900ms) |

Kowalski's *"keep animations under 300ms"* rule applies to **Response and Transition only**.
Entrance and Ceremony are deliberately longer *because they are rare* — his actual reasoning is
that animations *"seen repeatedly throughout the day"* become annoying, which is an argument about
frequency, not duration. A 900ms gauge fill you see once per chapter is not the same object as a
900ms button press.

### The named constants — use these, don't invent new ones

```ts
// Springs (existing, verified)
SPRING          = { damping: 32, stiffness: 420, mass: 0.9 }   // segmented-control.tsx:22
SLIDE_SPRING    = { duration: 420, dampingRatio: 0.82 }        // glass-tab-bar.tsx:59 — slight settle
MINIMIZE_SPRING = { duration: 380, dampingRatio: 1 }           // minimize-context.tsx:15 — no overshoot

// Curves (existing, verified)
Easing.out(Easing.cubic)              // the house curve — entrances, rings, most transitions
Easing.out(Easing.quad)               // softer; splash fade, fast feedback
EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1)   // fading-tab-slot.tsx:14 — strong ease-out for screen swaps

// Timings (existing, verified)
INTRO: 450ms, stagger 80ms, base delay 120ms, dy 14px
SPLASH_FADE: 600ms
RING_FILL: 900ms
```

**`dampingRatio: 0.82` vs `1` is a real distinction worth preserving.** Under-damping (a small
overshoot and settle) says *this thing has weight and you moved it* — right for a pill you dragged.
Critical damping says *this is a system state change* — right for the tab bar minimizing on scroll.
Choose deliberately.

### Rules adopted from Kowalski, with our reasons

1. **Press-scale to `0.97`, not opacity.** *Because* opacity says "disabled" and scale says
   "pressed", and because this app's own `passage-carousel.tsx:250` notes that dropping opacity
   interferes with glass. See §8 — this is currently wrong everywhere.
2. **Never animate from `scale(0)`. Start at `0.93`–`0.95`.** *Because* real objects don't come
   from nowhere; even a deflated thing has a shape. Applies to the discovery chip, the completion
   sheet, and every badge reveal.
3. **`ease-out` for anything entering or leaving.** *Because* the fast start reads as
   responsiveness. We already use it almost everywhere; make it the default.
4. **Origin-aware scaling.** *Because* a popover that grows from its trigger explains where it came
   from; one that grows from the screen center explains nothing. Directly serves principle 5.
5. **Blur to bridge a transition you can't otherwise fix.** *Because* it blends two states rather
   than cutting between them. `expo-blur` is already a dependency **and it works on Android**,
   unlike glass.
6. **Interruptible, always.** *Because* an animation that ignores input makes the app feel like it
   isn't listening. Reanimated springs handle this natively; `withTiming` chains often don't.
   Never block input on a celebration — every ceremony in this app must be dismissible mid-flight.
7. **Respect Reduce Motion.** *Because* motion sensitivity is real and this app is full of motion.
   `ReduceMotion.System` is currently used in exactly one file (§8).

---

## 6. The haptic system

Haptics are the most underrated part of feel, and this app already has a coherent scheme — it's
just undocumented. **One haptic per meaning. Never decorate with haptics.**

| Haptic | Meaning | Existing usage |
|---|---|---|
| `selectionAsync()` | *You changed a selection* | Tab switch, `Aa` text size, topic shuffle, segmented control |
| `impactAsync(Light)` | *Something small landed* | Playback pill, dismiss |
| `impactAsync(Medium)` | *You committed to an action* | Start session, pause/resume, primary buttons |
| `impactAsync(Heavy)` | *A significant, terminal action* | Stop session |
| `notificationAsync(Success)` | *The system finished something well* | Results screen, passage saved |
| `notificationAsync(Error)` | *The system rejected something* | Validation failure |

### Additions for scripture

| Moment | Haptic | Why |
|---|---|---|
| Crossing into a new verse | **none** | ~31 per chapter. A haptic here becomes a buzz you learn to ignore, and it would compete with speech. **Deliberately silent.** |
| Crossing into a new chapter (auto-advance) | `impactAsync(Light)` | Rare enough to mean something; already specified in Lane B §3.1. |
| Common/Uncommon lexicon discovery | `impactAsync(Light)` | Frequent — must stay under the noise floor. |
| Rare/Singular lexicon discovery | `notificationAsync(Success)` | 1,649 Singular words exist. Finding one should feel different in your hand, not just on screen. |
| Chapter complete | `notificationAsync(Success)` | Matches the existing results convention. |
| Book complete | `notificationAsync(Success)` + a considered pause, then the ceremony | The pause is the point — see §7. |

**The rule: haptic frequency must be inversely proportional to event frequency.** Anything that
fires more than a few times per session gets `Light` or nothing at all.

---

## 7. Applied to the moments that matter

### Splash → first paint

What exists is already right and should be understood before it's touched: a Lottie logo over an
**inverted** backdrop (light mode plays on black), then a 600ms `Easing.out(Easing.quad)` fade,
during which content beneath **staggers in** at 80ms intervals — chrome at slot 0, then content
cascading top-to-bottom.

The detail worth naming: the reveal starts *before* the splash finishes fading. `BASE_DELAY_MS =
120` is a head start, so the two overlap. That overlap is why it feels like the app is *arriving*
rather than *loading*. **Preserve it.** Also note the 2600ms `FINISH_FALLBACK_MS` — the app never
waits on the animation indefinitely, which is the correct priority.

### A welcome / first-run experience

There isn't one yet, and this is the biggest untaken opportunity in the app.

Do not build an onboarding carousel. Following The Browser Company's *look away from screens*: the
first thing a person should do in an app about speaking scripture is **speak scripture**. Open on
Genesis 1:1 — eleven words — and let them read it aloud before explaining anything. The permission
prompt arrives in context because they just tried to talk. The app teaches itself in one verse,
and the first thing they feel is *the app heard me*, which is the entire product.

*Because* an onboarding flow that explains the app is a confession that the app doesn't explain
itself.

### The reading flow — the 95% case

This is where nearly all the time is spent, so it must be **calm**. Almost nothing here should
move except the two things that carry information:

- **The teleprompter** advances with the frontier. Existing, untouched.
- **The verse reference** rolls its digits (`AnimatedRoundedNumber`, SwiftUI `numericText`) and
  plays a 260ms `translateY 6→0` beat. Existing components; it's the *composition* that's new.
- **The speech ribbon** flows continuously and pulses once per recognized word.

Everything else holds still. **No progress celebration mid-chapter, no verse-count-up, no
encouragement.** *Because* a person reading scripture aloud is concentrating, and interrupting
that to congratulate them is the app inserting itself into a moment that isn't about it.

The ribbon deserves one specific note. Its job is not to visualize audio — a raw meter proves a
*microphone* works. Its job is to prove **you are being understood**, which is why the word-landed
pulse fires on `currentWordIndex` changing rather than on amplitude. That distinction is the
difference between a level meter and a listener.

### Chapter completion

A ~360pt sheet, entering `scale 0.94 → 1` + `translateY 12 → 0` over ~300ms `ease-out`, from the
bottom (origin-aware: it comes from where you were).

The sequence matters more than any single value:

1. The last word lands. **A beat of nothing — roughly 250ms.**
2. `notificationAsync(Success)`.
3. The sheet enters.
4. The gauge fills over 900ms.
5. Lexicon chips, if any, stagger in at 80ms — the same stagger as the intro, so it reads as the
   same app.

**Step 1 is the one people skip and it is the most important.** Instant celebration reads as
automated. A held beat reads as *the app noticed*. This is the single cheapest way to buy feeling
in the entire application: a `setTimeout` and the confidence to leave the screen still.

### Book completion

The full ceremony, and the only place in the app permitted to be theatrical — 66 times, ever.
Longer hold (~400ms), the `ScoreGauge` at full scale, the Territory badge minted as a hero tile,
the lexicon haul. Then it must hand you forward: *"Start Exodus."*

*Because* the reward for finishing a book of the Bible is the next book of the Bible.

### Tapping — everywhere

Currently opacity, and it should be scale. See §8.

---

## 8. Where the app falls short today

Concrete, verified gaps between this philosophy and the current code.

**1. Press feedback is opacity, not scale — in every tappable component.**
`daily-goal-card.tsx:180` (`opacity: 0.85`), `passage-row.tsx:120` (`0.7`),
`words-to-master.tsx:76,101` (`0.85`, `0.6`), `freestyle-card.tsx:106`, `ai-coaching-card.tsx`,
`results-footer.tsx`, `session-top-bar.tsx`. Three different opacity values for the same gesture,
and opacity is the one property the codebase already knows conflicts with glass.
**Fix:** one shared `usePressScale()` hook — `withSpring(0.97)` on press-in, `withSpring(1)` on
press-out — applied on the non-glass path. Glass paths keep the native `isInteractive` response.
One press response, everywhere.

**2. Reduce Motion is honored in exactly one file.**
`components/splash/intro-reveal.tsx` passes `ReduceMotion.System`. Nothing else does — not the
rings, not the tab bar, not the gauges, and none of the new scripture motion. This is an
accessibility gap in an app aimed partly at devotional and older users.
**Fix:** `ReduceMotion.System` on every `withTiming`/`withSpring`, and a `useReducedMotion()` gate
on the ribbon's idle breathing loop.

**3. Hit targets are unverified.**
`hitSlop` appears on only four elements. Kowalski's floor is 44px.
**Fix:** audit every `Pressable`; add `hitSlop` wherever the visual target is smaller.

**4. There is no first-run experience.** §7.

**5. Ring fill duration is duplicated, not shared.**
900ms/`Easing.out(Easing.cubic)` is written out in `WeeklyProgress` and `DailyGoalCard`, and Lane B
specifies it again for the chapter ring. Three copies of one decision will drift.
**Fix:** export the motion constants from a single `constants/motion.ts` and import them. That file
does not exist yet and should — it is the mechanical expression of principle 6.

---

## 9. How to use this document

- **Before designing anything new**, read §3 and §4. Most questions resolve there.
- **Before writing an animation**, take the values from §5. Don't invent a duration.
- **Before adding a haptic**, check §6. If the moment isn't in the table, ask whether it should
  fire at all.
- **Before adding a reward**, apply the §3 test: *would this still make sense to someone who
  finished the Bible and deleted the app?*
- **When this document is wrong**, change it. Kowalski's point about taste is that it develops —
  and a philosophy that can't be revised is a style guide, not a philosophy.

The honest caveat, and it is Ira Glass's: the first version of anything built from this will not
match the taste that produced it. That gap is normal and closes with iteration, not with planning.
Ship it, look at it on a device, and fix what feels wrong — *"your taste is good enough to tell
that your work is not on par yet."*
