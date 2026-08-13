# What this app is becoming

This repo (internally `clarity`) is being built into **Speak the Bible** — an app whose core loop
is reading scripture aloud, chapter by chapter, with every verse tracked. The existing speech
engine, Practice/Drills/Freestyle content, Analytics, and design language are the *foundation*,
not legacy to replace.

**The work is additive.** Do not delete or restructure existing features to make room for Bible
functionality. New surfaces are new files; the plan refactors exactly one existing file and
changes exactly one user-facing string.

The full phased plan lives in **[`docs/plan/`](./docs/plan/)** — start at
[`00-PHASES.md`](./docs/plan/00-PHASES.md), which is the spine and carries the cross-lane
rulings that override the individual lane docs.

**Before designing or animating anything, read
[`06-design-philosophy.md`](./docs/plan/06-design-philosophy.md).** It is binding, not
inspirational. It defines the four motion tiers and their exact durations and curves, the haptic
vocabulary (one haptic per meaning), the press-feedback rule, and the ethical line on
gamification. Do not invent a duration, an easing curve, or a haptic — take them from there. The
short version:

- **Response ≤150ms · Transition 200–350ms · Entrance 400–600ms · Ceremony 600–1200ms.**
  The sub-300ms rule applies to the first two only; entrances and ceremonies are longer *because
  they are rare*.
- **Press feedback is `withSpring(0.97)` scale, never opacity** — opacity reads as "disabled" and
  interferes with glass.
- **Never animate from `scale(0)`** — start at `0.93`–`0.95`, because real objects don't come from
  nowhere.
- **Motion must explain something** (where this came from, what changed, what is happening now).
  Decoration gets cut.
- **Score the scripture, not the person.** Finite denominators, visible criteria, no loss-framed
  streaks, no mystery badges.
- Every animation passes `ReduceMotion.System` and stays interruptible.

# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.
Assume your training is stale on SDK 57. For every Expo API you use: verify it against the v57
docs or `node_modules`, state whether it needs a config plugin, a dev build (vs Expo Go), or a
native rebuild, and mark anything you could not verify as `UNVERIFIED:` rather than asserting it.

# Cite it or mark it TBD — no uncited specifics

**Every concrete value carries a source, or it is an ALL-CAPS placeholder.** Identifiers, version
numbers, counts, colors, durations, API names, prices, dates: each one is followed by a
`file.ts:123` citation, a URL, or an explicit `UNVERIFIED:` marker. **An uncited specific is a
defect**, even when it turns out to be right.

This is not pedantry, it is the only defence that works. Two separate agents writing these
documents fabricated a bundle identifier — the second did it *inside a section it had titled
"read them, never invent them."* That is not disobedience: a model has no internal signal
separating "I read this" from "I inferred this", so both produce equally confident text and an
instruction not to invent cannot reliably prevent inventing. What does work is making the claim
checkable, because **a fabricated value has no citation** — the format itself exposes it. In the
audit of these documents, every cited claim held; the one fabrication was in uncited prose.

Bundle ids, App Group ids, Apple Team ids, ASC ids: **read them from the repo or leave a
placeholder.** A wrong identifier produces a provisioning failure at build time or a silent SSO
failure at runtime, and both are slow to diagnose. Verified values live in `app.config.ts`,
`app.json`, and `eas.json`.

