<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/readme/hero-dark.png">
    <img alt="Lamplight: books, documents and articles, read aloud like a storyteller" src="docs/readme/hero-light.png" width="100%">
  </picture>
</p>

<p align="center">
  <a href="https://github.com/Himkush1414/keystone-works/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/Himkush1414/keystone-works/actions/workflows/ci.yml/badge.svg?branch=main"></a>
  <a href="https://github.com/Himkush1414/keystone-works/actions/workflows/android.yml"><img alt="Android build" src="https://github.com/Himkush1414/keystone-works/actions/workflows/android.yml/badge.svg?branch=main"></a>
  <img alt="Platform: Android" src="https://img.shields.io/badge/platform-Android-3DDC84?logo=android&logoColor=white">
  <img alt="31 voice languages" src="https://img.shields.io/badge/voice%20languages-31-9C5313">
  <img alt="Works offline" src="https://img.shields.io/badge/works-offline-1C1915">
  <br>
  <img alt="Expo SDK 58" src="https://img.shields.io/badge/Expo-SDK%2058-000020?logo=expo&logoColor=white">
  <img alt="React Native 0.88" src="https://img.shields.io/badge/React%20Native-0.88-61DAFB?logo=react&logoColor=black">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript&logoColor=white">
  <img alt="Kotlin" src="https://img.shields.io/badge/Kotlin-engine-7F52FF?logo=kotlin&logoColor=white">
  <img alt="ONNX Runtime" src="https://img.shields.io/badge/ONNX%20Runtime-1.31-005CED?logo=onnx&logoColor=white">
</p>

---

## What it is

Lamplight is an Android app that reads your books, documents and articles aloud with natural voices. The voices run **entirely on the phone**. There's no account, no cloud and no tracking, and your library never leaves the device.

## Why it's different

- **A storyteller, not a screen reader.** Lamplight works out who is speaking, gives each character a voice that suits them, and performs the lines: a whisper is soft, a shout is loud, and the pause between two speakers feels like a turn in conversation.
- **Private by design.** Speech is generated on the device by an ONNX voice model. Nothing is uploaded.
- **Reads what you actually have.** It handles EPUB, PDF, Word, web pages and plain text, and _Clean Read_ quietly skips page numbers, running headers and citations.
- **Made for English and Hindi first.** It also speaks 29 more languages, with each language's support level stated honestly in Settings.

## Features

| Area                   | What you get                                                                                                                                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Listen**             | Read-along with the current word underlined · speeds 0.75×–2× · sleep timer (minutes or end of chapter) · chapter contents · background playback with lock-screen controls · resume where you left off                                                 |
| **Cast**               | Speakers found in English, Hindi and Hinglish (speech verbs, names, pronouns, turn-taking) · voices cast by gender, age and temperament · voices kept for the whole book · your own choice for any character wins · merge two names into one character |
| **Expressive reading** | Whisper, shout, anger, excitement, sadness, fear, tenderness and calm shape pace and loudness · deliberate pauses for ellipses, dashes, speaker changes, reveals and scene breaks · optional natural breaths                                           |
| **Clean Read**         | Skips page numbers, running headers and footers, citations and links · review what was skipped and change it per document                                                                                                                              |
| **Pronunciation**      | Your own dictionary for names and terms · numbers, dates, times, money and units read as words, including Hindi (लाख, करोड़, साढ़े तीन बजे) · Hinglish read by the Hindi voice                                                                         |
| **Library**            | Import a file, paste text or start from a sample · shelves for books, documents and articles · "continue listening" · search across titles and full text                                                                                               |
| **Voices**             | 10 voices · Live, Studio and Studio+ quality, or Automatic · voice and quality per document                                                                                                                                                            |
| **Comfort**            | Light and dark themes · four reader themes · Literata, Atkinson Hyperlegible and OpenDyslexic · reduce motion · interface in English, Spanish, German, French and Brazilian Portuguese                                                                 |

## Screenshots

