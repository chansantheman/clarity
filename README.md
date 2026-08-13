![Clarity](gh-preview.png)

A speech practice app for iOS and Android, built with Expo.

Read a passage out loud. Clarity listens, scores how you spoke, and tracks your
progress over time.

## What it does

- **Practice** — read from a library of passages (stories, news, poetry, tongue
  twisters), run short drills, or speak freestyle on a random topic. You can also
  add your own passages.
- **Live feedback** — a teleprompter follows your voice while you read, with a
  live word count, waveform, and pace readout.
- **Scoring** — each session gets one speaking score out of 100, plus five
  skills: Articulation, Flow, Pacing, Fillers, and Expression.
- **AI coaching** — a short written note after each session that points at the
  most useful thing to work on next.
- **Analytics** — score trend by week, month, or all time, along with practice
  time, session count, streak, and the words you keep stumbling on.

All history is stored on the device. There is no account and no server database.

## Stack

- Expo SDK 57, React Native 0.86, Expo Router (file-based routes)
- `expo-speech-recognition` for on-device transcription
- Azure Speech pronunciation assessment for word-level accuracy (optional)
- Expo Router API route + Vercel AI Gateway for the coaching text
- MMKV for local storage
- SF Pro Rounded and Lucide for the UI

## Getting started

You need a development build. Expo Go cannot run this app, because speech
recognition and MMKV need native code.

```bash
bun install
cp .env.example .env.local   # then fill in the keys
bunx expo run:ios            # or: bunx expo run:android
```

The iOS Simulator has no speech recognition. Use a real device to test a full
session, or set `EXPO_PUBLIC_MOCK_PRACTICE=1` to run the UI against a fake
session engine.

### Environment

| Variable                          | Required | Purpose                                        |
| --------------------------------- | -------- | ---------------------------------------------- |
| `AI_GATEWAY_API_KEY`              | For AI coaching | Server-only key for the coaching API route |
| `AI_COACH_MODEL`                  | No       | Defaults to `google/gemini-3.5-flash-lite`      |
| `EXPO_PUBLIC_AZURE_SPEECH_KEY`    | No       | Word-level pronunciation scoring                |
| `EXPO_PUBLIC_AZURE_SPEECH_REGION` | No       | Azure region for the key above                  |
| `APP_VARIANT`                     | Local    | `development`, `preview`, or `production`       |

Without Azure, sessions still score. The app falls back to its own alignment of
the transcript against the passage text.

## Scripts

```bash
bun test          # pure-logic tests for history, stats, alignment, and WAV
bun run ios       # build and run on iOS
bun run android   # build and run on Android
bun start         # Metro only
```

## Project layout

```
app/           Screens and routes (tabs, session flow, API route)
components/    UI components, grouped by screen area
hooks/         React state: sessions, history, coaching
lib/           Pure logic: scoring, stats, alignment, formatting
services/      Side effects: recognition, Azure, storage, history
constants/     Passages, drills, topics, colors, fonts, metrics vocabulary
```

`lib/` and `constants/` stay pure. They never import from `services/`, so the
scoring math runs under bun in the test scripts.

## Working with AI agents

Project instructions live in [AGENTS.md](AGENTS.md) (imported by `CLAUDE.md`). Read it before
changing anything — it carries the invariants that are not obvious from the code, plus the
Expo SDK 57, typography, icon, and liquid-glass rules.

Two tools are set up so agents verify Expo behaviour instead of recalling it. To reproduce on a
new machine:

```bash
# Official Expo skills + the Expo MCP server (docs + EAS access).
# Already enabled for this repo via .claude/settings.json.
claude plugin install expo@claude-plugins-official

# Drive a running build: accessibility tree, taps, logs, screenshots, profiling.
npm install -g agent-device@latest
agent-device doctor
npx skills add callstack/agent-device   # already run; see below
```

`agent-device doctor` is the first thing to run when something looks wrong — it reports device
inventory, Metro reachability, and missing platform tooling. Android needs `adb` on your PATH.

The `skills add` step has already been run and its output **is committed**: four skills in
`.agents/skills/` (`agent-device`, `ios-simulator`, `android-emulator`, `dogfood`), symlinked into
`.claude/skills/`, pinned by `skills-lock.json`. A fresh clone gets them automatically — no setup.
They load automatically when a task matches; they are not slash commands.

Because `/ios` and `/android` are gitignored, a fresh clone needs `npx expo prebuild` before
agent-device has an app to open.

See [AGENTS.md](AGENTS.md) for the command surface and what can and cannot be verified on a
simulator.

## Where this is going

This repo is the foundation for **Speak the Bible** — an app built around reading scripture aloud,
chapter by chapter, with every verse tracked. The existing speech engine, practice content, and
design language are the base; the Bible experience is added alongside them, not in place of them.

The full phased plan is in [`docs/plan/`](docs/plan/). Start with
[`00-PHASES.md`](docs/plan/00-PHASES.md) — it is the spine, and it carries the rulings that
override the individual lane documents.

| Document | Covers |
| -------- | ------ |
| [`00-PHASES.md`](docs/plan/00-PHASES.md) | The 16-phase sequence, cross-lane rulings, design language, verification, git |
| [`01-brief.md`](docs/plan/01-brief.md) | Intent, verified KJV database facts, codebase ground truth |
| [`02-data-architecture.md`](docs/plan/02-data-architecture.md) | SQLite packaging, `lib/bible/*`, verse-level progress, session seam |
| [`03-product-ux.md`](docs/plan/03-product-ux.md) | Bible tab, home, live reading screen, completion, gamification |
| [`04-backend-shipping.md`](docs/plan/04-backend-shipping.md) | Auth, sync, Supabase, notifications, licensing, App Store |
| [`05-android.md`](docs/plan/05-android.md) | What ports to Android, how to diverge, per-phase delta |
| [`06-design-philosophy.md`](docs/plan/06-design-philosophy.md) | How it should feel: motion tiers, haptics, micro-interactions, gamification ethics |

## Android

One codebase ships both platforms — of the 16 native packages here, **only `expo-glass-effect`
has no Android support**, and every component that uses it already falls back to a solid surface.
All the app's logic is portable. Three things are not, and
[`05-android.md`](docs/plan/05-android.md) covers each in full:

- **Liquid Glass doesn't exist on Android.** `GlassView` is a plain `View` there. The app renders
  opaque cards instead — functional, visually plainer.
- **SF Pro Rounded can't legally ship in an Android build.** Apple's font license is
  Apple-platforms-only. `constants/fonts.ts` is the single choke point for the swap (Nunito is the
  recommended substitute).
- **Speech recognition needs Android 13+.** Audio recording and continuous recognition — the core
  loop — are unavailable below API 33.

There is also a **live bug**: no `BackHandler` exists anywhere, so on Android the hardware back
button unmounts a session without writing its record. Fix it in Phase 4 regardless of whether
Android ships.

To run Android locally, `adb` must be on your PATH (the SDK is installed but the PATH entry is
not):

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator"
```

Emulators verify layout, navigation, and back behaviour. They cannot verify speech recognition,
recording, or purchases — those are device-only on both platforms.

## License

MIT. See [LICENSE](LICENSE).
