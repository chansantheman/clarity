# Android — what's shared, what isn't, and how to diverge

Everything here was verified against this repo's actual dependency tree and source, not against
general Expo advice. `UNVERIFIED:` marks anything I could not confirm.

**The short version:** Expo really does give you both platforms from one codebase, and of the 16
native packages in this project, **exactly one has no Android support**. What doesn't cross over
isn't the logic — it's the *look* (Liquid Glass), the *typeface* (a licensing problem, not a
technical one), and a handful of Android platform behaviours that have no iOS equivalent. One of
those, the hardware back button, is a live data-loss bug today.

---

## 1. Dependency reality check

Verified by looking for an `android/` directory in each package:

| Package | Android | Note |
|---|---|---|
| **`expo-glass-effect`** | **NO** | **The only one.** See §2. |
| `expo-speech-recognition` | yes | Real constraints — §4 |
| `expo-blur`, `expo-audio`, `expo-haptics` | yes | |
| `react-native-mmkv`, `react-native-nitro-modules` | yes | |
| `react-native-purchases` | yes | Separate Play Console config |
| `expo-file-system`, `expo-asset`, `expo-updates`, `expo-font` | yes | |
| `@expo/ui` | yes | Ships `jetpack-compose/` alongside `swift-ui/` |
| `lottie-react-native`, `expo-observe` | yes | |
| `react-native-svg` | yes | Uses `apple/` rather than `ios/` — not a gap |
| `expo-sqlite` (Phase 1, not yet installed) | yes | The whole Bible layer is portable |

**Everything in the Bible plan — SQLite packaging, `lib/bible/*`, coverage bitmaps, rollups, the
session seam, the progress store — is plain TypeScript over cross-platform native modules. Phases
1–5 and 9–11 need no Android work at all.**

The app is also already configured for Android more than it looks: `app.json` carries a full
adaptive icon set (foreground, background, **and** monochrome for themed icons),
`RECORD_AUDIO` / `MODIFY_AUDIO_SETTINGS` / `FOREGROUND_SERVICE` /
`FOREGROUND_SERVICE_MEDIA_PLAYBACK` permissions, and an `android.package`.

---

## 2. Liquid Glass — the visual identity does not port

`expo-glass-effect` has no Android implementation whatsoever. On Android:

```js
// node_modules/expo-glass-effect/build/GlassView.js  (the non-.ios build)
export default function GlassView(props) {
    return _jsx(View, { ...props });     // a plain View. That is the entire Android implementation.
}
// isLiquidGlassAvailable.js
export function isLiquidGlassAvailable() { return false; }
```

`glassEffectStyle`, `tintColor`, and `isInteractive` are silently ignored. **24 component files
use `GlassView`.**

**The app already handles this correctly.** Every one of those files branches on
`isLiquidGlassAvailable()` and renders a solid fallback instead — e.g. `passage-row.tsx`:

```ts
const THEME = {
  light: { glassTint: 'rgba(255,255,255,0.45)', solidFallback: 'rgba(244,244,246,0.96)', … },
  dark:  { glassTint: 'rgba(10,10,12,0.55)',    solidFallback: 'rgba(26,26,30,0.96)',    … },
};
const hasGlass = isLiquidGlassAvailable();
```

So Android renders opaque cards. **Nothing crashes and nothing is missing functionally** — but the
material, the depth, the translucency, and the native interactive press response are all gone.

Two more things are hand-gated to iOS: the carousel's off-center depth blur
(`passage-carousel.tsx:269`) and the tab-bar haptics (`glass-tab-bar.tsx:143`).

### The decision

**Option A — ship the flat fallback.** Zero extra work. Android is a visually plainer version of
the same app. Honest, and genuinely fine.

**Option B — design an Android material.** Use `expo-blur` (which *does* support Android) plus
Material 3 elevation and surface tints, so Android looks deliberately Android rather than "iOS
with the good parts stripped." This is a design project, not a porting task.

**Recommendation: A for the first Android release, B only if Android earns real usage.** The
fallback path already exists and is already correct; building a second design system before you
know anyone is on Android is expensive. But *look at it on a device before shipping* — a design
tuned for translucency can read as flat and cheap when the translucency is removed, and that is a
judgment call no one can make from the code.