<table>
  <tr>
    <td align="center"><img src="docs/readme/library-light.png" width="200" alt="Library"><br><sub><b>Library</b></sub></td>
    <td align="center"><img src="docs/readme/player-light.png" width="200" alt="Player with read-along"><br><sub><b>Read-along player</b></sub></td>
    <td align="center"><img src="docs/readme/cast-light.png" width="200" alt="Cast sheet"><br><sub><b>Cast</b></sub></td>
    <td align="center"><img src="docs/readme/clean-light.png" width="200" alt="Clean Read review"><br><sub><b>Clean Read</b></sub></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/readme/library-dark.png" width="200" alt="Library, dark"><br><sub>Library · dark</sub></td>
    <td align="center"><img src="docs/readme/player-dark.png" width="200" alt="Player, dark"><br><sub>Player · dark</sub></td>
    <td align="center"><img src="docs/readme/cast-dark.png" width="200" alt="Cast, dark"><br><sub>Cast · dark</sub></td>
    <td align="center"><img src="docs/readme/clean-dark.png" width="200" alt="Clean Read, dark"><br><sub>Clean Read · dark</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/readme/settings-light.png" width="200" alt="Settings"><br><sub><b>Settings</b></sub></td>
    <td align="center"><img src="docs/readme/search-light.png" width="200" alt="Search"><br><sub><b>Search</b></sub></td>
    <td align="center"><img src="docs/readme/voice-light.png" width="200" alt="Choose a voice during onboarding"><br><sub><b>Onboarding: choose a voice</b></sub></td>
    <td align="center"><img src="docs/readme/settings-dark.png" width="200" alt="Settings, dark"><br><sub>Settings · dark</sub></td>
  </tr>
</table>

## How it works

1. **Import.** `@lamplight/core` turns EPUB, PDF, DOCX, HTML or text into blocks, chapters and sentences, detects the language, and marks clutter for Clean Read.
2. **Understand.** Cast finds the dialogue, works out who says each line, and profiles every character. It all happens once, at import, and is stored in SQLite.
3. **Perform.** At play time, the queue builder normalises each sentence for speech (numbers, abbreviations, Hinglish), picks its voice, and plans its delivery: pace, loudness, the pause after it, and a breath before it.
4. **Speak.** The Kotlin engine runs the voice model with ONNX Runtime ahead of the playhead, applies the performance, caches the audio, and plays it through a Media3 session.

```mermaid
flowchart LR
  subgraph App["React Native app (TypeScript)"]
    UI["Screens<br/>expo-router"] --> State["State<br/>zustand"]
    State --> DB[("SQLite<br/>library · positions · FTS5")]
  end
  subgraph Core["@lamplight/core"]
    Import["Import<br/>EPUB · PDF · DOCX · HTML"] --> Clean["Clean Read"]
    Clean --> Cast["Cast<br/>speakers · profiles"]
    Cast --> Plan["Normalise + perform<br/>words · pace · pauses · breaths"]
  end
  subgraph Engine["Native engine (Kotlin)"]
    Queue["Queue"] --> TTS["Supertonic 3<br/>ONNX Runtime"]
    TTS --> FX["Gain · breath"]
    FX --> Cache[("Audio cache")]
    FX --> Media["Media3 session"]
  end
  Import -. at import .-> DB
  DB --> Plan
  Plan -- "queue JSON" --> Queue
  Media -- "progress events" --> State
```

## Built with

| Layer            | Technology                                                                                                                         |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Mobile app       | Expo SDK 58 · React Native 0.88 · React 19 · expo-router · TypeScript 6 · zustand 5 · Reanimated 4                                 |
| Storage          | expo-sqlite with FTS5 full-text search; everything stays on the device                                                             |
| Shared core      | `@lamplight/core` (TypeScript): import (htmlparser2, fflate), Clean Read, Cast, text normalisation, performance plan               |
| Native engine    | Kotlin Expo module · ONNX Runtime for Android 1.31 · AndroidX Media3 1.11 (session and playback)                                   |
| Voice model      | Supertonic 3 by Supertone (int8, 31 languages, 10 voices), bundled in the app                                                      |
| Reference engine | `@lamplight/engine-web`: a TypeScript port on onnxruntime-node, used to check the Kotlin engine against the same output            |
| Design system    | `@lamplight/tokens` and `@lamplight/icons` · Literata, Fraunces, Atkinson Hyperlegible Next, OpenDyslexic                          |
| Backend          | None, by design. The app works fully offline and needs no account                                                                  |
| Quality          | Vitest · ESLint · Prettier · a secret scan on every tracked file · JUnit 5 tests that run the Kotlin engine against the real model |
| CI               | GitHub Actions: typecheck, lint, format and tests · Kotlin engine on the JVM with the real model · Android arm64 build             |

## Project structure

```text
apps/
  mobile/                  Expo app: screens (src/app), library, player, settings, onboarding
    modules/lamplight-engine/
      android/             Kotlin engine: ONNX synthesis, playback, cache, performance
      engine-core-jvm/     Runs the same engine sources on the JVM for tests
packages/
  core/                    Import, Clean Read, Cast, normalisation, queue and performance plan
  engine-web/              TypeScript reference engine (parity tests)
  tokens/                  Colours, type, spacing and motion
  icons/                   Icon set
tooling/scripts/           verify, secret scan, engine assets, brand and font tooling
docs/                      Handoff notes and README assets
```