Never guess a Lucide icon name (`ls node_modules/lucide-react-native/dist/types/icons | grep -i x`)
and never write an Expo API from memory (read https://docs.expo.dev/versions/v57.0.0/).

Run the mechanical half of this with:

```bash
bun run audit:plan     # citations resolve, icon names exist, KJV counts match
```

It verifies what is cheap to verify and says so plainly. **A clean run is not proof the documents
are correct** — prose, judgement, and anything about Expo's docs still need a reader.

# Engineering invariants

These are load-bearing. Breaking one is a bug even when the code compiles.

- **`lib/` is pure.** No React, no `react-native`, no `services/` imports in `lib/history-schema.ts`,
  `lib/stats.ts`, or anything under `lib/bible/` (except `queries.ts`). `scripts/test-*.ts` run
  these directly under bun — that is the point of the rule.
- **No persisted scores.** `types/history.ts` is explicit: raw measures only, every consumer
  recomputes. This is why changing a score definition needs no migration. Do not add a derived
  value to a persisted record.
- **Store only what cannot be derived.** Repeat counts, time spent, last-read, and rollups all fall
  out of `SessionRecord`s that already exist.
- **Parsing is total.** Every stored payload yields either a valid value or a stated reason.
  A payload from a *newer* schema is kept read-only and never rewritten — never quarantined,
  because quarantining deletes the original key.
- **Write-then-verify.** Write, read back, then treat as committed. Memory must equal disk.
- **`tzOffsetMinutes` is snapshotted per record** so streaks survive travel and DST. One streak,
  one definition.
- **Schema versions bump when a field changes *meaning*, not when one is added.**

# Typography: SF Pro Rounded

All text uses SF Pro Rounded, bundled in `assets/fonts/` and loaded at runtime in `app/_layout.tsx` (Expo Go can't embed fonts at build time; the expo-font config plugin in `app.json` covers dev builds).

Set weights via `fontFamily` with the constants from `constants/fonts.ts` (`fonts.regular` … `fonts.heavy`) — never via `fontWeight`, which makes iOS synthesize or fall back to the system font:

```tsx
import { fonts } from '@/constants/fonts';

<Text style={{ fontFamily: fonts.semibold }}>…</Text>
```

# Icons: Lucide

This project uses [lucide-react-native](https://lucide.dev/guide/packages/lucide-react-native) (free, no license/token required). Never use emoji, text glyphs, or other icon libraries.

## Usage

Import each icon as its own named component and render it directly — there is no wrapper component:

```tsx
import { Mic } from 'lucide-react-native';

<Mic size={24} color="#000" strokeWidth={1.5} />
```

Props: `size` (default 24), `color`, `strokeWidth` (default 2), plus `fill`. Lucide icons are outline-only by default — for a filled/solid look (used for "active" glyphs like tab bar icons, or control buttons like Play/Pause/Mic), pass `fill` set to the same value as `color`. Skip `fill` on multi-part icons (e.g. `CircleUser`) where filling all subpaths at once reads as a solid blob rather than a glyph.

When a generic component accepts an icon as a prop, type it as `LucideIcon` and render it as a component, not pass it to a wrapper:

```tsx
import type { LucideIcon } from 'lucide-react-native';

type Props = { icon: LucideIcon };

function Example({ icon: Icon }: Props) {
  return <Icon size={20} color="#000" />;
}
```

## Looking up icon names

Do NOT guess icon names — check locally. Every icon is a file in the installed package, named in kebab-case; the export is the PascalCase version of that name:

```bash
ls node_modules/lucide-react-native/dist/types/icons | grep -i <keyword>
```

Example: `ls node_modules/lucide-react-native/dist/types/icons | grep -i mic` → `mic.d.ts`, `mic-off.d.ts`, etc. → import names `Mic`, `MicOff`. For visual browsing, search at https://lucide.dev/icons.

Check that an icon survives being **filled** before using it somewhere that fills unconditionally
(the tab bar does). `BookOpen` fills into a solid book; `Scroll` fills into a shapeless blob.

# Liquid glass: two rules that will bite you

Both are documented inline in the components that discovered them. They constrain every new card,
sheet, chip, and animation.

1. **Glass breaks under animated opacity.** A `GlassView` under an ancestor with animated opacity
   renders empty on iOS. Anything containing glass animates **transform-only** — use
   `<IntroReveal fade={false}>`, and get the fade from the splash overlay or a `ProgressiveBlur`
   instead. See `components/splash/intro-reveal.tsx`.
2. **Nested glass does not render on iOS 26.** A card's glass must be an absolute-fill *sibling*
   of its content, never a parent of a button's own glass. See
   `components/practice/freestyle-card.tsx`. Related: the native press response only fires for
   touches landing inside the glass view's own subtree, so the `Pressable` wraps one `GlassView`
   with all content inside it (`components/passage-carousel.tsx`).

# Screen composition

- Frame: `paddingHorizontal: 20`, `paddingTop: insets.top + 24`, `paddingBottom: 140`
  (tab-bar clearance), on an `Animated.ScrollView` with `useMinimizeOnScroll()`.
- Type scale: screen title 34/`bold`/ls -0.5 · section title 22/`bold`/ls -0.3 ·
  subtitle 15/`regular` · row title 17/`semibold`/ls -0.2 · meta 13/`regular`.
- Entrance: `<IntroReveal order={n}>` staggers chrome (order 0) then content top-to-bottom.
- Rings and meters fill with `withTiming(900, Easing.out(Easing.cubic))`, rotated `-90deg` so they
  grow from 12 o'clock. Every ring in the app fills at one speed.
- Colors come from `constants/colors.ts`, `constants/session-theme.ts`, `constants/metrics.ts`.
  Prefer an existing token over a new hex.
- **Reuse before you build.** `SegmentedControl`, `TickBar`, `TickGauge`, `CounterCard`,
  `RecordsCard`, `PlaybackPill`, `AnimatedRoundedNumber`, `AnimatedDashedBorder`,
  `EmptyStateCard`, `ProgressiveBlur`, `PassageRow`, `SectionHeader` already exist and are the
  reason new screens look like old ones.

# Axiom skills

Axiom targets Swift/SwiftUI/Xcode. This is Expo / React Native / TypeScript, so
`axiom-swiftui`, `axiom-data`, `axiom-concurrency`, and `axiom-uikit` have **no applicable
surface here** — do not launder Swift advice into React Native advice. The transferable ones are
`axiom-design` (HIG, Liquid Glass), `axiom-integration` (notifications, StoreKit), `axiom-shipping`
(App Store review, privacy manifests), `axiom-security`, and `axiom-apple-docs`. The native
project at `ios/` is Expo prebuild output, so entitlement- and Info.plist-level guidance is real —
but always say whether a change belongs in `app.config.ts`, a config plugin, EAS, or native `ios/`.

# Expo agent tooling — use it instead of guessing

Two things are set up on this machine specifically so you do not have to write Expo from memory.
The "Expo HAS CHANGED" rule above is a constraint; these are the tools that satisfy it.

## Official Expo plugin (skills + MCP)

`.claude/settings.json` enables `expo@claude-plugins-official` (v1.9.8 verified on disk). It ships
**21 auto-discovered skills** — you do not slash-invoke these, they load when the task matches:

```
eas-app-stores   eas-hosting        eas-observe       eas-simulator
eas-update-insights                 eas-workflows
expo-app-clip    expo-brownfield    expo-data-fetching  expo-dev-client
expo-dom         expo-examples      expo-module        expo-native-ui
expo-project-structure              expo-router       expo-skill-feedback
expo-tailwind-setup                 expo-ui           expo-upgrade
expo-web-to-native
```

Directly relevant here: **`expo-router`** (this app uses `expo-router/ui` custom tabs),
**`expo-dev-client`** (this project cannot run in Expo Go — see below), **`expo-upgrade`** for SDK
bumps, **`eas-workflows`**/**`eas-app-stores`** for build and submit, **`eas-observe`** because
`expo-observe` is already a dependency. Ignore `expo-tailwind-setup` and `expo-dom` — this project
uses neither.

The plugin also bundles the **Expo MCP Server** (`https://mcp.expo.dev/mcp`, http transport), which
gives live access to Expo documentation and EAS. **Prefer the MCP server over your training data
for any SDK 57 question** — that is the whole point of it. No separate `.mcp.json` is needed; the
plugin carries the config.

> Plugin skills and MCP servers are resolved at session start. If `expo-*` skills are absent from
> your skill list or the `expo` MCP server is missing, the session predates the plugin being
> enabled — restart it rather than falling back to memory.

## agent-device — verify claims against a running app

`agent-device` (Callstack, **v0.20.8**, at `/opt/homebrew/bin/agent-device`) drives a real running
build: accessibility tree, taps, typing, scrolling, deep links, logs, network requests, CPU/memory,
screenshots, and video.

**This closes the honesty gap.** Reading code tells you a screen *should* render; agent-device tells
you it *did*. Do not claim a Bible tab renders, a chapter completes, a ring animates, or a
notification fires without either observing it here or saying plainly that you did not verify it.

```bash
agent-device doctor                          # environment check — run first
agent-device apps --platform ios
agent-device open <AppName> --platform ios
agent-device snapshot -i                     # accessibility tree with @ids
agent-device press @e2 --settle
agent-device screenshot ./artifacts/thing.png
agent-device close
```

`snapshot -i` prints element ids (`@e2`) that the interaction commands target — snapshot first,
then act. Sessions record to replayable `.ad` scripts and export to Maestro YAML, so a flow worth
re-checking should be saved rather than retyped.

**Verified environment state on this machine** (`agent-device doctor`, exit: warn, no blockers):

- 26 local devices, 3 booted iOS simulators; iOS runner artifact cached, so first `open` skips a
  runner build.
- Metro reachable at `http://127.0.0.1:8081/status` — required for React component/hook profiling.
- `adb` is **not** in PATH, so Android inventory is unavailable. iOS only until that changes.

Two project-specific constraints: this app **cannot run in Expo Go** (`react-native-mmkv`,
`react-native-nitro-modules`, `expo-speech-recognition`, `react-native-purchases`, and the custom
`plugins/with-scene-delegate.js` plugin do not exist there), so always target a development build.
And the microphone/speech-recognition path cannot be meaningfully exercised on a simulator — treat
anything touching live recognition as **device-only**, and say so rather than reporting a simulator
pass as a pass.

### agent-device skills — installed

`npx skills add callstack/agent-device` has been run. It installed **four project-level skills**
into `.agents/skills/`, symlinked into `.claude/skills/`, with hashes pinned in `skills-lock.json`:

| Skill | Use it for |
|---|---|
| `agent-device` | The command surface itself — snapshot, press, type, scroll, logs, network |
| `ios-simulator` | Booting, listing, and managing iOS simulators |
| `android-emulator` | Android equivalents — **inert until `adb` is on PATH** |
| `dogfood` | agent-device's own self-testing workflow; ignore unless working on the tool |

These are skills, not slash commands — they load when the task matches. `agent-device` and
`ios-simulator` are the two that matter here.

Because they live in the repo rather than `~/.claude`, they are shared with anyone who clones it,
and `skills-lock.json` makes the install reproducible. **Commit all three paths together**
(`.agents/`, `.claude/skills/`, `skills-lock.json`) or none of them — a lock file without the
skills is worse than neither.

Note `/ios` and `/android` are gitignored (generated by prebuild), so a fresh clone needs
`npx expo prebuild` before agent-device has anything to open.