---

## 3. SF Pro Rounded cannot ship in an Android build

This is the one genuine blocker, and it is legal rather than technical.

The five faces in `assets/fonts/` are bundled and loaded through `expo-font`, so they *will*
render on Android. But **Apple's SF font license permits use on Apple platforms only.** Shipping
them inside an APK/AAB violates it, and it's trivially detectable — the `.otf` files sit right
there in the bundle.

`UNVERIFIED:` the current exact EULA wording; it has been revised more than once. **Read it before
deciding** — but plan for needing a substitute.

### How to do it

`constants/fonts.ts` is the single choke point — every piece of type in the app routes through
`fonts.regular … fonts.heavy`, because `AGENTS.md` forbids `fontWeight`. That discipline pays off
here: the swap is one file.

```ts
// constants/fonts.ts
import { Platform } from 'react-native';

export const fonts = Platform.select({
  ios: {
    regular: 'SFProRounded-Regular', medium: 'SFProRounded-Medium',
    semibold: 'SFProRounded-Semibold', bold: 'SFProRounded-Bold', heavy: 'SFProRounded-Heavy',
  },
  default: {
    regular: 'Nunito-Regular', medium: 'Nunito-Medium',
    semibold: 'Nunito-SemiBold', bold: 'Nunito-Bold', heavy: 'Nunito-ExtraBold',
  },
})!;
```

`fontAssets` branches the same way so Android never loads (or ships) the Apple faces. **Verify the
`.otf` files are actually excluded from the Android bundle** — bundling them but not referencing
them is still distribution.

Closest free rounded substitutes, both SIL Open Font License: **Nunito** (rounded terminals,
five weights, very close in feel) and **Quicksand** (geometric, lighter, fewer weights).
Recommendation: **Nunito** — it has the weight range this app actually uses.

Expect to re-check spacing. Nunito's metrics differ from SF Pro Rounded, so the tight
`letterSpacing: -0.5` on 34pt titles will need a pass on Android.

---

## 4. Speech recognition on Android — the real constraints

`expo-speech-recognition` wraps Android's `SpeechRecognizer`, which is a different engine from
iOS's `SFSpeechRecognizer` with different limits. From the package's own README:

| Constraint | Impact here |
|---|---|
| **Recording is Android 13+ only** | The app records audio for the results `PlaybackPill` **and** for Azure pronunciation scoring. On Android ≤12 there is no recording — so no playback and no Azure word scores. |
| **`continuous` mode unsupported on Android ≤12** | The teleprompter follows a continuous frontier. This is the core loop. |
| Requires Google's speech service **installed and enabled** | `com.google.android.tts` (13+) or `com.google.android.googlequicksearchbox` (≤12). The config plugin already declares the package-visibility queries. If disabled, recognition hangs or errors. |
| On-device recognition needs a downloaded model | `androidTriggerOfflineModelDownload()` per locale; on 13+ typically none are installed by default. |
| Android has **no** speech-recognition permission | Mic only. `requestMicrophonePermissionsAsync()` is the correct call on both platforms. |
| There is a **beep** on start | The README has a "Muting the beep sound on Android" section. Unmuted, it fires at the start of every chapter. |

**Consequence — a product decision: set `minSdkVersion` to 33 (Android 13).** The two features
that break below it (recording and continuous recognition) are not optional extras here; they are
the app. Supporting Android 12 means shipping a build where reading a chapter doesn't work
properly, which is worse than not shipping it.

`UNVERIFIED:` Expo SDK 57's default `minSdkVersion` — check before assuming you need to raise it.
It is set via `expo-build-properties`, not `app.json` directly.

**Already correct:** the app pins `outputSampleRate: 16000` (`use-practice-session.real.ts:285`)
and Azure is told `samplerate=16000`. 16 kHz is Android's native rate, so the WAV pipeline in
`services/wav.ts` needs no platform branch.

**Emulators cannot verify any of this.** Same rule as the iOS simulator — speech is device-only.
You have no Android device, so treat Android recognition as **unverified** until you get one. Do
not report an emulator pass as a pass.

---

## 5. The hardware back button — a live bug

