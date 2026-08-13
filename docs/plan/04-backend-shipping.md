# Phase 4: Backend, Sync, Shipping + Git Workflow

Backend architecture, offline-first sync, Apple-platform integration, licensing, production
readiness, and a git workflow written for someone who has never used git.

---

## 4.0 How to read this document

Two conventions are used throughout and they matter:

- **`UNVERIFIED:`** marks a claim I could not confirm against the Expo v57 docs, the Supabase
  docs, `node_modules/`, or the repo itself. `AGENTS.md` forbids writing Expo code from memory,
  so anything not verified is labelled rather than asserted. Verify before you build on it.
- **Skill attribution.** Where an Apple-platform claim came from an Axiom skill, the section says
  so. `axiom-shipping` (App Review guidelines, privacy manifests, age rating, export compliance),
  `axiom-integration` (push notification concepts, IAP review requirements), and `axiom-security`
  (Keychain access groups, credential handling) had real surface here. **`axiom-payments` does not
  apply** — it covers Apple Pay, Wallet passes, and Tap to Pay, i.e. real-world payments. This app
  sells digital subscriptions, which is StoreKit/IAP territory (`axiom-integration`), so citing
  `axiom-payments` for monetization would be fabricated applicability. `axiom-apple-docs` is a
  router to Xcode-bundled Swift/framework documentation; there is no Swift in this project, so it
  contributed nothing and is not cited below.

### What I verified in the repo before writing

| Fact | Source | Consequence |
|---|---|---|
| Apple Team ID `R23HRQJN98` ("Discipleship Tech, Inc.") | `app.config.ts` | Real. Use it. |
| EAS project id `654f9e52-e892-44e4-a4b8-9aa700fef15b` | `app.json` → `extra.eas.projectId` | Real. |
| App Store Connect app id `6798466426` | `eas.json` → `submit.production.ios.ascAppId` | Real. |
| `/ios` and `/android` are **gitignored** | `.gitignore` lines 26–27 | §4.7 — never hand-edit `ios/`. |
| Mic + speech-recognition purpose strings **already exist** | `app.json` `ios.infoPlist` | §4.12 — already done, but duplicated. |
| `ITSAppUsesNonExemptEncryption: false` **already set** | `app.json` `ios.infoPlist` | §4.12 — the previous draft told you to add what is already there. |
| `PrivacyInfo.xcprivacy` already generated with `CA92.1`, `C617.1`, `35F9.1` | `ios/ClarityDev/PrivacyInfo.xcprivacy` | §4.12. |
| Entitlements file is an **empty dict** | `ios/ClarityDev/ClarityDev.entitlements` | No SIWA, no push, no App Group yet. |
| `expo-updates@57.0.12` installed; `runtimeVersion.policy: 'appVersion'` | `package.json`, `app.config.ts` | §4.8 — the policy is a live footgun. |
| **Not installed:** `expo-apple-authentication`, `expo-notifications`, `expo-secure-store`, `@supabase/supabase-js`, `react-native-url-polyfill`, `@react-native-async-storage/async-storage` | `node_modules/` | Every one is a native-or-config change → new build. |
| Azure Speech key is an `EXPO_PUBLIC_*` var read in client code | `hooks/use-practice-session.real.ts:592` | §4.12 — it ships inside the JS bundle. |
| Recorded audio is POSTed to Microsoft | `services/azure-pronunciation.ts:136` | §4.12 — this is off-device collection and must be declared. |

---

## 4.1 Identifiers: read them, never invent them

> **CORRECTION (coordinator, post-review).** An earlier revision of this section opened by
> stating *"The owner has changed the bundle identifier to `com.DiscipleshipTech.SpeakTheBible`."*
> **That identifier was fabricated.** It appears nowhere in this repo, in App Store Connect
> metadata, or in anything the owner supplied — verified by a repo-wide grep. It has been removed.
> The irony of an invented identifier appearing inside the section titled "read them, never invent
> them" is noted, and it is exactly why the placeholder discipline below exists. Treat the new
> bundle id as **an open decision the owner has not yet made**, not as a recorded fact.

**Verified identifiers — these are real, read from the repo:**

| Identifier | Value | Source (verified) |
|---|---|---|
| Current bundle id | `com.schroedernathan.clarity` | `app.config.ts:9`, `app.json:19` |
| Dev / preview variants | `…clarity.dev`, `…clarity.preview` | derived in `app.config.ts:11-20` |
| Apple Team ID | `R23HRQJN98` | `app.config.ts:80`, `ios/ClarityDev.xcodeproj/project.pbxproj:420` |
| App Store Connect app id | `6798466426` | `eas.json` → `submit.production.ios.ascAppId` |
| EAS project id | `654f9e52-e892-44e4-a4b8-9aa700fef15b` | `app.json:73` |
| EAS owner | `exponathan` | `app.json:76` |
| Current scheme / slug / name | `clarity` / `clarity` / `Clarity` | `app.json:3-5` |

**Open decision, owner-only — `NEW_BUNDLE_ID_TBD`.** "Speak the Bible" is a different product from
"Clarity", so it probably wants its own bundle id, but **nobody has chosen one and it must not be
guessed.** The reverse-DNS prefix should be one the owner controls. Once chosen, it changes
`BUNDLE_ID` in `app.config.ts:9` and `ios.bundleIdentifier` / `android.package` in `app.json`, and
the `scheme` alongside it. Everything below about new App IDs, dead provisioning profiles, and
non-migrating Keychain/MMKV data applies **only if** the owner decides to change it — see §4.7 for
why it forces a fresh native build.

A genuine alternative worth weighing: **keep `com.schroedernathan.clarity` and just change the
display name.** The bundle id is invisible to users. Keeping it preserves the existing App Store
Connect record (`6798466426`), the provisioning profiles, any TestFlight testers, and all installed
users' local data. Given this repo is a rename-in-progress rather than a fresh product, that is the
lower-risk default, and the burden of proof should sit on changing it.

Changing the bundle id is not a rename. It creates a **new app identity**. Concretely:

- A new App ID must be registered in the Apple Developer portal, and every capability
  (Sign in with Apple, Push Notifications, App Groups) enabled on the *new* one.
- New provisioning profiles. EAS will generate them, but the old ones are dead.
- **Keychain and `expo-secure-store` data does not migrate.** Keychain items live in the access
  group `$(TeamIdentifierPrefix)$(BundleID)` by default (`axiom-security`, keychain access groups).
  A new bundle id means a new default access group, so any stored session token is unreachable.
  Every existing installed build is effectively a different app.
- **MMKV data does not migrate** either — it lives in the app container, and the new bundle id
  installs to a new container. `UNVERIFIED:` whether the owner has real users on
  `com.schroedernathan.clarity` in production. If yes, this needs a migration story or a clean
  break; if it has only ever been TestFlight/dev, just take the clean break now. Do this before
  first public release, not after.
- App Store Connect app id `6798466426` was created against the old bundle id. `UNVERIFIED:` a
  bundle identifier on an existing ASC app record cannot be changed once a version has been
  submitted for review — confirm in App Store Connect whether `6798466426` is reusable or whether
  you need a brand-new app record (and therefore a new `ascAppId` in `eas.json`).

### The identifiers you still do not have

Two things in this plan genuinely require a value nobody has supplied. They are written as
placeholders in ALL CAPS. **Do not let anyone, including an AI, fill these in by guessing** — a
wrong identifier here produces a provisioning failure at build time or a silent SSO failure at
runtime, and both are slow to diagnose.

| Placeholder | What it is | Where to get it |
|---|---|---|
| `group.SHARED_APP_GROUP_ID_TBD` | The iOS App Group shared by this app and Holy Scroll | You choose it, then register it in the Apple Developer portal → Identifiers → App Groups. Convention is `group.` + a reverse-DNS string you control, e.g. `group.<your-reverse-dns>.shared`. Both apps must list the identical string. |
| `HOLY_SCROLL_BUNDLE_ID_TBD` | Holy Scroll's iOS bundle identifier | Read it out of the Holy Scroll project's own `app.json`/`app.config.ts`, or App Store Connect. |

An App Group also only works if **both apps are on the same Apple Developer Team**. Clarity /
Speak the Bible is on `R23HRQJN98`. `UNVERIFIED:` whether Holy Scroll ships under the same team.
If it does not, §4.11's local SSO is impossible and only the Supabase-account path works.

---

## 4.2 Auth: Sign in with Apple

**Decision (kept from the draft — it was right): stay anonymous and local by default.** Do not
show a login wall. Prompt for sign-in only when the user reaches for something that genuinely
needs an account: a second device, restoring purchases, or the paywall. A Bible-reading app whose
first screen is a login form loses people who would have read Genesis 1.

### The rule, stated correctly

The previous draft said Sign in with Apple is required "since you will use Supabase Auth (which
supports multiple providers)." **That reasoning is wrong and worth correcting explicitly, because
it would lead you to build the wrong thing.** Your backend's capabilities are invisible to App
Review. What matters is what the app *offers on screen*.

