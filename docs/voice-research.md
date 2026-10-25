# Expressive narration on a phone: what is possible (October 2026)

The question: can the narrator sound sad, excited, frightened or tender, driven by the per-sentence tags,
on a phone and in Hindi as well as English?

## Models

| Model                      | Size                       | Licence                            | Hindi               | Emotion control                                                    | Fits a phone?                                                        |
| -------------------------- | -------------------------- | ---------------------------------- | ------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------- |
| **Supertonic 3** (current) | ~99M params; our int8 pack | code MIT, model OpenRAIL-M         | yes                 | none per line; 10 inline "expression tags" (see below)             | yes: faster than real time at 4–8 steps on mid-range phones          |
| Kokoro-82M                 | ~86–330 MB by precision    | Apache-2.0                         | 2 voices, "partial" | none                                                               | yes, but no gain in expression, and Hindi is weaker                  |
| Piper (VITS) hi_IN         | ~63 MB per voice           | per voice card (code moved to GPL) | 1–2 voices          | none                                                               | yes; flatter than Supertonic                                         |
| Chatterbox Multilingual    | ~500M params               | MIT                                | yes                 | an "exaggeration" control                                          | no: a 0.5B autoregressive model is far from real time on a phone CPU |
| Indic Parler-TTS           | ~0.9B params               | Apache-2.0 (gated)                 | yes                 | emotion prompts; Hindi is not in its officially tested emotion set | no                                                                   |

No open model is both clearly more expressive and phone-sized, so Supertonic stays and is the only engine.

## Supertonic's expression tags, measured on our model

The model card names `<laugh>`, `<breath>` and `<sigh>`; community notes add `<surprise>`, `<scream>`,
`<throatclear>`, `<sad>`, `<angry>`, `<cough>` and `<yawn>`. `TagProbeTest` (`gradle test -Pprobe=1
-PprobeOut=<dir>`) renders each one before an English and a Hindi line, in a female and a male voice:

- Every tag adds 100–950 ms of **voiced** sound at the start, about as much as writing the plain word
  "laugh" does. From numbers alone a real laugh can't be told apart from the word being half-read.
- `<sad>` and `<angry>` move neither pitch nor loudness in a consistent direction (for example `<angry>`
  made F1 quieter and narrowed her pitch range). They are not emotion controls.

So tags are **not** used in narration: a voice that says "laugh" out loud is worse than no laugh. The
probe's clips are kept for a listening check; if the core three turn out to sound right, they could become
an opt-in setting.

## What drives delivery instead

Each line's tags (emotion, intensity, dialogue or narration, speaker) set three things the engine controls
exactly, applied to **one** render of the voice:

- **Pitch**, a WSOLA pitch shift: sad −1.5 st, whisper −1, excited +1.5, shout +2, and so on.
- **Pace**, a WSOLA time stretch: sad ×0.9, excited ×1.07.
- **Loudness** with a soft knee: whisper −7 dB, shout +3 dB.

The model always renders at its base rate. Asked for another rate, it rendered a different take, whose
own pitch moved by up to ±2.3 st (swamping the emotion), and in Hindi a faster rate mostly shortened its
silent padding rather than the speech. `DeliveryScanTest` measures the result on real renders in both
languages. For example, sad comes out at −0.9 to −1.7 st and 11% longer, and excited at +1.5 to +1.9 st
and 7% shorter.

On top of the emotions:

- Speaker tags ("she said.") are said quicker, quieter and lower.
- A chapter's last lines slow down and settle.
- Pauses follow punctuation, speaker changes and emotion (`perform/plan.ts`).

## Limits

- A pitch shift moves the whole line. Shaping the contour inside a sentence (a rise on a question word,
  stress on one word) needs pitch marks and PSOLA, or a model that takes prosody input. Neither is done.
- Formants move with the pitch, so shifts stay within about ±2 st.
- A whisper is still voiced: quieter, slower and lower, not breathy.