## Getting started (developers)

Prerequisites: Node 24 or later, JDK 17, and the Android SDK (for device builds).

```bash
npm ci
npm run verify              # secret scan, typecheck, lint, format and every test
cd apps/mobile && npx expo start
```

Android build:

```bash
cd apps/mobile
npx expo prebuild --platform android
cd android && ./gradlew -PreactNativeArchitectures=arm64-v8a :app:assembleDebug
```

The build downloads the voice-model asset pack and refuses it unless its SHA-256 checksum matches. The engine's JVM tests run with `gradle test` in `apps/mobile/modules/lamplight-engine/engine-core-jvm`.

## Roadmap

**Shipped**

- [x] Import of EPUB, PDF, DOCX, HTML, text and paste · library, shelves and full-text search
- [x] On-device voices with read-along, sleep timer, contents, background playback and resume
- [x] Clean Read with a per-document review · pronunciation dictionary
- [x] Cast: speakers in English, Hindi and Hinglish; voices cast by age and temperament and kept for the whole book
- [x] Expressive reading: emotion, deliberate pauses and natural breaths
- [x] Hindi numbers, dates and times · Hinglish read by the Hindi voice · language quality tiers

**Planned**

- [ ] Seamless, gap-free reading, with sentences prepared further ahead
- [ ] Natural switching between Hindi and English within a sentence
- [ ] "What does this word mean here?" while listening
- [ ] Backup and restore · import from the share sheet and from web links
- [ ] Bookmarks and highlights · audio export
- [ ] Website and store release

## Credits

| Work                                                                                                                                                                                                                              | Author                                                             | License                | How it's used                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------- | ------------------------------------------------------------- |
| [Supertonic 3](https://huggingface.co/Supertone/supertonic-3) voice model                                                                                                                                                         | Supertone Inc.                                                     | BigScience Open RAIL-M | Bundled; speaks every sentence                                |
| [supertonic](https://github.com/supertone-inc/supertonic) reference implementation                                                                                                                                                | Supertone Inc.                                                     | MIT                    | Text preprocessing follows it                                 |
| [WordNet 3.1](https://wordnet.princeton.edu)                                                                                                                                                                                      | Princeton University                                               | WordNet License        | English meanings for "What does this word mean here?"         |
| [Wiktionary](https://en.wiktionary.org) Hindi entries via [kaikki.org](https://kaikki.org)                                                                                                                                        | Wiktionary contributors                                            | CC BY-SA 4.0           | Hindi meanings and Hindi words for English ones               |
| [ONNX Runtime](https://github.com/microsoft/onnxruntime)                                                                                                                                                                          | Microsoft                                                          | MIT                    | Runs the model on Android and in tests                        |
| [AndroidX Media3](https://github.com/androidx/media)                                                                                                                                                                              | Google                                                             | Apache-2.0             | Playback and media session                                    |
| [Expo](https://github.com/expo/expo) · [React Native](https://github.com/facebook/react-native)                                                                                                                                   | Expo · Meta                                                        | MIT                    | App framework                                                 |
| [htmlparser2](https://github.com/fb55/htmlparser2) · [fflate](https://github.com/101arrowz/fflate)                                                                                                                                | Felix Böhm · Arjun Barrett                                         | MIT                    | HTML and archive parsing                                      |
| [Literata](https://github.com/googlefonts/literata) · [Fraunces](https://github.com/undercasetype/Fraunces) · [Atkinson Hyperlegible Next](https://www.brailleinstitute.org/freefont/) · [OpenDyslexic](https://opendyslexic.org) | TypeTogether · Undercase Type · Braille Institute · Abbie Gonzalez | SIL OFL 1.1            | Reader and interface fonts                                    |
| [ponytail](https://github.com/DietrichGebert/ponytail) · [gstack](https://github.com/garrytan/gstack)                                                                                                                             | Dietrich Gebert · Garry Tan                                        | MIT                    | Reference for engineering and review practices (no code used) |
| [OmniVoice](https://github.com/k2-fsa/OmniVoice)                                                                                                                                                                                  | k2-fsa                                                             | Apache-2.0             | Researched for multilingual voice (not shipped)               |

Sample texts are public-domain works by Jane Austen, Arthur Conan Doyle and Henry David Thoreau. Each font's license ships next to it in `apps/mobile/assets/fonts/`.

## License

Copyright © 2026 Lamplight. **All rights reserved.**

Lamplight is a commercial app. The source is public so you can read it, but no license is granted to copy, modify, distribute or publish it, or the app built from it. Third-party components remain under their own licenses, listed above.