**App Store Review Guideline 4.8** requires that you offer Sign in with Apple as an equivalent
option **whenever your app offers any third-party or social login** (`axiom-shipping`,
app-store-submission anti-pattern #5: "Guideline 4.8 requires SIWA as an option whenever ANY
third-party or social login is offered. Apple enforces this strictly."). The Expo v57 docs restate
the same rule: "Any app that includes third-party authentication options must provide Apple
authentication."

Applied to this app's actual login options:

| If the sign-in sheet offers… | Is SIWA required by 4.8? |
|---|---|
| Sign in with Apple only | Not applicable — you already have it |
| Apple + email/password (Supabase native) | `UNVERIFIED:` — plain email/password to *your own* backend is generally treated as first-party, not third-party, so 4.8 is not triggered by it. Since you are shipping Apple anyway, this is moot. |
| Apple + Google | Yes — and you have it |
| **Google or email-magic-link only, no Apple** | **Yes. This is the rejection.** |

**Recommendation: ship Sign in with Apple as the only sign-in method at launch.** It satisfies 4.8
by construction, it is one native sheet with no password reset flow to build, and it is the lowest
friction option on the platform you are launching on. Add Google later if Android becomes real —
and when you do, Apple must stay.

Two obligations that come attached to *having accounts at all*, both from `axiom-shipping`:

- **Guideline 5.1.1(v) — account deletion.** If the app can create an account, it must delete one,
  in-app, discoverable, and it must be real deletion rather than deactivation. When SIWA is used
  you must **also revoke the Apple token** as part of deletion. Budget this as real work in Phase 2;
  it is a hard rejection, not a nag. Server side: an Edge Function that runs
  `auth.admin.deleteUser()` (the `ON DELETE CASCADE` in §4.5 then removes every row) plus a call to
  Apple's token revocation endpoint. `UNVERIFIED:` the exact Apple revocation endpoint and whether
  `expo-apple-authentication` exposes a revoke helper — the v57 docs list
  `signInAsync`, `refreshAsync`, `getCredentialStateAsync`, `isAvailableAsync`, `formatFullName`,
  and `AppleAuthenticationButton`, with no revoke function among them, so this is likely a
  server-to-Apple REST call.
- **Guideline 5.1.1(i) — privacy policy** reachable both in App Store Connect metadata *and* from
  inside the app. See §4.12.

### Expo integration (verified against the v57 docs)

```bash
npx expo install expo-apple-authentication
```

Verified from `https://docs.expo.dev/versions/v57.0.0/sdk/apple-authentication/`:

- A **config plugin is required**: add `"expo-apple-authentication"` to `plugins`.
- You must **also** set `ios.usesAppleSignIn: true`. This is the step people miss; the plugin alone
  is not the whole story.
- The plugin adds the `com.apple.developer.applesignin` entitlement with value `Default`. Today
  `ios/ClarityDev/ClarityDev.entitlements` is an empty `<dict/>`, so you can confirm the plugin
  worked by re-running prebuild and seeing the key appear.
- **iOS/tvOS only.** There is no Android path. Android needs Google or email.
- The docs say it "works in Expo Go for testing," but that "identifiers and values received will
  likely differ from standalone apps." Treat Expo Go results as non-authoritative and test the
  real flow on a development build (§4.7).
- The "Sign In with Apple" capability must be enabled on your App ID in the Apple Developer portal
  — for the **new** bundle id from §4.1.

Because this project already has `plugins` composed in `app.config.ts` on top of `app.json`, add
the string to the `app.json` `plugins` array (the base layer, where `expo-router`, `expo-font`,
`expo-audio`, `expo-speech-recognition`, `expo-asset` already live) and leave `app.config.ts`'s
array for the variant-specific entries it already handles.

### Exchanging the Apple credential for a Supabase session

Verified from the Supabase Apple provider docs:

```ts
const credential = await AppleAuthentication.signInAsync({
  requestedScopes: [
    AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
    AppleAuthentication.AppleAuthenticationScope.EMAIL,
  ],
});

const { data, error } = await supabase.auth.signInWithIdToken({
  provider: 'apple',
  token: credential.identityToken!,
});
```

Dashboard configuration, verified: under **Authentication → Providers → Apple**, register every
bundle identifier that will use this Supabase project in the **Client IDs** field. That means
`NEW_BUNDLE_ID_TBD` (or the existing `com.schroedernathan.clarity` if you keep it), plus `.dev` and `.preview` if you want sign-in to work in
those variants, plus `HOLY_SCROLL_BUNDLE_ID_TBD`. A **Services ID and signing key are needed only
for web OAuth**, not for native iOS; native-only setups need no secret rotation. If you later add
web, the Services ID must be listed **first** in Client IDs.

Nonce: the Supabase docs' Expo example passes no nonce. Flutter and Swift examples do.
`UNVERIFIED:` whether Supabase validates a nonce for the Expo path — if you want the stronger
replay protection, generate a raw nonce, pass its SHA-256 to `signInAsync`, and the raw value to
`signInWithIdToken`, and test that it does not break the exchange.

**Private-relay emails** (kept from the draft, it was correct): users can hide their real address
and you receive an `@privaterelay.appleid.com` proxy. If Supabase ever sends outbound mail to
those addresses — password resets, receipts, re-engagement — you must register the sending domain
in the Apple Developer portal under "Sign in with Apple for Email Communication" with SPF/DKIM
verified, or Apple silently drops the mail. If you ship Apple-only sign-in with no transactional
email, this does not bite you yet. Note it so it does not surprise you later.

---

## 4.3 The Supabase client on React Native

This is the section the previous draft skipped entirely, and it is where a naive
`createClient(url, key)` fails at runtime.

```bash
npx expo install @supabase/supabase-js react-native-url-polyfill
```

Three React-Native-specific requirements, all verified against the Supabase docs:

1. **A URL polyfill.** `import 'react-native-url-polyfill/auto'` must run before the client is
   created. Hermes/React Native does not ship a complete WHATWG `URL` implementation and
   `supabase-js` relies on it.
2. **An explicit storage adapter.** There is no `localStorage`. Without `auth.storage`, sessions do
   not persist and the user is logged out on every cold start.
3. **`detectSessionInUrl: false`.** That option exists for browser OAuth redirects. Leaving it on in
   a native app is wrong.

### Which storage adapter — use MMKV, not AsyncStorage

The Supabase docs' Expo sample uses `@react-native-async-storage/async-storage`. **Do not add it.**
This project already ships `react-native-mmkv@4.3.2`, which is faster and already the storage layer
for everything else. Adding AsyncStorage means a second native dependency and a second storage
engine for one job.

`expo-secure-store` is also the wrong primary choice, and for a specific verified reason: the v57
docs warn that "large payloads can be rejected by the underlying platform. Historically, some iOS
releases refused values above roughly 2048 bytes." A Supabase session is a JSON blob containing an
access JWT plus a refresh token; it can approach or exceed that. Storing the whole session in
SecureStore is a latent, size-dependent failure.

**Recommendation:** MMKV as the session store, with MMKV's own encryption key held in
`expo-secure-store`. MMKV v4 supports an encryption key at instance construction. SecureStore holds
one short random string (well under the size limit), MMKV holds the session blob encrypted at rest.
That is the same shape as the pattern the Supabase docs describe with `aes-js`, but using the
native encryption already in a dependency you ship. `UNVERIFIED:` the exact MMKV v4 constructor
option name for the encryption key — read `node_modules/react-native-mmkv` types before writing it.

Runner-up rejected: plain unencrypted MMKV. Simpler, and honestly acceptable for a Bible reading
app — the token grants access to nothing but the user's own chapter progress. If the encryption key
plumbing turns into a time sink, ship plain MMKV and revisit. Do not ship AsyncStorage.

```ts
// services/supabase.ts   — new file, Phase 2
import 'react-native-url-polyfill/auto';
import { AppState } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import { MMKV } from 'react-native-mmkv';

const authStore = new MMKV({ id: 'supabase-auth' });

// supabase-js accepts sync or promise-returning adapters; MMKV is synchronous.
const MmkvAuthStorage = {
  getItem: (key: string) => authStore.getString(key) ?? null,
  setItem: (key: string, value: string) => { authStore.set(key, value); },
  removeItem: (key: string) => { authStore.delete(key); },
};

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  {
    auth: {
      storage: MmkvAuthStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);
```

`UNVERIFIED:` that `supabase-js` accepts a fully synchronous storage adapter. The documented
adapters return promises. If the types complain, wrap each method in `Promise.resolve(...)` — the
interface tolerates promises either way, so wrapping is the safe default.

### Token refresh on foreground — required, and easy to miss

Verified from the `startAutoRefresh` reference: "On non-browser platforms the refresh process works
*continuously* in the background, which may not be desirable… you should hook into your platform's
foreground indication mechanism." Without this, a backgrounded app keeps a refresh timer alive and
burns battery; and after a long background stint the first request can fire with a stale token.

```ts
// register exactly once, at module scope in services/supabase.ts
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
```

The docs' own comment is "make sure you register this only once!" — module scope, not inside a
component, or every mount adds another listener.

### Environment variables

`.env.example` currently declares `AI_GATEWAY_API_KEY`, `AI_COACH_MODEL`, `APP_VARIANT`,
`EXPO_PUBLIC_AZURE_SPEECH_KEY`, `EXPO_PUBLIC_AZURE_SPEECH_REGION`, `EXPO_PUBLIC_OBSERVE_IN_DEV`.
Add two:

```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Understand exactly what `EXPO_PUBLIC_` means: **the value is inlined into the JavaScript bundle and
is readable by anyone who downloads your app.** That is fine and intended for the Supabase
publishable (anon) key — it is designed to be public, and RLS is what actually protects the data.
It is *not* fine for a service-role key. Never put `SUPABASE_SERVICE_ROLE_KEY` in an
`EXPO_PUBLIC_` variable, and never import it into anything under `app/`, `components/`, `hooks/`,
`lib/`, or `services/`. Service-role work belongs in Supabase Edge Functions or the existing
server-route pattern (`app/api/speech-coach+api.ts`).

Note that Supabase has renamed "anon key" to "publishable key" in current docs; the sample code
reads `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Either name works as a variable — pick one and be
consistent. Values live in `.env.local` (already gitignored, see §4.14) and in EAS environment
variables per `eas.json`'s `environment: development | preview | production`, pulled locally with
`eas env:pull` exactly as `app.config.ts`'s comment already describes for `APP_VARIANT`.

---

## 4.4 Sync architecture: the offline-first engine, in detail

**Decision (kept from the draft — the reasoning holds): Supabase, not CloudKit.** The owner is
already invested in Supabase, and the deciding factor is Holy Scroll: CloudKit containers are
per-team Apple-only silos, and cross-app data sharing means either the same container (coupling two
apps' schemas) or a bridge. Supabase gives you one API both apps hit, plus Android and web later.
Runner-up rejected: CloudKit + `NSUbiquitousKeyValueStore`, which would be free, need no auth, and
sync silently — genuinely attractive for a single-platform app, but it forecloses Android, forecloses
web, and makes the Holy Scroll interlink awkward. Both is worst: two sync engines, two conflict
models, twice the bugs.

**MMKV stays the single source of truth for the UI.** Nothing in the render path ever awaits the
network. `lib/history-store.ts` is untouched by sync; sync reads from it and writes to it, and the
UI never knows sync exists. This is non-negotiable — the app must be fully usable in airplane mode,
which is a real condition for someone reading scripture aloud on a plane or in a basement.

### The queue

A new MMKV namespace, following the existing discipline in `lib/history-schema.ts` (`s/` records,
`q/` quarantine, `w/` word aggregates, `p/` passage, `meta/` metadata):

```
sync/<paddedEnqueuedAtMs>/<paddedSeq>   pending operations  (FIFO by key order)
dead/<paddedEnqueuedAtMs>/<paddedSeq>   operations that exhausted retries
meta/syncOwnerUserId                    which account this device's data belongs to
meta/syncCursor                         server-side watermark for incremental pull
```

The padded-timestamp-plus-sequence key format is the same trick `s/` already uses so that
"lexicographic order == chronological order" and `getAllKeys()` needs no sort. Reuse it; do not
invent a new key shape. The `dead/` namespace mirrors the existing `q/` quarantine idea — failures
are parked and inspectable, never silently dropped.

```ts
// types/sync.ts — new file
export type SyncOp =
  | { kind: 'progress'; translation: string; bookId: number; chapter: number;
      maxVerse: number; completed: boolean }
  | { kind: 'completion'; clientId: string; translation: string; bookId: number;
      chapter: number; completedAtMs: number; localDate: string; durationMs: number }
  | { kind: 'session'; clientId: string; recordKey: string }
  | { kind: 'discovery'; term: string; category: 'word' | 'name' | 'place'; localDate: string }
  | { kind: 'goal'; targetChapters: number; updatedAtMs: number };

export type QueueEntry = {
  op: SyncOp;
  attempts: number;
  nextAttemptAtMs: number;
  lastError?: string;
};
```

Every `SyncOp` must be **idempotent**, because delivery is at-least-once: the app can be killed
between "server committed" and "local queue entry deleted," and the op will be retried. Idempotency
is achieved differently per kind:

- `progress` — idempotent by construction. It is a MAX/OR merge (§4.5's `sync_progress` function);
  applying it twice is applying it once.
- `completion`, `session`, `discovery` — carry a **client-generated `clientId`** (a UUID minted when
  the op is enqueued, *not* when it is sent) and are written with
  `upsert(..., { onConflict: 'user_id,client_id', ignoreDuplicates: true })` against a UNIQUE
  constraint. Retry becomes a no-op.
- `goal` — last-writer-wins on `updatedAtMs`, enforced server-side by a `where updated_at_ms <
  excluded.updated_at_ms` guard so an out-of-order retry cannot resurrect an old value.

### Retry and backoff

Exponential backoff with full jitter, capped, and bounded by attempt count:

```
delay = min(CAP, BASE * 2^attempts) * random(0.5, 1.0)
BASE = 2_000 ms
CAP  = 5 * 60_000 ms   (5 minutes)
MAX_ATTEMPTS = 8       (~ tens of minutes of wall-clock retrying)
```

Jitter matters: without it, every device that lost connectivity during the same outage retries in
lockstep and hammers the server the instant it returns.

Classify errors before retrying — blind retry is how you spin forever on an error that will never
succeed:

| Failure | Action |
|---|---|
| Network unreachable / timeout / 5xx / 429 | Retry with backoff. Honour `Retry-After` on 429 if present. |
| 401 / 403 (expired or missing session) | **Do not count an attempt.** Pause the whole queue, refresh the session, resume. A token expiry must not burn the retry budget. |
| 400 / 422 (malformed op, schema drift) | Do not retry. Move to `dead/` immediately and log. This is a bug in the client, and retrying cannot fix a bug. |
| RLS denial | Same as 400 — the op is addressed to a row this user cannot touch. Park it; it signals an account-identity bug (see the ownership guard below). |
| Attempts exhausted | Move to `dead/`. Surface a quiet, non-modal "some progress hasn't synced" affordance with a manual retry. Never a blocking error dialog — the user's reading is not blocked, and neither is their trust. |

Drain triggers: on app foreground (`AppState` → `active`), after each session is recorded, and on
network regain. `UNVERIFIED:` whether this project has a connectivity signal available —
`@react-native-community/netinfo` is **not** installed, and I did not confirm an Expo v57
equivalent. Foreground + post-session is sufficient without it; do not add a dependency for this
until it proves necessary.

Do the drain in a single serial loop with a re-entrancy guard, not `Promise.all` over the queue.
Order matters (a `completion` for a chapter should not land before the `progress` row exists) and
parallel writes to the same rows invite contention for no gain at this volume.

Background sync: **do not**. `expo-background-task` is not installed, background execution on iOS is
unreliable and discretionary, and syncing chapter progress does not need it. Foreground sync is
correct here, and it is one less native dependency and one less `UIBackgroundModes` entry to justify
to App Review.

### Conflict resolution — where the draft was right, and where it was wrong

**Right:** monotonic MAX is the correct strategy for reading position, and it is why this design
needs no vector clocks or CRDT library. `max_verse` only ever grows. `completed` only ever goes
false→true. Merging is `GREATEST()` and `OR`, order-independent, and idempotent. Keep this.

**Wrong:** the draft applied the same logic to `repeat_count`, and repeat counts are **not**
MAX-mergeable. Consider: phone and iPad both offline, user reads Genesis 1 once on each. Both push
`repeat_count = 1`. `MAX(1, 1) = 1` — one read is silently lost. Use `SUM` instead and a single
retried op double-counts.

**The fix: repeat count is a derived count over an append-only event log, never a stored integer.**
This is the same discipline the codebase already enforces for scores — `types/history.ts` keeps
"RAW MEASURES ONLY — there is deliberately no persisted score," and every consumer recomputes via
`speakingScore(record)`. Apply that principle here: store the events, derive the count.

One row per chapter completion in `chapter_completions`, keyed by `(user_id, client_id)`. Repeat
count is `count(*)` over that table. Now: both devices insert one row each with distinct
`clientId`s, the count is 2, and retrying either insert is a no-op. Correct offline, correct
concurrent, correct on retry.

The same argument kills the draft's `streaks` table. `current_streak INTEGER` is a derived value and
is not mergeable — two devices each incrementing it produce a wrong answer, and there is no merge
function that fixes it. Replace it with `activity_days (user_id, local_date)`, a **set**. Set union
is order-independent and idempotent, and the streak is computed from the set exactly the way
`lib/stats.ts` already computes it locally. Same code path, no server logic to keep in sync with the
client's definition of a streak.

### Device clock skew

The device clock is user-settable and sometimes just wrong. Two rules:

1. **Never order server state by a device timestamp.** Every table carries
   `server_updated_at timestamptz not null default now()`, and incremental pull uses that. Device
   timestamps (`completed_at_ms`) are stored for display and for local-day math, and are never the
   ordering key. A device with a clock set to 2035 then corrupts nothing but its own display.
2. **Local-day computation stays on the device, and its *result* is what syncs.** The existing
   `SessionRecord` already snapshots `tzOffsetMinutes` precisely so "streaks survive travel/DST."
   Preserve that: the client computes `localDate` as a `YYYY-MM-DD` string from
   `completedAt + tzOffsetMinutes` and syncs the string. The server never converts a UTC instant to
   a calendar day, because only the device knows which timezone the user was actually in.

Add a sanity clamp: reject a `completedAtMs` more than ~24h in the future relative to server
`now()`. A `check` constraint cannot see `now()` usefully across timezones, so do it in the
`sync_progress` function (§4.5) and park the op in `dead/` rather than writing a row that will
poison the user's streak forever.

### First login when both sides have data

This is the scenario that eats user data if you get it wrong, and the draft did not address it at
all. The user read 40 chapters anonymously on their phone; they now sign into an account that
already has 12 chapters from an iPad. **Neither side may win.**

The wrong implementations, named so they are recognisable:

- Pull remote and overwrite local → destroys the 40 chapters. Unrecoverable.
- Push local and overwrite remote → destroys the iPad's 12.
- "Latest wins" on a timestamp → destroys whichever side lost, arbitrarily.

**The correct sequence, in order:**

```
0. Ownership check. Read meta/syncOwnerUserId.
   - null (never signed in)          → this is anonymous local data. Proceed to merge.
   - equals the user who just signed in → same account returning. Proceed to merge.
   - a DIFFERENT non-null user id     → STOP. Do not merge. See "account switching" below.

1. Enqueue, do not send. Walk every local progress row, chapter completion, and
   discovery and enqueue a SyncOp for each. Enqueueing is a local MMKV write, so a
   crash here is safe and resumable.

2. Write meta/syncOwnerUserId = the signed-in user id. Do this BEFORE the first
   network call, so a crash mid-merge cannot later be mistaken for a fresh
   anonymous install.

3. Drain the queue upward. Every op is a merge (MAX / OR / insert-if-absent),
   never a replace. After this the server holds the union.

4. Pull the merged state down with a full read (syncCursor is null on first login).

5. Merge downward into MMKV with the same MAX/OR/union rules. Only ever raise
   max_verse, only ever flip completed false→true, only ever add completion rows
   and discovered terms. Never lower, never delete.

6. Write meta/syncCursor. Subsequent syncs are incremental on server_updated_at.
```

Because every step is a merge and every op is idempotent, this sequence is **safe to interrupt at
any point**. Killed at step 3? The queue still holds the un-drained ops; the next foreground
resumes. There is no window in which data is deleted, so there is no window in which a crash loses
it.

**Account switching** (step 0's third branch) is the case nobody plans for and everybody eventually
hits — a shared family iPad, or the owner testing with two accounts. Do not silently merge one
person's reading history into another's. Stop and ask, in plain language: *"This device has reading
progress from a different account. Keep this device's progress and add it to <new account>, or
replace it with <new account>'s progress from the cloud?"* Default the destructive option to
non-default. Without this guard, a shared device silently blends two people's scripture reading and
there is no way to unblend it.

**Recommendation on anonymous auth: do not use Supabase `signInAnonymously()`.** Stay genuinely
unauthenticated — no session, no user row, no network — until the user chooses to sign in, then run
the merge above. Runner-up rejected: anonymous sign-in plus `linkIdentity`, which is the officially
blessed path and makes the client code more uniform (there is always a session). Rejected because it
mints a database user row for every install including the ones that never come back, which needs a
cleanup job, inflates your user counts, and complicates RLS with a "is this a real user" question.
The merge logic above is needed either way, so anonymous auth buys uniformity at the cost of
operational debt.

---

## 4.5 Supabase schema and RLS

The draft's DDL was a reasonable start. This revises it for the correctness problems in §4.4
(append-only completions, `activity_days` instead of a stored streak, client-side idempotency ids,
server-side ordering column) and adds the RLS the draft hand-waved.

Design notes carried over from the codebase: `translation` is a **text column, never a hardcoded
`'KJV'`** — the brief is explicit that other translations are coming and "the design must not
hardcode 'KJV' into application logic." `book_id` is the integer 1–66 matching `KJV_books.id`, so
the OT/NT split is `book_id <= 39` and needs no extra column.

```sql
-- ============================================================
-- Phase 3 migration. Run in the Supabase SQL editor, or better,
-- as a file under supabase/migrations/ so it is reviewable in git.
-- ============================================================

-- ---------- devices: one row per install, for push tokens ----------
create table public.devices (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  push_token    text not null,
  platform      text not null check (platform in ('ios','android')),
  app_id        text not null,              -- 'speakthebible' | 'holyscroll'
  created_at    timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  unique (user_id, push_token)
);

-- ---------- reading_progress: the MAX-mergeable position ----------
-- No repeat_count here. Repeats are counted from chapter_completions.
create table public.reading_progress (
  user_id       uuid not null references auth.users(id) on delete cascade,
  translation   text    not null,
  book_id       int     not null check (book_id between 1 and 66),
  chapter       int     not null check (chapter > 0),
  max_verse     int     not null default 0 check (max_verse >= 0),
  completed     boolean not null default false,
  last_read_at_ms  bigint,                  -- device clock, display only
  server_updated_at timestamptz not null default now(),
  primary key (user_id, translation, book_id, chapter)
);

-- ---------- chapter_completions: append-only event log ----------
-- One row per completed read. repeat_count == count(*). Never updated.
create table public.chapter_completions (
  user_id       uuid not null references auth.users(id) on delete cascade,
  client_id     uuid not null,              -- minted on device; idempotency key
  translation   text  not null,
  book_id       int   not null check (book_id between 1 and 66),
  chapter       int   not null check (chapter > 0),
  completed_at_ms bigint not null,          -- device clock
  local_date    date   not null,            -- computed on device from tzOffsetMinutes
  duration_ms   int    not null default 0,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, client_id)
);

-- ---------- session_records: the synced mirror of MMKV s/ ----------
-- Raw measures only. No score column, matching types/history.ts.
create table public.session_records (
  user_id       uuid not null references auth.users(id) on delete cascade,
  client_id     uuid not null,
  mode          text not null,              -- 'passage'|'drill'|'freestyle'|'bible'
  translation   text,
  book_id       int,
  chapter       int,
  duration_ms   int  not null default 0,
  word_count    int  not null default 0,
  filler_count  int  not null default 0,
  ended_reason  text not null,
  completed_at_ms bigint not null,
  local_date    date not null,
  tz_offset_minutes int not null,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, client_id)
);

-- ---------- activity_days: a SET. Streaks are derived from it. ----------
create table public.activity_days (
  user_id    uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  primary key (user_id, local_date)
);

-- ---------- lexicon_discoveries ----------
create table public.lexicon_discoveries (
  user_id       uuid not null references auth.users(id) on delete cascade,
  term          text not null,
  category      text not null check (category in ('word','name','place')),
  first_seen_translation text,
  first_seen_book_id     int,
  first_seen_chapter     int,
  local_date    date not null,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, category, term)     -- natural idempotency: discovered once
);

-- ---------- user_settings: daily goal and friends ----------
create table public.user_settings (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  target_chapters  int  not null default 1 check (target_chapters between 1 and 50),
  reminder_hour    int  check (reminder_hour between 0 and 23),
  updated_at_ms    bigint not null default 0,   -- LWW guard
  server_updated_at timestamptz not null default now()
);
```

### Indexes

The primary keys already cover the hot lookups (`reading_progress` is keyed
user-first, so "all progress for this user" is a PK range scan). What the PKs do *not* cover is the
incremental pull and the append-only tables' user scans:

```sql
create index reading_progress_sync_idx     on public.reading_progress (user_id, server_updated_at);
create index chapter_completions_lookup_idx on public.chapter_completions (user_id, translation, book_id, chapter);
create index chapter_completions_sync_idx  on public.chapter_completions (user_id, server_updated_at);
create index session_records_sync_idx      on public.session_records (user_id, server_updated_at);
create index devices_user_idx              on public.devices (user_id);
create index lexicon_discoveries_sync_idx  on public.lexicon_discoveries (user_id, server_updated_at);
```

The Supabase RLS docs are explicit that this is not optional: "Make sure you've added indexes on
any columns used within the Policies which are not already indexed (or primary keys)." Every policy
below filters on `user_id`, and every `user_id` above is either the leading PK column or explicitly
indexed.

### RLS, per table, per operation

A single `FOR ALL` policy — what the draft proposed — is wrong in a way that matters, not merely
lazy. `FOR ALL USING (auth.uid() = user_id)` lets a client **UPDATE and DELETE** rows in
`chapter_completions` and `session_records`. Those tables are append-only event logs whose entire
correctness argument (§4.4) rests on rows never changing. A client that can delete completions can
silently rewrite its own history, and a buggy client will.

Three rules applied below, all verified against the Supabase RLS documentation:

1. **Wrap `auth.uid()` in a subselect** — `(select auth.uid())`, not bare `auth.uid()`. The docs'
   benchmark table shows this single change taking a query from 179 ms to 9 ms, a 94.97%
   improvement, because it lets Postgres evaluate the function once per statement rather than once
   per row.
2. **Always specify `to authenticated`.** The docs mark this "(recommended)". It stops the policy
   from even being evaluated for anonymous requests.
3. **`using` for reading existing rows, `with check` for new/modified row data.** And the documented
   trap: *"To perform an UPDATE operation, a corresponding SELECT policy is required. Without a
   SELECT policy, the UPDATE operation will not work as expected."* Every table that permits UPDATE
   below also has a SELECT policy.

```sql
-- ============================================================
-- Enable RLS on every table. A table in the public schema
-- without RLS is world-readable through the API.
-- ============================================================
alter table public.devices              enable row level security;
alter table public.reading_progress     enable row level security;
alter table public.chapter_completions  enable row level security;
alter table public.session_records      enable row level security;
alter table public.activity_days        enable row level security;
alter table public.lexicon_discoveries  enable row level security;
alter table public.user_settings        enable row level security;

-- ---------- reading_progress: select + insert + update, NO delete ----------
create policy "progress_select_own" on public.reading_progress
  for select to authenticated
  using ( (select auth.uid()) = user_id );

create policy "progress_insert_own" on public.reading_progress
  for insert to authenticated
  with check ( (select auth.uid()) = user_id );

-- using = which rows may be targeted; with check = what the new row may contain.
-- Both are needed, or a user could update their own row INTO someone else's user_id.
create policy "progress_update_own" on public.reading_progress
  for update to authenticated
  using      ( (select auth.uid()) = user_id )
  with check ( (select auth.uid()) = user_id );

-- No DELETE policy. Reading position is never deleted by a client.
-- Account deletion happens via ON DELETE CASCADE, which bypasses RLS.

-- ---------- chapter_completions: APPEND-ONLY ----------
create policy "completions_select_own" on public.chapter_completions
  for select to authenticated
  using ( (select auth.uid()) = user_id );

create policy "completions_insert_own" on public.chapter_completions
  for insert to authenticated
  with check ( (select auth.uid()) = user_id );

-- Deliberately no UPDATE and no DELETE policy. This is the constraint that makes
-- repeat_count = count(*) trustworthy.

-- ---------- session_records: APPEND-ONLY ----------
create policy "sessions_select_own" on public.session_records
  for select to authenticated using ( (select auth.uid()) = user_id );
create policy "sessions_insert_own" on public.session_records
  for insert to authenticated with check ( (select auth.uid()) = user_id );

-- ---------- activity_days: insert-only set ----------
create policy "days_select_own" on public.activity_days
  for select to authenticated using ( (select auth.uid()) = user_id );
create policy "days_insert_own" on public.activity_days
  for insert to authenticated with check ( (select auth.uid()) = user_id );

-- ---------- lexicon_discoveries: insert-only ----------
create policy "lexicon_select_own" on public.lexicon_discoveries
  for select to authenticated using ( (select auth.uid()) = user_id );
create policy "lexicon_insert_own" on public.lexicon_discoveries
  for insert to authenticated with check ( (select auth.uid()) = user_id );

-- ---------- user_settings: full CRUD except delete ----------
create policy "settings_select_own" on public.user_settings
  for select to authenticated using ( (select auth.uid()) = user_id );
create policy "settings_insert_own" on public.user_settings
  for insert to authenticated with check ( (select auth.uid()) = user_id );
create policy "settings_update_own" on public.user_settings
  for update to authenticated
  using      ( (select auth.uid()) = user_id )
  with check ( (select auth.uid()) = user_id );

-- ---------- devices: a user may remove their own device ----------
create policy "devices_select_own" on public.devices
  for select to authenticated using ( (select auth.uid()) = user_id );
create policy "devices_insert_own" on public.devices
  for insert to authenticated with check ( (select auth.uid()) = user_id );
create policy "devices_update_own" on public.devices
  for update to authenticated
  using      ( (select auth.uid()) = user_id )
  with check ( (select auth.uid()) = user_id );
create policy "devices_delete_own" on public.devices
  for delete to authenticated using ( (select auth.uid()) = user_id );
```

### The merge function

`reading_progress` needs a real upsert-with-MAX, which plain `.upsert()` cannot express. A
`security invoker` function keeps RLS in force (a `security definer` function would bypass the
policies above, which is exactly what you do not want here):

```sql
create or replace function public.sync_progress(
  p_translation text,
  p_book_id     int,
  p_chapter     int,
  p_max_verse   int,
  p_completed   boolean,
  p_last_read_at_ms bigint
) returns void
language plpgsql
security invoker          -- RLS applies. Do NOT make this security definer.
set search_path = ''
as $$
begin
  -- Reject an implausible device clock rather than poisoning the row.
  if p_last_read_at_ms is not null
     and p_last_read_at_ms > (extract(epoch from now()) * 1000) + 86_400_000 then
    raise exception 'last_read_at_ms is more than 24h in the future';
  end if;

  insert into public.reading_progress as rp
    (user_id, translation, book_id, chapter, max_verse, completed, last_read_at_ms)
  values
    ((select auth.uid()), p_translation, p_book_id, p_chapter,
     p_max_verse, p_completed, p_last_read_at_ms)
  on conflict (user_id, translation, book_id, chapter) do update
    set max_verse       = greatest(rp.max_verse, excluded.max_verse),
        completed       = rp.completed or excluded.completed,
        last_read_at_ms = greatest(
          coalesce(rp.last_read_at_ms, 0), coalesce(excluded.last_read_at_ms, 0)),
        server_updated_at = now();
end;
$$;
```

`greatest` / `or` make this idempotent and order-independent, which is the whole point: replaying
this call any number of times in any order converges on the same row. Called from the client as
`supabase.rpc('sync_progress', { ... })`.

`set search_path = ''` is a hardening habit for any Postgres function — it prevents a
search-path-shadowing attack and is why every table above is written fully qualified as
`public.<table>`.

Repeat counts, streaks, and totals are then plain reads:

```sql
-- repeat count for one chapter
select count(*) from public.chapter_completions
where user_id = (select auth.uid())
  and translation = $1 and book_id = $2 and chapter = $3;

-- whole-Bible progress
select count(*) filter (where completed) as chapters_done
from public.reading_progress
where user_id = (select auth.uid()) and translation = $1;
```

If you wrap any of these in a **view**, note the documented trap: views bypass RLS by default
because Postgres creates them `security definer`. Create them `with (security_invoker = true)` so
they obey the underlying policies.

### Verification, not assumption

After running the migration, do not assume RLS works — prove it. Supabase ships an advisor for
exactly this; run it, and separately, sign in as user A and attempt to read user B's rows. The
expected result is zero rows, not an error. A policy that is subtly wrong usually fails open.

---

## 4.6 Notifications

**Decision (kept from the draft — correct and worth keeping): local notifications only, at launch.**
Streak reminders are scheduled on-device, which means no push token to manage, no APNs key, no
server cron, no `devices` table traffic, and no notification permission needed for the app to
function. It also cannot leak a user's reading habits to a server that does not need them.

**Nuance the draft missed:** it said to "cancel any pending streak reminders and schedule a new
local notification for 24 hours later." A rolling 24-hour offset drifts — read at 9pm Monday and
the Tuesday reminder lands at 9pm, read at 11pm Tuesday and Wednesday's lands at 11pm, and within a
week you are notifying someone at 2am. Use a **fixed local time of day** instead
(`SchedulableTriggerInputTypes.DAILY` with `hour`/`minute`, verified present in the v57 API), with
the hour user-settable via `user_settings.reminder_hour`, and cancel-and-reschedule only when the
user changes it. Then cancel the *pending* reminder for today once a session is recorded, so
someone who has already read is never nagged.

### Expo integration (verified against the v57 docs)

```bash
npx expo install expo-notifications
```

- **Config plugin required.** Verified options: `icon`, `color`, `defaultChannel`, `sounds`,
  `enableBackgroundRemoteNotifications`.
- **Expo Go:** verified quote — "Push notifications (remote notifications) functionality provided by
  `expo-notifications` is unavailable in Expo Go on Android from SDK 53. A development build is
  required to use push notifications. **Local notifications (in-app notifications) remain available
  in Expo Go.**" Since the recommendation is local-only, Expo Go remains usable for iterating on
  copy and timing.
- Verified API surface: `requestPermissionsAsync`, `setNotificationHandler`,
  `scheduleNotificationAsync`, `cancelScheduledNotificationAsync`,
  `cancelAllScheduledNotificationsAsync`, `getNextTriggerDateAsync`, and
  `SchedulableTriggerInputTypes` with `.TIME_INTERVAL`, `.DAILY`, `.WEEKLY`, `.MONTHLY`, `.YEARLY`,
  `.CALENDAR`, `.DATE`.
- Verified iOS entitlement behaviour: "The iOS APNs entitlement is *always* set to 'development'.
  Xcode automatically changes this to 'production' in the archive generated by a release build."
  So the `aps-environment` value you see in the prebuilt project is expected and not a bug.
- `enableBackgroundRemoteNotifications: true` adds `remote-notification` to `UIBackgroundModes`.
  **Leave it false.** You do not need it, and an unjustified background mode is a review question
  you would rather not answer.

Permission timing (`axiom-integration`, push-notifications): do **not** request notification
permission at first launch. Ask after the user has finished a chapter and the reminder has obvious
value. `axiom-integration` also documents **provisional authorization** (`.provisional`), which
delivers quietly to Notification Center with no permission prompt at all and lets the user promote
it later — a good fit for a reading-streak nudge, and it sidesteps the one-shot nature of the iOS
prompt. `UNVERIFIED:` whether `expo-notifications` exposes provisional authorization through
`requestPermissionsAsync` options in v57 — check `ios: { allowProvisional: true }` in the types
before designing the flow around it.

### If you later add remote push

You will need: an APNs key (`.p8`) from the Apple Developer portal, uploaded to EAS Credentials;
the Push Notifications capability on the new App ID; `getExpoPushTokenAsync()` (Expo's push service)
or `getDevicePushTokenAsync()` (raw APNs); and rows in `devices`. `axiom-integration` flags the two
failures that waste the most time: **sandbox and production APNs tokens are different and the
endpoints are different** (`api.sandbox.push.apple.com` vs `api.push.apple.com`), and **payloads
over 4KB are silently rejected with no error returned to the sender**. Note also that
`.gitignore` already excludes `*.p8` — that is deliberate, and it is why an APNs key must never be
committed.

### Content

The owner rejected the boring daily-verse nag. Local scheduling means the copy can reference real
local state — the actual book and chapter from MMKV, the actual streak, the actual next discovery —
which is what makes it not feel generic:

- *"Genesis 22 is where it gets heavy. You left off at verse 8."*
- *"14 days. Don't let today be the one that breaks it."*
- *"3 names left to find in Exodus."*

Note the book-name gotcha from the DB: names are stored Roman-numeral style (`I Samuel`,
`II Kings`, `Revelation of John`). Notification copy must go through the same display-name map the
Bible tab uses, or it will say "II Kings" where a human would say "2 Kings."

---

## 4.7 Expo gotchas

The material the previous draft was missing entirely. Every item here is a thing that will cost
half a day the first time it happens.

### Development build vs Expo Go

Verified from `https://docs.expo.dev/develop/development-builds/introduction/`: a development build
is "your own version of Expo Go" containing `expo-dev-client`, and it can use any native library.
Expo Go is a fixed, pre-compiled app that "cannot accommodate arbitrary native modules."

**This project cannot run in Expo Go at all.** It depends on `react-native-mmkv`,
`react-native-nitro-modules`, `expo-speech-recognition`, `react-native-purchases`, and a custom
config plugin (`plugins/with-scene-delegate.js`) — none of which exist inside Expo Go. That is why
`expo-dev-client@~57.0.9` is a dependency and why `eas.json` has a `development` profile with
`developmentClient: true`. Always test on a development build. `AGENTS.md`'s note that "Expo Go
can't embed fonts at build time" is the same theme.

### When you must rebuild natively

Verified: you must regenerate native directories and rebuild when **installing or updating a library
containing native code**, **changing your app config**, or **upgrading the Expo SDK**. JS/TS-only
changes need nothing but a dev-server restart.

Mapping that onto this plan — every one of these needs a new build, and none of them can ship as an
OTA update:

| Change | Why it is native |
|---|---|
| `expo-apple-authentication` | Native module + entitlement |
| `expo-notifications` | Native module + Info.plist + entitlement |
| `expo-secure-store` | Native module |
| Bundle id → `NEW_BUNDLE_ID_TBD` (only if the owner decides to change it) | App config; changes the whole app identity |
| App Group entitlement (§4.11) | App config → entitlements |
| Bundling `kjv.db` as an asset | `UNVERIFIED:` a new file under `assets/` may need a Metro `assetExts` entry for `.db`, which is a native/bundler config change requiring a rebuild. Verify before assuming an OTA can deliver it. |

`@supabase/supabase-js` and `react-native-url-polyfill` are **pure JavaScript** and are the
exception — they can ship OTA. But they will arrive in the same release as everything else, so plan
the build anyway.

### `npx expo prebuild` and the gitignored `ios/`

`.gitignore` contains `/ios` and `/android`. This project uses **continuous native generation**: the
native projects are build *output*, regenerated from `app.json` + `app.config.ts` + config plugins.
Three consequences:

1. **Never hand-edit anything under `ios/`.** Editing `ios/ClarityDev/Info.plist` or
   `ClarityDev.entitlements` directly appears to work and is silently erased by the next prebuild.
   Every native change goes through `app.json`, `app.config.ts`, or a config plugin in `plugins/`.
2. `npx expo prebuild --clean` regenerates from scratch. Use it when native config changes are not
   taking effect — it is the "turn it off and on again" of Expo, and it is safe precisely because
   `ios/` holds nothing you authored.
3. The current `ios/` directory is named `ClarityDev` — it was generated with
   `APP_VARIANT=development`. That is why `app.config.ts` pins `appleTeamId: 'R23HRQJN98'`, and the
   comment in that file explains it: without it, "every `expo prebuild` regenerates ios/*.pbxproj
   with no team, and Xcode refuses to build."

### Config plugins

A config plugin is a function that edits the native project during prebuild. This repo already has
one custom plugin, `plugins/with-scene-delegate.js`, wired in via `app.config.ts`. Verified against
`node_modules/`:

| Package | Has `app.plugin.js`? |
|---|---|
| `expo-speech-recognition` | Yes — already in `app.json` plugins |
| `expo-audio` | Yes — already in `app.json` plugins |
| `expo-updates` | Yes |
| `react-native-mmkv` | **No** — autolinking only, no plugin needed |
| `react-native-purchases` | **No** — autolinking only, no plugin needed |
| `expo-observe` | No |

So RevenueCat needs no config plugin, but it **does** need the **In-App Purchase capability** on the
App ID. `UNVERIFIED:` whether that capability is auto-enabled by EAS or must be ticked by hand in
the Developer portal for a new App ID — check before the first paid build.

Note the plugin composition already in place: `app.json` holds the base `plugins` array,
`app.config.ts` spreads it and appends `expo-dev-client` and `withSceneDelegate`. Add new *string*
plugins to `app.json`; leave `app.config.ts` for variant logic. Mixing the two arbitrarily makes
the effective plugin order hard to reason about.

### Native module limits

There is no native module for arbitrary SQLite in this project right now — `expo-sqlite` is **not**
installed. The Bible tab's data access design belongs to the sibling planning documents, but it has
a hard dependency here: **shipping `kjv.db` requires adding a native SQLite module, which requires a
new build.** Sequence that dependency into the phase plan rather than discovering it at
implementation time.

---

## 4.8 expo-updates and OTA strategy

`expo-updates@57.0.12` is already installed and already configured. From `app.config.ts`:

```ts
runtimeVersion: { policy: 'appVersion' },
updates: { url: 'https://u.expo.dev/654f9e52-e892-44e4-a4b8-9aa700fef15b' },
```

Verified from the v57 updates docs: expo-updates manages "remote updates to your application code"
and **cannot update native code** — only JavaScript and assets. API: `checkForUpdateAsync()`,
`fetchUpdateAsync()`, `reloadAsync()`, the `useUpdates()` hook, plus `Updates.channel` and
`Updates.runtimeVersion` constants.

### `runtimeVersion` is currently a live footgun

`runtimeVersion` is what gates which JS bundles a given binary is allowed to load. Verified
policies:

| Policy | Value | Behaviour |
|---|---|---|
| `appVersion` | the `version` field, e.g. `"1.0.0"` | All builds sharing a marketing version share a runtime version |
| `nativeVersion` | `version` + `buildNumber`/`versionCode` | Every native build gets a unique runtime version |
| `fingerprint` | a hash of SDK, native code, and dependencies | Changes automatically whenever the native layer changes |

The project is on **`appVersion`**, and `app.json` pins `"version": "1.0.0"`. Here is the failure
that produces: you add `expo-notifications` (native), build, and ship. Both the old binary and the
new binary report `runtimeVersion = "1.0.0"`. You then publish a JS-only fix. The new bundle calls
into `expo-notifications` — and it is served to the **old binary that has no such native module**.
The result is a native-module-not-found crash on launch, for users who did nothing wrong, delivered
silently over the air. `appVersion` cannot detect this because nothing about the marketing version
changed.

**Recommendation: switch to `policy: 'fingerprint'`.** It hashes the native project state, so adding
any native module automatically produces a new runtime version and the incompatible-update path
becomes impossible by construction. Runner-up: `nativeVersion`, which is also safe (every build is
unique) but throws away OTA reach — a JS fix only reaches the single build number it was published
against, which defeats the purpose. Do this **in the same phase as the first native addition
(Phase 2)**, before the first OTA is ever published, because switching the policy is itself a
change that requires a new build.

`UNVERIFIED:` whether `fingerprint` requires `expo-updates` ≥ a specific version or extra EAS CLI
setup in SDK 57 — confirm against the docs before flipping it, and confirm the fingerprint is stable
across machines (a fingerprint that differs between your laptop and EAS's builders would break
update matching).

### Channels and branches

Verified: `Updates.channel` reflects the configured EAS Update branch; channels target updates at
specific build cohorts; **development builds and Expo Go ignore channels and accept any compatible
update**.

Current `eas.json`:

```jsonc
"development": { "developmentClient": true, "distribution": "internal", "environment": "development" },
"preview":     { "distribution": "internal", "environment": "preview", "channel": "preview" },
"production":  { "autoIncrement": true, "environment": "production" }   // <-- no channel
```

**The `production` profile has no `channel`.** `UNVERIFIED:` what EAS defaults to when `channel` is
omitted on a build profile — my reading is that the profile name is used, but I did not confirm this
for the current EAS CLI. Do not leave this to inference: **set `"channel": "production"`
explicitly** on the production profile. An OTA published to the wrong channel either silently
reaches nobody, or worse, reaches production users with a preview build. Being explicit costs one
line.

Add `"channel": "development"` to the development profile for the same reason.

### The OTA / rebuild decision, as a table

| Change | OTA or build? |
|---|---|
| Copy, colours, layout, spacing | **OTA** |
| New screen, new tab item in `ITEMS`, new component | **OTA** |
| Sync logic, RLS-facing query changes, notification copy | **OTA** |
| Bug fix in `lib/history-store.ts` or `lib/stats.ts` | **OTA** |
| `@supabase/supabase-js`, `react-native-url-polyfill` (pure JS) | **OTA** |
| Any new native module (`expo-notifications`, SecureStore, SQLite) | **Build** |
| Anything in `app.json` / `app.config.ts` / `plugins/` | **Build** |
| Entitlements, Info.plist, permission strings | **Build** |
| Bundle id change | **Build** + new App ID + new profiles |
| Expo SDK upgrade | **Build** |

Two cautions on OTA that are easy to learn the hard way:

- **A JS bundle is not exempt from App Review.** Guideline 2.5.2 permits over-the-air JS updates,
  but the app's *functionality* must stay within what was reviewed. Shipping a materially different
  app via OTA is a policy problem, not a technical one.
- **A schema migration is not OTA-able in the safe direction.** If Phase 3's migration drops or
  renames a column that a still-installed older JS bundle queries, that bundle breaks — and you
  cannot force an OTA onto a device that has not opened the app. Make migrations additive-only
  (add columns, never rename or drop) for anything a shipped client reads. This mirrors the rule
  `lib/history-schema.ts` already states for local records: *"Bump when a field changes meaning (not
  when one is added), and add the corresponding step to `upgradeRecord`."* The same discipline
  applies to Postgres.

---

## 4.9 Licensing the Bible text

**The previous draft advised considering "stripping the GPL notice." That is not acceptable
guidance and it is removed. Deleting a license declaration does not remove a license — it removes
your evidence of which terms you accepted, which makes an accidental infringement look deliberate.
Nobody should follow that advice, and no AI should have written it.**

Here is the accurate picture, and it is genuinely more favourable than the draft implied.

### Two separate rights, and only one of them is a problem

**1. The KJV translation text.** In the United States, the 1611/1769 King James Version is in the
public domain — the English printing privilege was disregarded after the Revolutionary War and the
text entered the public domain outside the UK. **In the United Kingdom it is different:** the KJV
sits under a perpetual Crown copyright administered under Letters Patent by Cambridge University
Press, Oxford University Press, and Collins. Cambridge permits up to 500 verses for
non-commercial/liturgical use with attribution; commercial use or more requires written permission.
The Berne Convention does not export Crown copyright or perpetual copyright, which is why the US
status and the UK status genuinely differ.

Practically: a worldwide App Store release includes the UK. `UNVERIFIED:` how aggressively the
Letters Patent holders pursue app developers — the observable reality is that many KJV apps ship in
the UK store without incident. This is a real-but-low-probability exposure, not a build blocker.
Note it, do not lose sleep, and if the owner wants certainty, a short letter to Cambridge University
Press is cheap.

**2. This particular database file.** This is the actual issue, and it is a **compilation** question
rather than a scripture question. `kjv.db`'s own `translations` row reads:

```
KJV | "# KJV: King James Version (1769) with Strongs Numbers and Morphology and CatchWords" | GPL
```

That title is the CrossWire Bible Society SWORD module of the same name. CrossWire holds copyright
in that module's compilation, the SWORD Project is GPL-licensed, and CrossWire's own module notes
that "the rights to the base text are held by the Crown of England" — the same split described
above. So the GPL string is inherited from a real upstream, not noise. **The scripture is not what
carries the license; the compilation is.**

### What I actually found in the file, which changes the analysis

The task brief stated this database "ships Strongs numbers, morphology, and catchwords." **I checked,
and it does not.** Verified by direct query of `/Users/chandler/Documents/BibleScroll/Translations/kjv.db`:

```
sqlite> .schema
-- three tables only: translations, KJV_books, KJV_verses(book_id, chapter, verse, text)
sqlite> select count(*) from KJV_verses where text like '%<%' or text like '%{%' or text like '%}%';
0
sqlite> select text from KJV_verses where id = 1;
In the beginning God created the heaven and the earth.
```

**Zero** rows contain Strongs markup, morphology tags, or catchword braces. All 31,102 verses are
clean prose. The title is inherited metadata; the annotation layer that gave the CrossWire module
its scholarly value was stripped somewhere upstream of this SQLite conversion.

This matters because the strength of a compilation copyright scales with the creative content in
the compilation. What remains here is public-domain verse text plus a book/chapter/verse index —
the least creative, most factual possible arrangement of a text whose divisions were fixed
centuries ago. A copyright claim over "the 66 books of the KJV in canonical order, numbered" is
thin. **The declared GPL string, however, remains a declared license on a file you did not author,
and that is what you have to deal with regardless of how thin the underlying claim is.**

### The GPL / App Store conflict, stated accurately

The conflict is real and well-documented, and it is not primarily about "GPL requires open source."
It is **GPL v2 section 6**: when you redistribute the Program, recipients automatically receive a
license to copy, distribute, and modify it, and **you may not impose any further restrictions on
their exercise of those rights**. The App Store's Terms of Service *do* impose further restrictions
— device limits, DRM, no redistribution. In 2010–2011 the FSF asserted exactly this against
GPL-licensed apps on the App Store, and the outcome was that VLC was pulled. This is settled
history, not speculation.

Two nuances that matter for a data file rather than a program:

- **Mere aggregation.** GPLv2 §2's final paragraph distinguishes a derivative work from "mere
  aggregation of another work not based on the Program on a volume of a storage medium."
  A read-only SQLite file that your proprietary code queries has a genuine aggregation argument —
  it is data your app reads, not code linked into your app. That argument, if it holds, means
  **your app's source would not have to be GPL'd.** It does *not* rescue you from §6: you would
  still be redistributing the GPL'd database through a store whose terms restrict what recipients
  may do with it.
- **The declaration is unversioned.** The string is literally `GPL` — no version, no `COPYING`
  file, no named copyright holder, no upstream URL in the file. "GPL" with no version is legally
  ambiguous (v2? v3? "or later"?), and it is not a license grant you can rely on or reason about
  precisely. That ambiguity is a reason to stop using this file, not a loophole.

### The three real options

**(a) Build your own database from clean public-domain text.** Source a public-domain KJV text
(there are many; verify the provenance of whichever you pick), and generate your own SQLite file
with your own schema — which you want to do anyway, because the brief notes this DB has **no index
on `(book_id, chapter, verse)`** and every chapter read will table-scan without one. Cost: a
one-time script plus verse-count verification against 31,102. Benefit: you own the compilation
outright, the license question disappears, and you fix the missing index in the same pass.

**(b) Comply with the GPL.** Offer the database's source under GPL terms, ship the license text,
and attribute CrossWire. This is honest and cheap for the *data*. It does **not** resolve the §6 /
App Store ToS conflict, and a §6 conflict is not something you can fix with an acknowledgements
screen. Not viable as a standalone answer for an App Store release.

**(c) Use a translation with permissive terms.** And here is the finding that makes this easy: **the
sibling databases in the same folder are mostly already permissive.** Verified by querying each
file's `translations` row:

| File | Declared license | Usable in a paid App Store app? |
|---|---|---|
| **`BSB.db`** (Berean Standard Bible) | **Creative Commons CC0** | **Yes — best available. CC0 is a public-domain dedication with no conditions at all.** |
| `ASV.db`, `BBE.db`, `Darby.db`, `Geneva1599.db`, `RNKJV.db`, `Webster.db`, `YLT.db` | Public Domain | Yes |
| `kjv.db`, `RLT.db` | GPL | No — this section |
| `AKJV.db`, `LITV.db` | Copyrighted; free **non-commercial** distribution | **No — a paid app is commercial. Worse than the GPL problem.** |
| `MKJV.db` | Copyrighted; non-commercial distribution | **No** |
| `NHEB.db` | **Unknown** | No — an unknown license is not a permissive one |

Note `Webster.db` and `RNKJV.db` in particular: both are KJV-derived, both declare Public Domain.
If the requirement is specifically "the KJV reading experience," a public-domain KJV revision may
satisfy it with no licensing question at all.

The `AKJV`/`LITV`/`MKJV` row is the one to internalise: **three of these files forbid commercial
distribution.** Monetization (§4.10) makes this app commercial. Shipping those in a paid app is a
clearer infringement than the GPL issue, and the draft's plan to sell "alternative translations
(ASV, BSB, YLT, etc.)" as the Pro tier would have walked straight into it if the list had grown.
Whatever the launch translation is, **audit every `translations.license` value before any file
ships**, and gate the Pro translation list on that audit.

### Recommendation

**Do (a), and make BSB from (c) your fallback.**

Ship v1 with a KJV text you built yourself from verified public-domain sources, in your own schema,
with the `(translation, book_id, chapter, verse)` index the current file lacks. This costs one
afternoon of scripting, removes the licensing question entirely, fixes a real performance defect,
and gives you a schema you control as more translations arrive. Keep the CrossWire file as a
*reference* for verse-count validation — comparing your build against its 31,102 rows is a good
test — but do not ship it.

If sourcing a clean KJV text turns into a provenance rabbit hole, **ship BSB instead**. CC0 is the
single cleanest license in the entire folder, it is modern readable English (arguably better for
reading aloud), and it carries no Crown copyright complication in the UK either. The owner may have
strong feelings about KJV specifically; if so, option (a) is the answer and it is not hard.

Runner-up rejected: the draft's "download the translation data dynamically post-install." This does
not solve the legal problem — you are still the distributor, just over HTTPS instead of through
Apple — and it adds a first-run network dependency to an app whose entire value proposition is
working offline. It also delays the user's first chapter behind a 5MB download. Reject it on product
grounds even before the legal ones.

**Standard disclaimer, meant sincerely:** none of this is legal advice. It is an accurate reading of
public license terms and documented history, assembled so the owner can ask a lawyer a precise
question instead of a vague one. If revenue depends on the answer, the precise question is worth
one hour of a lawyer's time.

---

## 4.10 Monetization

**Decision (updated by owner): The app is entirely free.** No RevenueCat, no paid tiers, and no freemium gating. Instead of paying, users can unlock special themes, fonts, colors, and layout schemes by sharing the app with friends, reinforcing the group commission to share the Bible.

Revised free/paid split, adjusted for §4.9's licensing findings and for the fact that the existing
app's pronunciation engine is the genuinely expensive asset:

| Tier | Contents |
|---|---|
| **Free** | The full launch translation, all 66 books, unlimited reading, chapter/verse tracking, streaks, the basic progress ring. **Never paywall scripture.** |
| **Pro** | Additional translations (**only license-audited ones** — see the table in §4.9), the collectible lexicon and biblical names/places, cross-device sync, advanced analytics and the word-mastery surfaces, custom daily goals, and the pronunciation-coaching features inherited from Clarity. |

Two deliberate choices worth stating:

- **Reading the Bible is free, forever, in full.** Paywalling scripture in a scripture app is both
  a bad look and a bad funnel — the free tier *is* the marketing. Charge for the coaching, the
  collection mechanics, the multi-device continuity, and the extra translations.
- **Cross-device sync is the strongest Pro hook**, because it is the feature with a real recurring
  server cost and the one users feel the absence of most sharply once they have two devices. It
  also makes the §4.4 merge logic revenue-relevant rather than infrastructure-only.

`UNVERIFIED:` whether the RevenueCat dashboard, products, and entitlements have been configured for
this app at all, and whether the App Store Connect subscription products exist. Neither the repo nor
`.env.example` contains a RevenueCat API key, which suggests the SDK is installed but not wired up.
Check before scheduling Phase 5.

Review requirements from `axiom-shipping` that reject IAP submissions specifically — all avoidable,
all commonly missed:

- **Attach IAP products to the submitted version** via the checkbox in App Store Connect. If you do
  not, the reviewer cannot see them and you get a Guideline 2.1 rejection for a feature that works
  fine.
- **Upload a review screenshot for each IAP product.** Same failure mode.
- **Restore Purchases must exist and be reachable.** RevenueCat's `restorePurchases()` covers the
  mechanism; you still have to put a button somewhere findable.
- Subscription metadata must state price, duration, and renewal terms, with links to your Terms and
  Privacy Policy from the purchase surface.
- **Interaction with account deletion (§4.2):** if a user deletes their account while holding an
  active subscription, the subscription is an Apple-side artifact and does *not* get cancelled by
  your deletion. Tell them so explicitly and link to Apple's subscription management. Deleting the
  account silently while continuing to bill is the kind of thing that generates both refund requests
  and one-star reviews.

The In-App Purchase capability must be enabled on the **new** App ID from §4.1 — see §4.7's
`UNVERIFIED:` note on whether EAS does this automatically.

---

## 4.11 Holy Scroll interlink

**Decision (kept and corrected): share the Supabase account; treat the local App Group as an
optional convenience, not the mechanism.**

The draft's App Group proposal was directionally reasonable but rested on the invented identifier
`group.com.schroedernathan.holyscroll`, which appears nowhere in this repo or any supplied material.
See §4.1: the App Group id and Holy Scroll's bundle id are both `_TBD` placeholders the owner must
fill in.

**Tier 1 — shared Supabase project (do this).** Both apps authenticate against the same Supabase
project with Sign in with Apple. Because SIWA returns a stable Apple user identifier per developer
team, the same person signing into both apps lands on the same `auth.users` row. Register both
bundle ids in the Supabase Apple provider's **Client IDs** field (§4.2). Add an `app_id` column
where per-app distinction matters — `devices` already has one above, so a push token from Holy
Scroll is not mistaken for one from Speak the Bible.

Shared reading position falls out of this for free: both apps read and write
`reading_progress (translation, book_id, chapter, max_verse)`. Holy Scroll shows where you last read;
Speak the Bible shows where you last *spoke*. `UNVERIFIED:` Holy Scroll's data model and whether its
book identifiers are the same 1–66 integers. If they differ, one side needs a mapping table, and
that is a real integration task rather than a config change.

**Tier 2 — App Group / Keychain sharing (optional, later).** From `axiom-security`: a Keychain
access group is `$(TeamIdentifierPrefix)$(GroupIdentifier)`, and items without an explicit
`kSecAttrAccessGroup` land in the app's default group and are therefore *not* shared. Sharing a
session between the two apps means both list the identical group string and both write the session
with that group set explicitly. Requirements and caveats:

- Both apps must be on team `R23HRQJN98`. `UNVERIFIED:` whether Holy Scroll is.
- Register `group.SHARED_APP_GROUP_ID_TBD` in the Developer portal and add it to both apps.
- The draft claimed an App Group lets both apps "read the same MMKV instance or Keychain." Two
  separate mechanisms, worth keeping straight (`axiom-security`, keychain vs app groups): an **App
  Group** shares a *filesystem container* (so a shared MMKV file, if MMKV is pointed at that
  container path) and a **Keychain access group** shares *keychain items*. They are configured
  separately. `UNVERIFIED:` whether `react-native-mmkv` v4 exposes an App-Group container path
  option — check its types before designing around a shared MMKV instance.
- In Expo, the entitlement goes in `ios.entitlements` in the app config (never by hand in `ios/` —
  §4.7).

**Recommendation: ship Tier 1 only.** It delivers the actual user-visible win (shared account,
shared position, one streak) with no entitlement work and no cross-team risk, and it works on
Android and web later. Tier 2 buys "already signed in when you open the second app" — pleasant,
but it is one Apple sign-in sheet's worth of friction, and it costs two entitlements, a shared
container, and a class of bug that only reproduces with both apps installed.

**Deep links.** `app.config.ts` already derives the scheme per variant via `getScheme()` from
`app.json`'s `"scheme": "clarity"`, so today the production scheme is `clarity://`. Rename that base
scheme alongside the bundle id in §4.1 — `speakthebible://` — and keep the variant suffixing. For
cross-promotion, custom schemes have a specific flaw worth knowing: on iOS, opening
`holyscroll://...` when Holy Scroll is *not* installed fails silently. **Universal Links
(`applinks:holyscroll.app` via an associated domain) degrade gracefully to the website**, which is
the behaviour you want for a cross-promo button. Use Universal Links for app→app promotion and
custom schemes only for internal routing. `UNVERIFIED:` whether `holyscroll.app` currently serves an
`apple-app-site-association` file — Universal Links do not work without it.

---

## 4.12 Privacy, permissions, and App Store review

This is where the draft was thinnest, and it never mentioned that **this app records audio and runs
speech recognition** — the most privacy-sensitive thing it does by a wide margin.

### Microphone and speech recognition

Good news first: the permission strings **already exist**, verified in `app.json`:

```json
"NSSpeechRecognitionUsageDescription":
  "Allow $(PRODUCT_NAME) to use speech recognition to follow along as you read.",
"NSMicrophoneUsageDescription":
  "Allow $(PRODUCT_NAME) to access your microphone so it can hear you read."
```

Both are also declared in the `expo-speech-recognition` plugin config, as `microphonePermission` and
`speechRecognitionPermission`. `axiom-shipping` confirms `NSMicrophoneUsageDescription` and
`NSSpeechRecognitionUsageDescription` are the correct keys, and that "missing purpose strings cause
immediate rejection." These strings are good ones — they say *why* in app-specific terms, which is
exactly what review looks for.

Two follow-ups:

- **The duplication is a latent inconsistency.** The same two strings are set in both `ios.infoPlist`
  and the plugin options. Today they match. When someone edits one and not the other, the effective
  value depends on plugin ordering, which is not something you want to debug. `UNVERIFIED:` which
  wins in v57 — I did not confirm the precedence. Pick one location (the plugin options, since
  that is where the library expects them) and delete the other.
- **`NSPhotoLibraryUsageDescription` is present with an apologetic explanation** ("does not access
  your photos… referenced by a system framework used for file handling"). Purpose strings for
  permissions you do not use invite reviewer questions, and Guideline 5.1.1 is about accuracy.
  `UNVERIFIED:` which framework actually pulls this in — worth finding out and removing the key if
  nothing needs it. If it is genuinely required by a dependency, keep it and keep the explanation.

**Review implications of recording audio.** Reviewers test permission flows. Three things to get
right, and the third is the one that fails:

1. The app must remain usable, not crash, if the user **denies** the microphone. A reading app that
   dead-ends on denial is a Guideline 2.1 rejection. Offer a read-along mode with no scoring.
2. Ask in context — when the user starts a reading session — never at launch.
3. **Provide a demo account in review notes** if any reviewed feature needs sign-in
   (`axiom-shipping`: demo credentials, non-expiring for 1–2 weeks, with representative sample data).
   Add reading history to the demo account, or the reviewer sees empty screens and reads them as
   incomplete.

### The Azure finding — fix this before shipping

Two verified facts:

- `services/azure-pronunciation.ts:136` POSTs recorded audio to
  `https://<region>.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1`.
- `hooks/use-practice-session.real.ts:592` reads `process.env.EXPO_PUBLIC_AZURE_SPEECH_KEY`.

Both have consequences the plan has to own:

**1. The Azure subscription key ships inside your JS bundle.** `EXPO_PUBLIC_*` values are inlined at
build time and are extractable from any downloaded app in minutes. Anyone can pull that key and bill
Azure Speech to the owner's account. This is a live cost-and-abuse exposure independent of anything
in this document. **Fix:** move the Azure call behind a server route — the pattern already exists in
this repo at `app/api/speech-coach+api.ts`, and `app.json` sets `web.output: "server"`, so the
infrastructure is there. The client posts audio to your route; the route holds the key server-side
(a non-`EXPO_PUBLIC_` env var) and proxies to Azure. This also gives you a rate limit and a kill
switch. `UNVERIFIED:` the latency cost of the extra hop for the short-audio endpoint — measure it,
because the pronunciation feature is interactive and the owner considers it excellent as-is.
Do not break it; measure, then move it.

**2. Audio leaving the device is "collection" under Apple's definition.** `axiom-shipping`:
"'Collected' means data is transmitted off-device and accessible beyond what is needed to service
the current request. On-device-only processing is NOT collection." Audio POSTed to Microsoft is
off-device. It must be declared in the Privacy Nutrition Labels as **User Content → Audio Data**,
and your privacy policy must name the third-party processor. `axiom-shipping` is blunt about the
consequence: Apple compares (a) actual app behaviour, (b) your privacy policy, and (c) your ASC
nutrition labels, and **any disagreement among the three is a 5.1.1 rejection.**

### Privacy manifest (`PrivacyInfo.xcprivacy`)

Currently auto-generated by Expo prebuild at `ios/ClarityDev/PrivacyInfo.xcprivacy` with three
Required Reason API declarations, verified against the file:

| Declared category | Reason | Why |
|---|---|---|
| `NSPrivacyAccessedAPICategoryUserDefaults` | `CA92.1` | MMKV / RN internals touch UserDefaults |
| `NSPrivacyAccessedAPICategoryFileTimestamp` | `C617.1` | File timestamps inside the app container |
| `NSPrivacyAccessedAPICategorySystemBootTime` | `35F9.1` | Elapsed-time measurement (`systemUptime`) |

`NSPrivacyCollectedDataTypes` is an **empty array** and `NSPrivacyTracking` is **false**.

Two things to know (`axiom-shipping`, app-store-ref):

- Since **May 1, 2024**, missing required-reason API declarations cause **automatic rejection with
  no human review**. This is a machine check; there is nobody to explain yourself to.
- **`CA92.1` means "access within an app group."** `1C8F.1` is the code for "access within the same
  app." Today the entitlements file is empty — there is no app group — so `CA92.1` is arguably the
  wrong reason code for the current build, and it becomes correct only if §4.11's Tier 2 ships.
  `UNVERIFIED:` whether Expo's autogenerated manifest picks `CA92.1` unconditionally. Worth
  checking, and worth correcting to `1C8F.1` via a config plugin if you never add an app group.

Additions to consider as the dependencies in this plan land:

- **Disk space (`E174.1`)** if any code checks free space before writing (plausible once you bundle
  and copy a SQLite database). `UNVERIFIED:` whether `expo-file-system` triggers the DiskSpace
  category and whether Expo's generator adds it automatically.
- `expo-secure-store` uses Keychain, which is **not** a Required Reason API. No declaration needed.
- The verification step: **Xcode → Product → Archive → Generate Privacy Report** produces a PDF
  aggregating your manifest and every embedded framework's. Run it once before the first submission.
  It is also how you discover that a third-party SDK ships no manifest — in which case
  `axiom-shipping` notes you must declare that SDK's collection in your own.

### Privacy Nutrition Labels (the App Store Connect questionnaire)

Separate from the manifest, and this is where this app's real disclosure obligations live. Given the
dependency set in this plan:

| Data type | Collected? | Purpose | Source |
|---|---|---|---|
| Identifiers → User ID | Yes | App Functionality | Supabase `auth.users` |
| Contact Info → Email | Yes | App Functionality | SIWA (possibly a private-relay proxy) |
| **User Content → Audio Data** | **Yes** | App Functionality | Azure Speech (§ above) |
| Usage Data → Product Interaction | Yes | App Functionality / Analytics | `session_records` sync |
| Purchases → Purchase History | Yes | App Functionality | RevenueCat |
| Diagnostics → Crash/Performance | `UNVERIFIED:` | Analytics | EAS Observe (`expo-observe`) — **determine exactly what it transmits before answering the questionnaire** |
| **Sensitive Info → Religion** | **Probably — decide deliberately** | App Functionality | see below |

**The Sensitive Info row deserves a real decision, and the draft never raised it.** `axiom-shipping`
lists Apple's Sensitive Info category as covering "Racial or ethnic data, sexual orientation,
**religion**, biometrics." A per-user, server-side record of which Bible chapters someone reads,
when, and how often, linked to their identity, is a record of religious practice. Reasonable people
differ on whether "uses a Bible app" constitutes collecting religious data — the app's App Store
listing already implies the affiliation — but the data being *synced to your server and retained*
is a different matter from the install itself.

**Recommendation: declare it.** Under-declaring is a 5.1.1 rejection risk and, more importantly, it
is the wrong instinct for this specific dataset. Declaring costs you a line on the product page that
tells users the truth about data they would want to know about. Pair it with real practices: retain
only what the features need, do not sell or share it, no third-party analytics on reading content,
and say all of that plainly in the privacy policy. `UNVERIFIED:` whether Apple's questionnaire
treats religious-practice telemetry as Sensitive Info — the category list is documented, the edge
case is not. If in doubt, declare.

### Age rating — the draft's answer is now impossible

The draft recommended selecting "Mild Violence / Mature Themes" for a likely **12+** rating.
**There is no 12+ tier any more.** Per `axiom-shipping` (app-store-ref, Part 4), the age rating
system was replaced effective **January 31, 2026** with five tiers — **4+ / 9+ / 13+ / 16+ / 18+** —
and *"All developers must have completed the updated questionnaire — app updates are blocked without
it."* Advice naming a 12+ outcome is from the old system.

The questionnaire is about **what your app presents**, not what the source text contains. This app
displays KJV prose and records the user reading it aloud. Working through the categories:

| Category | Honest answer |
|---|---|
| Realistic Violence | The KJV narrates warfare in archaic prose with no depiction. `None` or `Infrequent/Mild`. |
| Sexual Content and Nudity | Textual references only, archaic register, no imagery. `None` or `Infrequent/Mild`. |
| Profanity or Crude Humor | `None` |
| Horror/Fear Themes | `None` or `Infrequent/Mild` |
| Alcohol, Tobacco, Drugs | References only. `None` or `Infrequent/Mild`. |
| **Unrestricted Web Access** | **`No`** — and keep it that way. Any in-app browser without a content filter forces **16+ minimum**. |
| Simulated Gambling | `None` |
| Medical/Treatment Info | `None` |

**Expected outcome: 4+ or 9+.** A single `Infrequent/Mild` answer lands 9+; `None` across the board
lands 4+. Do not over-declare defensively — the guidance is to answer conservatively regarding
*content you actually show*, and an inflated rating shrinks your audience for content you do not
present.

**Capability declarations (new since WWDC25) are the part that could bite.** You must declare
messaging/chat, user-generated content, advertising, parental controls, and age assurance. Today the
answer is "none of these." But `axiom-shipping` warns that UGC apps typically need **13+ minimum due
to moderation requirements** — so if the gamification roadmap ever adds shared collections, public
profiles, leaderboards with display names, or any user-visible text from another user, the rating
jumps and you inherit a **content moderation obligation**. Design social features knowing that
price. A leaderboard with user-chosen display names is UGC.

### Export compliance — already handled

`app.json` already sets `ITSAppUsesNonExemptEncryption: false`. The draft told you to add it to
`app.config.ts`; it is already in `app.json`, and adding it again in the override layer would be
redundant. `false` is correct per `axiom-shipping`'s decision tree: HTTPS via the OS, Keychain, and
OS data protection are all **exempt**, requiring no documentation. Adding Supabase (HTTPS) and
`expo-secure-store` (Keychain) does not change this.

The one thing that *would* change it: if you implement your own encryption for the MMKV session
store (§4.3) using a non-OS crypto library, you move into the "Standard" tier —
`ITSAppUsesNonExemptEncryption: true`, plus a French ANSSI declaration if you distribute in France.
MMKV's built-in AES `UNVERIFIED:` — determine whether it uses a bundled crypto implementation or the
platform's. **If this turns into a compliance headache, that is a further reason to ship the plain
unencrypted MMKV session store from §4.3's runner-up.** A session token protected by iOS's
app-container sandbox is not a meaningful risk for this app.

---

## 4.13 TestFlight and the first submission

`eas.json` already has the profiles. What it does not have is the failure list.

### Getting a build to TestFlight

```bash
eas build --platform ios --profile production
eas submit --platform ios --profile production   # uses ascAppId 6798466426
```

`appVersionSource: "remote"` and `autoIncrement: true` mean EAS owns the build number — do not also
bump it by hand in `app.json`, or you get collisions.

**Internal vs external testing, and why it matters here:** internal testers (up to 100 users on your
team) get builds immediately with **no review**. External testers (up to 10,000) require **TestFlight
Beta App Review**, which is a real review — lighter than App Store review, but it rejects. Use
internal testing to iterate and external testing only when the build is submission-quality.

### First-submission failure modes, concretely

`axiom-shipping` reports that **over 40% of rejections cite Guideline 2.1 (App Completeness)** and
another ~30% are metadata and privacy. Ordered by how likely each is to hit *this* app:

| # | Failure | Why it hits this app specifically | Prevention |
|---|---|---|---|
| 1 | **2.1 — reviewer sees empty screens** | This app's value only appears after you have read something. A fresh install shows zero progress, zero streak, an empty lexicon. | Demo account with real reading history; or design empty states that teach rather than sit blank. |
| 2 | **2.1 — no demo account** | If sync/paywall need sign-in, the reviewer stops there. | Non-expiring demo credentials in review notes with representative data. |
| 3 | **2.1 — mic denial dead-ends** | Reviewers deny permissions on purpose. | Ship and test a no-microphone read-along path. |
| 4 | **5.1.1(i) — privacy policy** | Must be in ASC metadata **and** reachable in-app, and must match actual behaviour — including the Azure audio upload. | Write it after §4.12's table is settled, not before. |
| 5 | **5.1.1(v) — no account deletion** | Accounts exist from Phase 2 onward. | Build deletion in the same phase as auth, plus SIWA token revocation. |
| 6 | **4.8 — missing SIWA** | Only if you add Google/social first. | Ship Apple first (§4.2). |
| 7 | **2.1 — IAP invisible to reviewer** | Products not attached to the version, or no review screenshots. | The ASC checkbox + a screenshot per product. |
| 8 | **2.3.6 — inaccurate age rating** | Answering the old 12+ way, or under-declaring capabilities. | §4.12's table; the updated questionnaire is mandatory. |
| 9 | **Missing Compliance status after upload** | The build sits in ASC unusable until export compliance is answered. | Already handled by `ITSAppUsesNonExemptEncryption: false`. |
| 10 | **4.3 — "duplicate/spam"** | This is a real risk. There are hundreds of Bible apps, and a thin one gets 4.3'd. | Lead the listing and screenshots with **reading aloud with speech recognition** — the thing no other Bible app does. Differentiation is a metadata problem as much as a product one. |

Two more from `axiom-shipping` worth internalising:

- **Updates are reviewed against current guidelines**, not the ones in force when you were last
  approved. A bug-fix update can be rejected for a requirement that appeared after your last
  release — the privacy manifest mandate and the age-rating overhaul both landed mid-cycle.
- Review timing: 90th percentile is under 24 hours, edge cases up to 7 days, and it slows during
  holidays and major iOS releases. Do not schedule a launch with no slack.

---

## 4.14 Git, for someone who has never used it

Written for zero prior knowledge. The owner said plainly: *"i'm not sure how git works and commits
and branches and other things and work trees i don't know like the right way to do it each phase."*

Every command below is followed by **what the output actually looks like and what it means**,
because a command whose output you cannot read is not a command you can use.

### The mental model

Git is a **save-game system for a folder**. Three ideas and you have enough:

- A **commit** is a labelled snapshot of the whole project at one moment. Snapshots are permanent
  and you can return to any of them.
- A **branch** is a name for a line of snapshots. `main` is the line you trust. A branch off `main`
  is a place to experiment without risking `main`.
- **Staging** is choosing *which* changes go into the next snapshot. This step exists precisely so
  you do not have to snapshot everything at once, and it is the step most beginners skip.

### `git status` — run this constantly

This is the single most useful command in git. It is read-only, it changes nothing, and it answers
"where am I and what have I done."

```bash
git status
```

Right now, in this repo, it prints:

```
On branch main
Your branch is up to date with 'origin/main'.

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	docs/

nothing added to commit but untracked files present (use "git add" to track)
```

Reading that, line by line:

- `On branch main` — the branch you are on.
- `Your branch is up to date with 'origin/main'` — no un-pushed commits and none waiting to be
  pulled.
- `Untracked files:` — git has **never** seen these. They are not in any snapshot. If you deleted
  them right now, git could not get them back.
- `docs/` — the whole directory is shown, collapsed, because nothing inside it is tracked yet.

The three states a file can be in, which is what `status` is telling you:

| Heading | Meaning |
|---|---|
| `Untracked files` | Git has never recorded this file. Not in any snapshot. |
| `Changes not staged for commit` | Tracked, and you edited it, but it is **not** going into the next commit yet. |
| `Changes to be committed` | Staged. This **is** going into the next commit. |

### Why `git add .` is a bad habit

The previous version of this document said to run `git add .`. That means "stage everything that
changed, including things I have not looked at." It is how people commit API keys, 400MB of build
output, and half-finished debug code.

**This repo is a good illustration of both the risk and the protection.** `.gitignore` contains:

```
node_modules/
.expo/
dist/
/ios
/android
.env*.local
*.p8
*.p12
*.key
*.mobileprovision
```

`.env*.local` matches `.env.local` — which really exists here and really contains
`AI_GATEWAY_API_KEY` and `EXPO_PUBLIC_AZURE_SPEECH_KEY` — so `.gitignore` would stop `git add .`
from committing it. **That protection is real, and it is also exactly one line of one file away
from not existing.** `.gitignore` only covers the mistakes someone anticipated. It does not cover
`supabase-keys.txt` on your desktop, or `notes-with-password.md`, or a `.env.production` that does
not match the `.local` pattern.

**Stage deliberately instead. Name what you are committing:**

```bash
git status                        # 1. look at what changed
git add services/supabase.ts      # 2. stage specific files, by name
git add types/sync.ts
git status                        # 3. look again — confirm ONLY what you meant is staged
git commit -m "Add Supabase client and sync op types"
```

Step 3 is not optional ceremony. After `git add`, `status` moves those files under
`Changes to be committed`. Read that list before committing. If something is there you did not
intend, un-stage it — this only removes it from the staging area and **does not touch your file**:

```bash
git restore --staged path/to/file
```

To see the actual line-by-line changes before staging:

```bash
git diff                # changes you have NOT staged
git diff --staged       # changes you HAVE staged (what the commit will contain)
```

`git diff` output uses `-` for removed lines and `+` for added ones. It opens in a pager: press
`space` to scroll, and **`q` to quit**. (Being stuck in a pager with no idea how to exit is a
genuinely common first-week experience. It is `q`.)

If a file should never be committed, add it to `.gitignore` rather than remembering to avoid it:

```bash
echo "my-scratch-notes.md" >> .gitignore
```

One catch: `.gitignore` only affects **untracked** files. If a file is already committed, adding it
to `.gitignore` changes nothing. You must also `git rm --cached <file>` to stop tracking it — and
understand that **it remains in the history**, so a committed secret must be treated as leaked and
rotated, not just deleted.

### A phase, start to finish

**1. Start from a current `main` and branch.**

```bash
git checkout main
git pull
git checkout -b phase-2-auth
```

- `git checkout main` — switch to `main`.
- `git pull` — fetch and apply anything new from the remote. Prints `Already up to date.` if there
  is nothing.
- `git checkout -b phase-2-auth` — create a branch and switch to it. Prints
  `Switched to a new branch 'phase-2-auth'`. Nothing is on the remote yet; that is fine.

Name branches after phases: `phase-1-bible-tab`, `phase-2-auth`, `phase-3-supabase`.

**2. Work, and commit in small pieces.**

Do not save one giant snapshot at the end of a phase. Commit each coherent step. Small commits are
what make undo precise — you can drop one bad change without losing a day's work.

```bash
git status
git add services/supabase.ts types/sync.ts
git commit -m "Add Supabase client with MMKV session storage"
```

Commit message shape: a short line, present tense, describing **what changed and why** — not "fix"
or "wip" or "stuff". You will read these later trying to find when something broke.
`Add local streak notification scheduling` is useful. `updates` is not.

**3. Push the branch so it exists somewhere other than your laptop.**

```bash
git push -u origin phase-2-auth
```

`-u` links local to remote so later pushes are just `git push`. Do this early — a branch that
exists only on one machine is one spilled coffee from gone.

**4. Merge into `main` when the phase works.**

```bash
git checkout main
git pull
git merge phase-2-auth
git push
```

If it prints `Fast-forward` or `Merge made by the 'ort' strategy`, you are done. If it prints
`CONFLICT`, see below.

### Seeing what happened

```bash
git log --oneline -10
```

Ten most recent commits, one per line:

```
99c1989 Initial, first state, good to go. Without huge icons...
04b01e6 Initial, first state, good to go. Without huge icons...
229f85b Rename app to Clarity and add RevenueCat dependencies
```

The short hex string is the **commit hash** — its permanent id. You can use it in any command that
takes a commit. (Note the top two commits here have near-identical messages, which is exactly the
confusion that better commit messages prevent.)

More ways to look:

```bash
git log --oneline --graph --all     # branch structure as ASCII art
git show 229f85b                    # everything that changed in one commit
git log --oneline -- app.json       # only commits that touched app.json
git log -p -- app.config.ts         # same, with the actual diffs
git diff main..phase-2-auth         # everything different between two branches
```

`git log` and `git show` also open in the pager. Still `q`.

### Undoing things

The draft covered only "undo a commit." The far more common need is undoing work you have **not**
committed. Split by what state the change is in:

**Undo edits to a file you have not staged** (throws the edits away — no recovery):

```bash
git restore path/to/file.ts
```

**Undo edits to everything you have not staged** (dangerous — read the `status` output first):

```bash
git status          # look at exactly what you are about to destroy
git restore .
```

**Un-stage a file but keep your edits:**

```bash
git restore --staged path/to/file.ts
```

**Undo your last commit but keep the changes as edits** (the useful one — you committed too early or
with a bad message):

```bash
git reset --soft HEAD~1
```

`HEAD` is "where I am now"; `HEAD~1` is "one commit before that." `--soft` moves the branch pointer
back and leaves your files and staging alone. Re-commit properly.

**Undo the last commit and throw the changes away:**

```bash
git reset --hard HEAD~1
```

`--hard` **deletes work**. Never type it without reading `git status` first and being certain.

**Undo a commit that is already pushed and shared** — use `revert`, not `reset`. `revert` creates a
*new* commit that reverses the old one, so shared history is never rewritten:

```bash
git revert 229f85b
```

**Park work temporarily** — you are mid-change and need a clean tree to do something else:

```bash
git stash          # set changes aside; working tree goes clean
git stash pop      # bring them back
git stash list     # see what is parked
```

### Merge conflicts

A conflict means two branches changed the same lines and git will not guess. It is **normal**, not
a breakage, and nothing is lost.

```
Auto-merging lib/history-schema.ts
CONFLICT (content): Merge conflict in lib/history-schema.ts
Automatic merge failed; fix conflicts and then commit the result.
```

`git status` then lists the files under `Unmerged paths`. Open one and you will find:

```
<<<<<<< HEAD
export type SessionMode = 'passage' | 'drill' | 'freestyle';
=======
export type SessionMode = 'passage' | 'drill' | 'freestyle' | 'bible';
>>>>>>> phase-1-bible-tab
```

Reading the markers:

- Between `<<<<<<< HEAD` and `=======` — the version on the branch you are merging **into**.
- Between `=======` and `>>>>>>> phase-1-bible-tab` — the version **coming in**.

Fix it by editing the file into what you actually want and **deleting all three marker lines**.
Often the answer is one side; sometimes it is a combination. Here it is clearly the incoming version.

```ts
export type SessionMode = 'passage' | 'drill' | 'freestyle' | 'bible';
```

Then:

```bash
git add lib/history-schema.ts     # marks it resolved
git status                         # confirm nothing is left unmerged
git commit                         # completes the merge
```

**If you panic mid-merge, you can always back all the way out:**

```bash
git merge --abort
```

That returns you exactly to before the merge. Nothing lost. Knowing this command exists is what
makes conflicts non-scary.

A conflict-prevention note specific to this project: `lib/history-schema.ts`, `types/history.ts`,
and `app/(tabs)/_layout.tsx` are the files every phase wants to touch — the schema, the record type,
and the tab list. Merge `main` into your phase branch **often** (`git checkout phase-2-auth &&
git merge main`) so you resolve small conflicts continuously instead of one enormous one at the end.

### What a worktree actually is — and when it helps

The previous draft said *"Do not use worktrees; they are for advanced users… and will only confuse
you."* That is bad advice for this owner specifically, because **the owner is working inside Orca,
which is worktree-based.** Dismissing the mechanism you are already standing on is not simplifying
anything.

**A worktree is a second folder on disk, checked out to a different branch, sharing one git
history.** Normally one repo folder shows one branch at a time — `git checkout` swaps the files
under you. With a worktree you get `~/orca/clarity` on `main` **and** `~/orca/clarity-phase2` on
`phase-2-auth`, simultaneously, both backed by the same commits.

```bash
git worktree add ../clarity-phase2 -b phase-2-auth   # new folder + new branch
git worktree list                                     # show all worktrees
git worktree remove ../clarity-phase2                 # clean up when done
```

**When a worktree genuinely helps** — and for this project the first reason is decisive:

1. **A branch switch invalidates your native build.** `git checkout` can change `package.json`,
   `app.json`, or `plugins/`, and per §4.7 those force a native rebuild. Switching back and forth
   between two phases in one folder means repeatedly re-running prebuild and rebuilding — minutes
   each time. Two worktrees keep two `node_modules/` and two `ios/` directories, each already built.
   This is the strongest argument for worktrees in an Expo project.
2. **Comparing two implementations side by side**, both running, in two editor windows.
3. **An urgent fix while mid-phase.** Instead of stashing a half-finished feature, spin up a
   worktree off `main`, fix, ship, delete it. Your in-progress work is never disturbed.
4. **Parallel agents.** This is exactly what Orca does — each agent gets its own worktree so their
   edits cannot collide. Which is also why this document's own instructions say to touch only one
   file: three workers are writing into one shared worktree, and file-level separation is what
   keeps that safe.

**When a worktree is not worth it:** ordinary sequential solo work. If you are doing Phase 2, then
Phase 3, then Phase 4, one at a time, plain branches are simpler and there is nothing to gain.

Things that surprise people: each worktree needs **its own `npm install`/`bun install`** (they do not
share `node_modules/`), each needs its own `.env.local` (gitignored files are not copied), and **you
cannot check out the same branch in two worktrees at once** — git refuses, which is a feature.

### When you are scared

Concrete, in order. This is the section to re-read rather than freeze.

1. **Stop typing git commands.** Nearly all git damage comes from running a second command to fix
   the first without understanding either.
2. **`git status`.** It is read-only and it tells you where you are. Read all of it.
3. **`git log --oneline -10`.** Are your commits still there? Almost always yes. If your work is
   committed, it is very hard to actually lose.
4. **Back up the folder before any "fix."** Nothing is more reliable than a copy:
   ```bash
   cp -R ~/orca/clarity ~/Desktop/clarity-backup-before-i-touch-anything
   ```
   This works, requires understanding nothing, and turns any git disaster into an inconvenience.
5. **Mid-merge and lost?** `git merge --abort`.
6. **Committed something you should not have?** `git reset --soft HEAD~1` keeps the changes.
7. **Think you destroyed a commit?** You probably did not:
   ```bash
   git reflog
   ```
   `reflog` records every position `HEAD` has been at, including ones no branch points to any more.
   Find the hash from before the mistake and `git checkout <hash>` to look, or
   `git reset --hard <hash>` to return. **Commits survive almost every mistake for weeks.**
8. **Rules that prevent most disasters:** never `git reset --hard` without reading `git status`
   first; never `git push --force` on `main`; if a command's output mentions something you do not
   recognise, stop and read it instead of running the next thing.

The reassuring truth: **committed work is very hard to lose.** Uncommitted work is easy to lose.
So commit early, commit often, push branches. The habit that protects you is not knowing clever git
— it is committing frequently enough that any single mistake costs minutes.

---

## 4.15 Phase plan

Ordered by dependency, not ambition. Each phase is one branch, one merge, and a "done" you can test.

**Verify each "Done when" against a running build, not against the code.** `agent-device` is
installed on this machine (v0.20.8) and drives a real build — accessibility tree, taps, logs,
network requests, screenshots. See `AGENTS.md` for the command surface. The critical caveat for this
plan: **the microphone and speech-recognition path cannot be exercised on a simulator**, so every
phase whose "done" involves a real reading session is device-only. Anything verified only on a
simulator should be reported as exactly that. The Expo MCP server (bundled with the
`expo@claude-plugins-official` plugin) is the authority for the 31 `UNVERIFIED:` items in this
document — work through them there rather than from memory.

### Phase 0 — Identity and hygiene (do first, blocks everything)

**Branch:** `phase-0-identity`
**Files:** `app.config.ts`, `app.json`, `.env.example`, `.gitignore`

1. **Decide** whether to change the bundle id at all (§4.1 — keeping `com.schroedernathan.clarity`
   is the lower-risk default). If and only if the owner chooses a new one, set it in
   `app.config.ts` (`BUNDLE_ID`) and `app.json` (`ios.bundleIdentifier`, `android.package`), and
   rename `scheme` alongside it. Do not guess the value.
2. Register the new App ID in the Developer portal. Resolve whether ASC app `6798466426` is reusable
   or a new record is needed (§4.1).
3. Add `"channel": "production"` and `"channel": "development"` to `eas.json` (§4.8).
4. De-duplicate the mic/speech purpose strings — keep the plugin options, drop the `infoPlist`
   copies (§4.12). Investigate and probably remove `NSPhotoLibraryUsageDescription`.
5. Add `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to `.env.example`.
6. **Move the Azure Speech key server-side** (§4.12). This is the highest-value item in this
   document that is not about the Bible at all.
7. `npx expo prebuild --clean` and a fresh development build.

**Done when:** a development build with the new bundle id installs and runs, the pronunciation
feature still works through the server route, and the JS bundle contains no Azure key.

### Phase 1 — Local sync seam (no network)

**Branch:** `phase-1-sync-seam`
**Files:** `types/sync.ts` (new), `lib/history-schema.ts`, `types/history.ts`, `services/sync-queue.ts` (new), `scripts/test-sync.ts` (new)

1. Add `'bible'` to `SessionMode` and the `history-schema.ts` parse. Follow the file's own rule —
   an added field does not need a `RECORD_SCHEMA_VERSION` bump, a changed meaning does. Add the
   `upgradeRecord` step if one is needed.
2. Add the `sync/` and `dead/` MMKV namespaces with the padded-key convention.
3. Build the queue: enqueue, drain (serial, re-entrancy guarded), backoff with jitter, error
   classification, dead-letter. **The transport is a stub that logs.** No Supabase yet.
4. `lib/history-schema.ts` **stays pure** — no React, no `services/`, no react-native imports —
   because `scripts/test-history.ts` runs it under bun. Queue logic that needs MMKV goes in
   `services/`, not `lib/`.
5. Write `scripts/test-sync.ts` covering backoff, idempotent replay, and the merge rules, and add it
   to the `test` script in `package.json` alongside the existing four.

**Done when:** `npm test` passes, and a simulated offline session enqueues ops that survive an app
restart and drain in order against the stub.

### Phase 2 — Auth (native change)

**Branch:** `phase-2-auth`
**Files:** `app.json`, `services/supabase.ts` (new), `services/auth.ts` (new), a sign-in surface, a settings/account surface

1. `npx expo install expo-apple-authentication expo-secure-store @supabase/supabase-js react-native-url-polyfill`
2. Plugin string + `ios.usesAppleSignIn: true`. New native build.
3. `services/supabase.ts` per §4.3 — URL polyfill, MMKV storage adapter, `AppState` auto-refresh
   registered once at module scope.
4. `signInWithIdToken` exchange; register all bundle ids in the Supabase Apple provider.
5. **Switch `runtimeVersion.policy` to `'fingerprint'` (§4.8).** Do it here, in the first phase that
   adds native modules, before any OTA has been published.
6. **Account deletion** with SIWA token revocation. Same phase as auth, not later.

**Done when:** sign-in works on a real device, the session survives a cold start, the token refreshes
on foreground, deletion removes the account and revokes the Apple token, and the app is still fully
usable signed out.

### Phase 3 — Backend and real sync

**Branch:** `phase-3-supabase`
**Files:** `supabase/migrations/*.sql` (new), `services/sync-queue.ts`, `services/sync-merge.ts` (new)

1. Run §4.5's migration as a file under `supabase/migrations/` so it is reviewable in git.
2. RLS per table per operation, indexes, `sync_progress()`.
3. **Verify RLS adversarially** — sign in as A, try to read B's rows, expect zero rows. Run the
   Supabase advisors.
4. Replace the Phase 1 stub transport with real calls.
5. **The first-login merge (§4.4)**, including the ownership guard and the account-switch prompt.
   This is the highest-risk code in the whole plan: it is the only place that can destroy user data.
   Test it explicitly — local-only, remote-only, both-with-overlap, both-with-conflict,
   killed-mid-merge, and different-account.

**Done when:** two devices reading different chapters offline both converge on the union after
foregrounding, and a fresh sign-in on a device with 40 local chapters into an account with 12 remote
ones yields all 52 with no losses.

### Phase 4 — Notifications

**Branch:** `phase-4-notifications`
**Files:** `app.json`, `services/notifications.ts` (new), settings surface

1. `npx expo install expo-notifications` + plugin (`enableBackgroundRemoteNotifications: false`).
   New native build.
2. Contextual permission request after a first completed chapter. Investigate provisional
   authorization.
3. Fixed-local-time `DAILY` scheduling from `user_settings.reminder_hour`, cancel-on-session-complete.
4. State-aware copy through the book display-name map.

**Done when:** a reminder fires at the configured hour, does not fire on a day the user already read,
and denying permission breaks nothing.

### Phase 5 — Monetization and interlink

**Branch:** `phase-5-monetization`

1. RevenueCat dashboard, ASC subscription products, paywall surface, Restore Purchases.
2. Attach IAP products to the version; upload a review screenshot per product.
3. Holy Scroll Tier 1: both bundle ids in the Supabase Apple provider, shared `reading_progress`,
   `app_id` on `devices`. Universal Links for cross-promo.
4. Resolve the placeholders: `group.SHARED_APP_GROUP_ID_TBD` and `HOLY_SCROLL_BUNDLE_ID_TBD` — only
   if Tier 2 is actually wanted.

**Done when:** a sandbox purchase unlocks Pro, restore works on a second device, and signing into
both apps lands on one account.

### Phase 6 — Ship

**Branch:** `phase-6-submission`

1. **Resolve the licensing decision from §4.9 before this phase — it gates what ships.** Build your
   own KJV database, or switch to BSB.
2. Privacy policy matching §4.12's table exactly, including the Azure processor. In ASC **and**
   in-app.
3. Nutrition labels per §4.12, including the Sensitive Info decision.
4. Updated age-rating questionnaire (5-tier) + capability declarations.
5. Generate the Privacy Report in Xcode; confirm every embedded framework has a manifest.
6. Screenshots leading with reading-aloud, to pre-empt a 4.3 duplicate rejection.
7. Demo account with representative reading history; review notes.
8. Internal TestFlight → external TestFlight (Beta App Review) → submit.

**Done when:** approved, and you have an OTA channel you trust for the first JS-only fix.

---

## 4.16 Corrections to the previous draft, for the record

Listed so nothing carried forward by accident. Everything else in the draft was kept and deepened.

| # | Previous claim | Status |
|---|---|---|
| 1 | App Group `group.com.schroedernathan.holyscroll` | **Fabricated.** No such identifier in the repo or any supplied material. Replaced with an explicit `_TBD` placeholder (§4.1, §4.11). |
| 2 | "Consider stripping the GPL notice" | **Removed.** Not acceptable guidance. Replaced with the actual translation-vs-compilation analysis, the GPLv2 §6 / App Store conflict, and three real options (§4.9). |
| 3 | SIWA required "since you will use Supabase Auth (which supports multiple providers)" | **Wrong reasoning.** 4.8 is triggered by *offering* third-party login, not by backend capability (§4.2). |
| 4 | Expo SDK 57 specifics asserted with no verification | **Every claim re-verified** against `docs.expo.dev/versions/v57.0.0/` and `node_modules/`; unverifiable claims now carry `UNVERIFIED:`. |
| 5 | `git add .` as the standard workflow | **Replaced** with deliberate staging, `git status` first, `.gitignore` coverage, and its limits (§4.14). |
| 6 | "Do not use worktrees; they are for advanced users" | **Removed.** The owner works in Orca, which is worktree-based. Replaced with what a worktree is and the Expo-specific case where it genuinely wins (§4.14). |
| 7 | Age rating "likely 12+" | **Impossible.** The 12+ tier was replaced on 2026-01-31 by 4+/9+/13+/16+/18+. This app is 4+ or 9+ (§4.12). |
| 8 | "Add `ITSAppUsesNonExemptEncryption` to `app.config.ts`" | **Already present** in `app.json`. Adding it again is redundant (§4.12). |
| 9 | Privacy manifest needs User ID + Purchase History | **Incomplete.** Never mentioned the microphone, speech recognition, or that audio is POSTed to Microsoft — the app's most sensitive data flow (§4.12). |
| 10 | `repeat_count INTEGER` merged via `MAX` | **Loses data.** Two offline devices each reading once merge to 1. Replaced with the append-only `chapter_completions` log where the count is `count(*)` (§4.4). |
| 11 | `streaks.current_streak INTEGER` synced | **Not mergeable.** A derived value cannot be merged. Replaced with `activity_days`, a set (§4.4). |
| 12 | One `FOR ALL` RLS policy per table | **Unsafe.** It grants clients UPDATE and DELETE on append-only event logs. Replaced with per-operation policies, `(select auth.uid())` wrapping, and `to authenticated` (§4.5). |
| 13 | Streak reminder "24 hours later" | **Drifts.** A rolling offset walks the notification into the middle of the night. Replaced with a fixed local time (§4.6). |
| 14 | Pro tier = "alternative translations (ASV, BSB, YLT, etc.)" | **Partly unsellable.** `AKJV`, `LITV`, `MKJV` declare non-commercial-only terms. Gate the list on a license audit (§4.9). |
