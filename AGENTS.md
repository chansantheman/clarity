# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

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
