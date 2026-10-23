/**
 * How a line is said, from the words around it: delivery verbs ("whispered", "चिल्लाया", "hanste hue"), adverbs
 * ("angrily", "धीरे से") and the line's own punctuation. A small, explainable cue set of our own; public
 * emotion lexicons are research-licensed, so none is used.
 */
import type { DialogueSpan } from '../cast/dialogue';

export type Emotion =
  'neutral' | 'calm' | 'tender' | 'whisper' | 'sad' | 'fear' | 'excited' | 'angry' | 'shout';

export interface Delivery {
  emotion: Emotion;
  /** 0..1: how strongly the cues point at the emotion. */
  intensity: number;
}

export const NEUTRAL: Delivery = { emotion: 'neutral', intensity: 0 };

// Verbs say how a line was spoken (strong); adverbs and gestures colour it (a little weaker).
// prettier-ignore
const VERB_CUES: Record<Exclude<Emotion, 'neutral'>, string> = {
  whisper: 'whispered whispers whispering murmured murmurs murmuring breathed फुसफुसाया फुसफुसाई फुसफुसायी फुसफुसाते फुसफुसाकर phusphusaya phusphusayi phusphusai phusphusate',
  shout: 'shouted shouts shouting yelled yells screamed screams bellowed roared hollered चिल्लाया चिल्लाई चिल्लायी चिल्लाते चिल्लाकर चीखा चीखी चीखते chillaya chillayi chillai chillate chillakar cheekha cheekhi',
  angry: 'snapped growled snarled barked thundered fumed hissed grumbled demanded गरजा गरजी डांटा डाँटा डांटी डाँटी झल्लाया झल्लाई garja garji daanta daanti dantaa jhallaya jhallayi',
  excited: 'exclaimed laughed laughing giggled giggling chuckled grinned cheered beamed हँसा हँसी हंसा हंसी हँसकर हंसकर हँसते हंसते चहकी चहका hansa hansi hanskar hanste chahki chahka',
  sad: 'sighed sobbed sobbing wept weeping sniffed sniffled रोया रोई रोयी रोते रोकर सिसकी सिसका roya royi roi rote rokar siski siska',
  fear: 'trembled trembling stammered stuttered gasped quavered काँपा काँपी कांपा कांपी काँपते कांपते हकलाया हकलाई kaanpa kaanpi kaanpte haklaya haklayi',
  tender: 'soothed cooed',
  calm: '',
};

// prettier-ignore
const MANNER_CUES: Record<Exclude<Emotion, 'neutral'>, string> = {
  whisper: 'under-her-breath under-his-breath under-their-breath',
  shout: 'loudly at-the-top-of',
  angry: 'angrily furiously sharply crossly irritably गुस्से-से गुस्से-में ग़ुस्से-से gusse-se gusse-mein ghusse-se',
  excited: 'excitedly eagerly happily cheerfully gleefully joyfully खुशी-से ख़ुशी-से khushi-se',
  sad: 'sadly sorrowfully mournfully wearily उदास-होकर उदासी-से udaas-hokar udaasi-se',
  fear: 'nervously fearfully anxiously shakily timidly डरते-हुए डर-से घबराकर घबराते-हुए darte-hue dar-se ghabrakar ghabrate-hue',
  tender: 'softly gently tenderly lovingly kindly fondly प्यार-से धीरे-से नरमी-से pyaar-se pyar-se dheere-se dhire-se',
  calm: 'calmly quietly evenly coolly steadily शांति-से शान्ति-से आराम-से shanti-se aaram-se',
};

const words = (s: string) => s.split(/\s+/).filter(Boolean);

const VERB = new Map<string, Emotion>();
const MANNER = new Map<string, Emotion>();
for (const [emotion, list] of Object.entries(VERB_CUES))
  for (const w of words(list)) VERB.set(w, emotion as Emotion);
for (const [emotion, list] of Object.entries(MANNER_CUES))
  for (const w of words(list)) MANNER.set(w, emotion as Emotion);

const tokens = (s: string) => s.toLowerCase().match(/[\p{L}\p{M}]+/gu) ?? [];

/** The strongest delivery cue in narration around a line ("she whispered", "Arjun ne hanste hue kaha"). */
export function cueIn(narration: string): Delivery {
  const t = tokens(narration);
  let best: Delivery = NEUTRAL;
  const offer = (emotion: Emotion | undefined, intensity: number) => {
    if (emotion && intensity > best.intensity) best = { emotion, intensity };
  };
  for (let i = 0; i < t.length; i++) {
    const w = t[i] ?? '';
    offer(VERB.get(w), 0.7);
    offer(MANNER.get(w), 0.6);
    // Two- and four-word manners: "dheere se", "under her breath", "at the top of".
    offer(MANNER.get(`${w}-${t[i + 1] ?? ''}`), 0.6);
    offer(MANNER.get(`${w}-${t[i + 1] ?? ''}-${t[i + 2] ?? ''}`), 0.6);
    offer(MANNER.get(`${w}-${t[i + 1] ?? ''}-${t[i + 2] ?? ''}-${t[i + 3] ?? ''}`), 0.7);
  }
  return best;
}

const CAPS_WORD = /(?:^|[^\p{L}])(\p{Lu}{3,})(?=[^\p{L}]|$)/u;

/** What the words of a line say on their own: "STOP!" is shouted, "Wait!!" excited, "I-I don't know" afraid. */
export function cueInLine(line: string): Delivery {
  const caps = CAPS_WORD.exec(line)?.[1];
  const letters = line.replace(/[^\p{L}]/gu, '');
  const allCaps =
    letters.length >= 3 && letters === letters.toUpperCase() && letters !== letters.toLowerCase();
  if ((caps && /!/.test(line)) || (allCaps && letters.length >= 4))
    return { emotion: 'shout', intensity: 0.8 };
  if (/\b(\p{L})-\1/iu.test(line)) return { emotion: 'fear', intensity: 0.5 };
  if (/[!?]\s*!|!{2,}/.test(line)) return { emotion: 'excited', intensity: 0.6 };
  if (/!/.test(line)) return { emotion: 'excited', intensity: 0.35 };
  return NEUTRAL;
}

/**
 * The narration around one quotation in its paragraph: back to the previous quotation and on to the next,
 * at most `max` characters each way. This is where "she whispered" and "Maria laughed." live.
 */
export function narrationAround(
  text: string,
  span: DialogueSpan,
  quotes: readonly DialogueSpan[],
  max = 80,
): string {
  const prevEnd = Math.max(0, ...quotes.filter((q) => q.end <= span.start).map((q) => q.end));
  const nextStart = Math.min(text.length, ...quotes.filter((q) => q.start >= span.end).map((q) => q.start));
  const before = text.slice(Math.max(prevEnd, span.start - max), span.start);
  const after = text.slice(span.end, Math.min(nextStart, span.end + max));
  return `${before} ${after}`;
}
