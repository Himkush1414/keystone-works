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

### 2.1 Merging pull requests

The agent opens a pull request for each change and waits for CI, but the build environment's permission classifier blocks it from merging ("Merge Without Review"). Either merge on GitHub yourself, or allow the merge call for the agent (Claude Code settings → permissions).

Some pull requests are stacked: each one targets the branch it builds on. Merge them in order, base first. GitHub retargets the next one to `main` when its base branch is deleted. Use **Create a merge commit** so the small commits stay in the history, and delete each branch after merging.

| Order | PR                                                 | Builds on |
| ----- | -------------------------------------------------- | --------- |
| 1     | #12 Android build fix (compileSdk 37) + APK CI job | `main`    |
| 2     | #6 Player queue file                               | `main`    |
| 3     | #7 Time left in chapter and book                   | `main`    |
| 4     | #11 Player state mirror                            | #7        |
| 5     | #8 Import: format detection                        | `main`    |
| 6     | #9 Import: parsing                                 | #8        |
| 7     | #10 Import: end to end                             | #9        |
| 8     | #13 Native SHA-256 for imports                     | `main`    |

### 2.2 Android emulator on this machine

The user account isn't in the `kvm` group, so the Android emulator can't run here. One command fixes it (then log out and back in to WSL):

```bash
sudo usermod -aG kvm "$USER"
```

### 2.3 Key rotation

The GitHub, Supabase, Expo and Vercel credentials were shared in a chat. Rotate them when convenient and update `.env.local` (never commit it).
