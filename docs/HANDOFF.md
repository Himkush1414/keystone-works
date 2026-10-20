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

### 2.1 Pull requests (automation was blocked)

The build environment's permission classifier blocked merging pull requests automatically ("Merge Without Review"). Work has been pushed directly to `main` after full local verification (typecheck, lint, format, tests, secret scan), which you explicitly authorised. To enable the feature-branch + PR flow, allow these commands for the agent (Claude Code settings → permissions), or run them yourself:

```bash
# open a PR from a pushed branch
curl -sS -X POST -H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/Himkush1414/keystone-works/pulls \
  -d '{"title":"<title>","head":"<branch>","base":"main","body":"<description>"}'

# merge it after CI passes (merge commit keeps the atomic commits)
curl -sS -X PUT -H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/Himkush1414/keystone-works/pulls/<number>/merge \
  -d '{"merge_method":"merge"}'

# delete the branch
curl -sS -X DELETE -H "Authorization: Bearer $GITHUB_TOKEN" \
  https://api.github.com/repos/Himkush1414/keystone-works/git/refs/heads/<branch>
```

### 2.2 Android emulator on this machine

The user account isn't in the `kvm` group, so the Android emulator can't run here. One command fixes it (then log out and back in to WSL):

```bash
sudo usermod -aG kvm "$USER"
```

### 2.3 Key rotation

The GitHub, Supabase, Expo and Vercel credentials were shared in a chat. Rotate them when convenient and update `.env.local` (never commit it).