**This is the most important item in this document.** There is **no `BackHandler`, no
`beforeRemove` listener, and no `useFocusEffect` anywhere in the app** — verified by grep.

On iOS that is fine; the only way out of a session is the dismiss button, which runs
`handleDismiss` → `stop()` → `recordSession(…, 'abandoned')` → `checkpoint.end()`.

On Android, the hardware/gesture back button pops the route directly. That unmounts
`app/session/[passageId].tsx`, and its cleanup is:

```ts
return () => {
  const s = sessionRef.current;
  if (s.status === 'listening' || s.status === 'paused') s.cancel();   // cancel, NOT stop
};
```

`cancel()` discards the attempt. **No record is written and the minutes are lost** — exactly the
bug the comment above `handleDismiss` says was already fixed once:

> *"Dismissing mid-read used to discard the attempt entirely, which is why practice minutes
> systematically undercounted real usage."*

It was fixed for the button path and never for a back gesture that iOS doesn't have. For Speak the
Bible this is worse than lost minutes: verse coverage is banked incrementally (Lane A §A5), so
coverage would survive while the session record vanishes — leaving "100% read, 0 sessions", the
exact inconsistency the plan works to avoid.

**Fix:** intercept back on Android and route it through the same terminal path as the dismiss
button, so there is one exit and one write. Do this in the `ReadingSession` component extracted in
Phase 4, so both the passage and chapter routes inherit it. `UNVERIFIED:` whether expo-router v57
prefers React Navigation's `beforeRemove` or a raw `BackHandler` subscription — check the router
docs before writing it.

Related: `predictiveBackGestureEnabled: false` is already set in `app.json`, which disables
Android's predictive-back animation. Leave it off until back is handled properly.

---

## 6. How to diverge on Android, mechanically

Four techniques, in order of preference. Reach for the lightest one that works.

**1. `Platform.select` for values.** Best for colors, sizes, durations, font maps. Used above for
fonts; already used at `glass-tab-bar.tsx:143` for haptics.

**2. `Platform.OS` for a branch.** Best when a whole element is iOS-only, like
`passage-carousel.tsx:269`'s depth blur.

```tsx
{Platform.OS === 'ios' && <AnimatedBlurView … />}
```

**3. Capability checks over platform checks — prefer this.** `isLiquidGlassAvailable()` is better
than `Platform.OS === 'ios'` because it is *also* false on an iPhone running iOS 25, and true only
where the feature really exists. **When a capability check is available, use it instead of a
platform check.**

**4. Platform-specific files, for whole components.** Metro resolves `Foo.ios.tsx` on iOS and
`Foo.tsx` everywhere else, from a single `import { Foo } from './foo'`. This project already does
it once — `components/animated-rounded-number.ios.tsx` uses SwiftUI's `numericText` rolling-digit
transition, and `animated-rounded-number.tsx` is a plain `<Text>` fallback for Android and web.

That's the pattern to copy for anything substantial. Note you can add `.android.tsx` as a third
sibling when Android deserves its own real implementation rather than a degraded one — e.g. a
Jetpack Compose version via `@expo/ui`, which ships `jetpack-compose/`.

**Config-level divergence** lives in the `ios` / `android` blocks of `app.config.ts` and
`app.json`. `plugins/with-scene-delegate.js` is iOS-only by construction (`withAppDelegate`,
`withInfoPlist`) and is simply inert on Android — not a compatibility problem.

**Rule of thumb:** diverge at the smallest scope that solves it. A `Platform.select` on one color
is maintainable; two parallel component trees are not.

---

## 7. Android platform behaviours with no iOS equivalent

Things that will bite that aren't about this app specifically.

- **Back button / predictive back** — §5. The big one.
- **Edge-to-edge is mandatory on Android 15+ (API 35).** The system no longer honors opting out.
  `useSafeAreaInsets()` is already used on every screen, which is most of the work, but the glass
  tab bar and the session control pill both sit at the bottom and need checking against the
  gesture nav bar. `UNVERIFIED:` how Expo 57 / RN 0.86 default this.
- **Notification channels are required (Android 8+).** Phase 13 must create a channel before
  scheduling anything; a notification with no channel silently never appears. Channels also carry
  user-controllable importance, so name and describe them deliberately.
