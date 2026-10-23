/**
 * Who each character is, for casting: age from how the text describes them ("old Mr. Grey", "the little girl",
 * दादी) and temperament from how they usually speak (a character who keeps shouting is fiery).
 */
import { cueIn, narrationAround, type Emotion } from '../perform/cues';
import type { Attribution, Character } from './attribute';
import { NAMED_VOICE_CONFIDENCE } from './voices';

export type Age = 'child' | 'young' | 'adult' | 'old';
export type Temperament = 'calm' | 'gentle' | 'bright' | 'fiery';

export interface Profile {
  age?: Age;
  temperament?: Temperament;
}

// prettier-ignore
const AGE_WORDS: Record<Age, string> = {
  old: 'old elderly aged grey-haired gray-haired white-haired ancient grandfather grandmother grandpa grandma granny grandad बूढ़ा बूढ़ी बूढ़े बुज़ुर्ग बुजुर्ग दादा दादी नाना नानी budha budhi budhe buzurg dada dadi nana nani',
  child: 'little small child kid baby boy girl lad lass toddler नन्हा नन्ही नन्हे बच्चा बच्ची मुन्ना मुन्नी nanha nanhi bachcha bachchi bacha bachi munna munni',
  young: 'young youthful teenage teenager जवान युवा jawan yuva',
  adult: 'mother father mum mom dad mummy papa माँ मां पिताजी मम्मी पापा amma pitaji',
};

const AGE = new Map<string, Age>();
for (const [age, list] of Object.entries(AGE_WORDS))
  for (const w of list.split(/\s+/)) if (w) AGE.set(w, age as Age);

const TEMPERAMENT_OF: Partial<Record<Emotion, Temperament>> = {
  angry: 'fiery',
  shout: 'fiery',
  whisper: 'gentle',
  tender: 'gentle',
  calm: 'calm',
  excited: 'bright',
};

const tokens = (s: string) => s.toLowerCase().match(/[\p{L}\p{M}-]+/gu) ?? [];

/**
 * Profiles every character from the paragraphs (`blocks`, as passed to `analyseCast`) and the attributions,
 * so casting can give the grandmother a low, unhurried voice and the excited child a quick, bright one.
 */
export function profileCharacters(
  blocks: readonly string[],
  characters: readonly Character[],
  attributions: readonly Attribution[],
  quotesByBlock: (block: number) => readonly { start: number; end: number }[],
): Record<string, Profile> {
  const out: Record<string, Profile> = {};
  for (const c of characters) {
    const ages = new Map<Age, number>();
    const voteAge = (word: string, weight: number) => {
      const a = AGE.get(word);
      if (a) ages.set(a, (ages.get(a) ?? 0) + weight);
    };
    // The name itself: Dadi, नानी, Mummy.
    for (const alias of c.aliases) for (const w of tokens(alias)) voteAge(w, 2);
    // The two words just before a mention: "old Mr. Grey", "the little Lucy", "बूढ़ी सीमा".
    for (const text of blocks) {
      if (!text) continue;
      for (const alias of c.aliases) {
        for (let i = text.indexOf(alias); i >= 0; i = text.indexOf(alias, i + alias.length)) {
          if (/[\p{L}\p{M}]/u.test(text[i + alias.length] ?? '')) continue;
          for (const w of tokens(text.slice(Math.max(0, i - 30), i)).slice(-2)) voteAge(w, 1);
        }
      }
    }

    const temperaments = new Map<Temperament, number>();
    let lines = 0;
    for (const a of attributions) {
      if (a.speaker !== c.id || a.confidence < NAMED_VOICE_CONFIDENCE) continue;
      lines++;
      const around = narrationAround(blocks[a.block] ?? '', a.span, quotesByBlock(a.block));
      // "the old man asked": the descriptor in the tag describes the speaker.
      const desc =
        /\b(?:the|a|an|his|her)\s+([\p{L}-]+)\s+(?:man|woman|lady|gentleman|boy|girl|fellow)\b/iu.exec(
          around,
        );
      if (desc) voteAge((desc[1] ?? '').toLowerCase(), 1);
      const cue = cueIn(around);
      const t = TEMPERAMENT_OF[cue.emotion];
      if (t) temperaments.set(t, (temperaments.get(t) ?? 0) + 1);
    }

    const profile: Profile = {};
    const age = [...ages].sort((x, y) => y[1] - x[1])[0];
    if (age) profile.age = age[0];
    // A habit, not one moment: at least two lines and a quarter of what they say.
    const temper = [...temperaments].sort((x, y) => y[1] - x[1])[0];
    if (temper && temper[1] >= 2 && temper[1] >= lines / 4) profile.temperament = temper[0];
    out[c.id] = profile;
  }
  return out;
}
