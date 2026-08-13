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
npx skills add callstack/agent-device   # optional: teaches agents the command surface
```

`agent-device doctor` is the first thing to run when something looks wrong — it reports device
inventory, Metro reachability, and missing platform tooling. Android needs `adb` on your PATH.

See [AGENTS.md](AGENTS.md) for the command surface and what can and cannot be verified on a
simulator.

## License

MIT. See [LICENSE](LICENSE).