- **Back-stack and deep links differ.** Android users expect back to walk the whole stack. Test
  the Bible tab → book → chapter → session path with the back gesture at every level.
- **No `fullScreenModal` semantics.** iOS modal presentation is an iOS concept; on Android it's
  just another screen. The session route will feel different, and that's normal.
- **Themed/monochrome icons** — already provided in `app.json`. Good.
- **Play Store instead of App Store:** a **Data Safety form** rather than privacy nutrition labels
  (same underlying disclosures — including the Azure audio flow from Lane C §4.12), a target API
  level requirement that ratchets annually, and a separate content rating questionnaire (IARC).

---

## 8. Auth — settled

**Decision (owner): ship Google *and* Apple sign-in on both platforms.** That removes the
platform-divergence question from auth entirely.

- Sign in with Apple works on Android through the **web-based flow** — no native SDK.
- Google sign-in is native on Android and web-based on iOS.
- Supabase supports both providers, so the backend in Lane C §4.5 is unchanged.
- **App Store Guideline 4.8** is now genuinely triggered: the app offers a third-party login
  (Google), so Sign in with Apple must be offered on iOS as an equivalent option. You're doing
  that, so this is satisfied — but it is the actual reason, not the "because Supabase supports
  providers" reasoning that was in an earlier draft.
- Each provider needs its own OAuth client per platform, and Android requires the release
  keystore's SHA-1 registered with Google. That last one is a classic launch-day blocker: it works
  in debug and fails in release because the signing certificate changed.

---

## 9. Per-phase Android delta

Only phases with actual Android work are listed. Everything else is free.

| Phase | Android delta |
|---|---|
| 0 — Hygiene | Set `minSdkVersion` 33 (§4). Confirm the Azure server-route fix works on Android too. |
| 1–3 — Data, modules, schema | **None.** Pure TS + cross-platform natives. |
| 4 — `ReadingSession` extraction | **Add the back-button interception here** (§5). One place, both routes. |
| 5 — Progress store | **None.** MMKV is cross-platform. |
| 6 — Session route | Verify the speech ribbon's Reanimated worklets on Android; verify recognition on a **real device**; mute the start beep. |
| 7 — Bible tab | Check the 4-tab glass bar with the flat fallback; check bottom insets against gesture nav. |
| 8 — Home + Settings | Font substitution lands here if not earlier — re-check `letterSpacing` on Android. |
| 9–11 — Completion, Lexicon, badges | Layout checks only. Logic is portable. |
| 12 — Auth + Supabase | Google + Apple both platforms (§8). Register the release keystore SHA-1. |
| 13 — Notifications | **Create a notification channel** or nothing appears. |
| 14 — Monetization | Separate Play Console products, pricing, and testing track. RevenueCat handles the abstraction. |
| 15 — Ship | Data Safety form, IARC content rating, target API level, release signing. |

---

## 10. Getting Android running on this machine

The SDK is installed at `~/Library/Android/sdk`, but **`adb` is not on your PATH** — which is why
`agent-device doctor` reports Android inventory as unavailable and the `android-emulator` skill is
inert. **No AVDs exist yet either.**

```bash
# ~/.zshrc
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator"
```

Then create an AVD (Android Studio → Device Manager → Add), pick an **API 33+** image, and:

```bash
adb devices
agent-device doctor            # Android inventory should now resolve
bunx expo run:android          # first run is slow; it builds the native project
```

An emulator is good for layout, navigation, back-button behaviour, and seeing the glass fallback.
It is **not** good for speech recognition, audio recording, or purchases.

---

## 11. Recommendation

**Build iOS-first, but fix the back button now and keep the font swap ready.**

The back-button gap (§5) is a real bug that should be fixed in Phase 4 regardless of whether
Android ever ships — it costs almost nothing there and it is the kind of thing that becomes
expensive once the session flow has three call sites.

Everything else can wait. The logic is portable, the fallbacks exist, and the two genuinely
Android-shaped decisions — the font substitute and whether Android gets a designed material — are
better made when you know whether anyone is actually on Android. Deferring costs close to zero;
designing for both platforms now taxes the thing that makes this app good.
