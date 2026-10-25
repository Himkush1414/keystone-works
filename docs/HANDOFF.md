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

Keys added most recently, which no reviewer has seen yet: `import.added`, `player.expand`, `item.titleField`, `item.authorField`, `voices.traits.*`, `voicePick.choose`, `settings.expressive*`, `settings.breaths*`, `tiers.*`.

## 4. Checks that need a real phone

There's no emulator on the build machine (section 2.2), so these are verified on a device before release:

- **Splash hand-off:** on Android 12 and later the system draws its own splash icon at a size it chooses. Record the launch at 60 fps and check that the flame doesn't jump when the app's animated splash takes over (feature spec F1, ±1 px). If it does, adjust `ICON` in `apps/mobile/src/ui/AnimatedSplash.tsx`.
- **Word underline colour:** Android ignores `textDecorationColor`, so the read-along underline takes the text colour there. Confirm it still reads clearly in all four reader themes.
- **Continuous reading:** play a long chapter from a cold start (first clear the cache in Android Settings → Apps → Lamplight → Storage → Clear cache). The first words should come within about 1–3 s, depending on the phone. After that, no silence between sentences should be longer than the text asks for: about 0.45 s between sentences, 0.85 s between paragraphs and 1.7 s at a scene break (the values in `PAUSE`, `packages/core/src/pipeline.ts`, plus about 90 ms of quiet edges). `adb logcat -s LamplightPlayback` prints the calibrated speed. If you hear a stall, note the phone model and the sentence. The JVM gap test (`ReadingGapModelTest`) models phones from 0.3× to 2.5× real time at 8 steps with no stalls; a phone slower than that would need fewer steps.
- **No stops inside a sentence:** a long sentence with commas should flow, with a comma no longer than the voice pauses there on its own (about 0.3 s). `GapScanTest` scans real renders: the joins inside a sentence went from about 1.1 s of silence on average to about 0.2 s, and no silence inside a sentence is 0.5 s or longer. If the reading now feels rushed between sentences, raise `PAUSE.sentence`; if commas sound clipped, raise `COMMA_GAP_MS` in `Chunks.kt`.
- **Hindi and English in one line:** in a Hindi story, a long English phrase ("so that I never forget…") should switch to the English pronunciation with no audible gap, while single English words and names (phone, Aarav) stay in the Hindi voice.
- **Word meaning:** long-press a sentence while listening. Narration should pause and the sheet should open within a frame or two. The very first lookup after install unpacks the dictionary (about 29 MB, under a second on most phones); later ones should feel instant. Check that "Hear it" speaks the answer, that Hindi answers show Devanagari, and that "Resume" carries on from the same sentence.
- **Haptics:** buttons give a light knock, segments and switches a tick, and turning off Settings → Haptic feedback silences both.

## 5. Listening checklist (the storyteller voice)

Code can check that the plan is right: who speaks each line, the emotion read from each line, the pauses, the breaths, the numbers in words, and the audio maths (gain, no clipping, breath length and level). It cannot tell whether the result _sounds_ human. Please listen on a phone with headphones and with the speaker, in a quiet room, at 1.0× and at 1.5×.

Each item says what to listen for and which value to change if it's off. All the values are in `packages/core/src/perform/plan.ts` and `packages/core/src/cast/voices.ts` (core) or `.../engine/core/Performance.kt` (engine).

**Who is speaking (Cast).** Open the Pride and Prejudice and A Scandal in Bohemia samples with _Voices for each character_ on.

- [ ] Mr. and Mrs. Bennet have clearly different voices from each other and from the narrator.
- [ ] A line the app isn't sure about is read by the narrator. A wrong character voice is worse than none, so count any line read in the wrong character's voice.
- [ ] Voices stay the same all the way through. Merge two characters in the Cast sheet, and check nobody else's voice changes.
- [ ] Measured accuracy is 94% on text the rules were never tuned on (`packages/core/test/cast-fresh.test.ts`). Note any book where it's clearly worse.

**Delivery from the tags.** What the research found and why it's done this way: `docs/voice-research.md`. The values are in `PROSODY`, `SPEAKER_TAG`, `CHAPTER_END` and `VARIATION` (`packages/core/src/perform/plan.ts`).

