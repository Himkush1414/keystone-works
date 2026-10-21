# Handoff

The steps below can't be automated from the build environment. Each one lists exactly what to do. This file is updated throughout the project; the latest state is always here.

## 1. Google Play Console

### 1.1 Create the app as **paid** from the very first step

Google Play does **not** allow changing an app from free to paid after it has been published. Once an app has been offered for free, it can only be charged for by creating a new app with a new package name. Therefore:

1. Play Console → **Create app** → App name "Lamplight", default language English (United States), **App**, **Paid**.
2. Package name (set by the first upload): `app.lamplight.reader`.
3. Pricing: Monetize → Products → App pricing → **US $11.99** base, then "Set price by country" using Play's local price suggestions (see the pricing notes in the store-listing section below).

### 1.2 Remaining Play Console steps

_(Filled in as the build reaches each boundary: store listing upload, Data Safety, content rating, foreground service declaration, closed testing, production release.)_

## 2. Things that need your accounts or permissions

### 2.1 Pull requests

Every change goes through a pull request with CI: the JS checks, the Kotlin engine tests on the real model, and the Android debug APK build. The agent merges with `gh pr merge <number> --merge --delete-branch` once CI is green.

`gh` reads the token from `GITHUB_TOKEN` (loaded from `.env.local`). `gh auth login` refuses this token because it lacks the `read:org` scope, which the repository work doesn't need.

**Waiting for you:** nothing.

_If a merge is ever blocked, the exact commands are listed here, in order._

### 2.2 Android emulator on this machine

The user account isn't in the `kvm` group, so the Android emulator can't run here. One command fixes it (then log out and back in to WSL):

```bash
sudo usermod -aG kvm "$USER"
```

### 2.3 Key rotation

The GitHub, Supabase, Expo and Vercel credentials were shared in a chat. Rotate them when convenient and update `.env.local` (never commit it).

## 3. Translations to review

The interface ships in English (source), Spanish, German, French and Brazilian Portuguese. The non-English catalogs (`apps/mobile/src/i18n/catalogs/{es,de,fr,pt}.ts`) were written without a native speaker, so please have each reviewed before launch in its market. Things to check:

- **Voice per language:** tú (es), du (de), vous (fr), você (pt-BR), as the copy deck sets out.
- **French typography:** narrow no-break spaces before `; ! ?` and no-break spaces before `:` and inside « ». `tooling/scripts/french-spacing.mjs` applies them; a reviewer only needs to check the words.
- **Agreement:** adjectives after "voz"/"voix" (feminine) in the voice descriptions (`voices.traits`).

Keys added most recently, which no reviewer has seen yet: `import.added`, `player.expand`, `item.titleField`, `item.authorField`, `voices.traits.*`, `voicePick.choose`.