- [ ] A sad line sounds lower and slower, not just quieter. An excited line sounds brighter and quicker. If a shift sounds artificial (a "processed" or slightly hollow voice), lower that emotion's `pitch`.
- [ ] Speaker tags ("she said.", "उसने कहा।") sound lighter and quicker than the quote, without being swallowed.
- [ ] The last line of a chapter settles: slower and a touch lower.
- [ ] Narration doesn't sound like a loop of the same line: small changes in pace and pitch from line to line, never wobbly.
- [ ] Hindi gets the same treatment: try the दादी and बाज़ार samples.
- [ ] Optional: the clips from `TagProbeTest` (laugh, sigh, breath…). Is any tag a real laugh or sigh, rather than the word half-read? If one is, it could become a setting.

**Character voices.**

- [ ] An old character (old Mr. Grey, दादी) sounds older: a lower voice and a little slower (`AGE_RATE.old` = 0.93).
- [ ] A child sounds younger: the highest voice of their gender, a little quicker (`AGE_RATE.child` = 1.05). If it sounds rushed, lower it.
- [ ] Two characters who share a voice are still easy to tell apart (`SHARED_RATE`). If the pace change is audible as "sped up", narrow it.

**Delivery (Expressive reading on).**

- [ ] A whisper ("she whispered", "फुसफुसाई") is clearly softer and a touch slower, but still intelligible on a phone speaker (`PROSODY.whisper`: −7 dB, 0.9×). If it's lost under street noise, try −5 dB.
- [ ] A shout ("he roared", "STOP!") is louder without crackling (`PROSODY.shout`: +3 dB, soft knee in `Performance.kt`).
- [ ] Sad and tender lines slow down without dragging. Excited lines speed up without sounding chipmunk-like (`PROSODY.excited` = 1.07).
- [ ] The narrator stays calm through exclamation marks.
- [ ] Questions rise at the end. The model does this itself; we measured +8 Hz median pitch on "?".

**Pauses.**

- [ ] The beat between two speakers feels like a turn in conversation, not a gap (`BEAT.speakerChange` = 220 ms).
- [ ] An ellipsis trails off ("And then…"), and a dash breaks off (`BEAT.ellipsis` 260, `BEAT.dash` 160).
- [ ] A short closing sentence lands ("It was empty."), with `BEAT.reveal` = 180 ms before it.
- [ ] A scene break (`* * *`) is a clear change of scene without feeling like a stall (`SCENE_BREAK_MS` = 1.6 s).
- [ ] Paragraph and chapter pauses still feel right at 1.5×.

**Breaths (Natural breaths on).**

- [ ] On headphones, a breath before a long sentence or an emotional line sounds like an inhale, not static or a hiss (`BREATH_RMS_DB` = −36 dBFS; band 500 Hz–3.5 kHz).
- [ ] Breaths are rare enough not to be noticed as a pattern (at most one every 4 lines).
- [ ] Turning _Natural breaths_ off removes them completely.

**Hindi and Hinglish.**

- [ ] A Hindi story reads naturally, including numbers (एक लाख पच्चीस हज़ार), years (उन्नीस सौ चौरासी) and times (साढ़े तीन बजे).
- [ ] A Hinglish story ("Tum kahan ja rahe ho?") is read by the Hindi voice with Hindi words in Devanagari. English words inside it (match, movie, Netflix) should still sound English enough. This is the biggest unknown: if it sounds wrong, Hinglish can be sent to the English voice by removing the Hinglish rule in `packages/core/src/text/normalize.ts`.
- [ ] A Devanagari line inside an English book switches to the Hindi voice cleanly, and back.

**Languages.**

- [ ] Settings → Voice languages: spot-check one _good_ language (Spanish) and one _basic_ one (Japanese) and confirm the descriptions are fair.

**Speed of the first sentence.**

- [ ] Pressing play on a freshly imported book starts speaking about as quickly as before. Rate, gain and breath add only microseconds per sentence, but confirm it on a mid-range phone.

When something sounds off, note the book, the sentence and the setting. That is enough to tune the value named next to it.
