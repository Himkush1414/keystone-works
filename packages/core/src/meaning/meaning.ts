/**
 * "What does this word mean here?": a short, context-aware meaning from the on-device dictionary (WordNet for
 * English senses, Wiktionary for Hindi). The sense is chosen by how much its definition, example and
 * synonyms share with the passage around the word (a simplified Lesk), with the dictionary's own order
 * (most common first) breaking ties. Pure: the app looks the candidates up and hands the rows in.
 */
import { hinglishWord } from '../text/hinglish';

/** One English sense (table `en`). */
export interface EnSense {
  word: string;
  /** n, v, a (adjective) or r (adverb). */
  pos: string;
  rank: number;
  gloss: string;
  example?: string | null;
  /** Other words for this sense, `|`-separated. */
  syn?: string | null;
  /** How many of this part of speech's senses were seen in tagged text: 0 for rare uses. */
  tagged?: number;
}

/** One Hindi sense (table `hi`), glossed in English. */
export interface HiSense {
  word: string;
  pos: string;
  rank: number;
  gloss: string;
  roman?: string | null;
  syn?: string | null;
  example?: string | null;
  exampleEn?: string | null;
}

/** A Hindi word for an English one (table `en_hi` joined with the Hindi word's gloss). */
export interface HiEquivalent {
  en: string;
  hi: string;
  rank: number;
  gloss: string;
}

export interface LookupRequest {
  /** English lemmas to look up (the word and its possible base forms). */
  en: string[];
  /** Hindi words or inflected forms. */
  hi: string[];
}

export interface LookupRows {
  en: EnSense[];
  hi: HiSense[];
  enHi: HiEquivalent[];
  /** Inflected Hindi forms the dictionary knows, with their headword (गलियों → गली). */
  hiForms?: { form: string; word: string }[];
}

export interface Meaning {
  /** The word as it appears in the text. */
  word: string;
  /** Its dictionary form. */
  lemma: string;
  lang: 'en' | 'hi';
  pos?: string;
  /** Latin spelling of a Hindi word. */
  roman?: string;
  /** In English. */
  definition: string;
  example?: string;
  synonyms: string[];
  /** Hindi equivalents of an English word, or Hindi synonyms of a Hindi one. */
  hindi: string[];
  /** How many other senses the dictionary has. */
  otherSenses: number;
}

const POS_NAMES: Record<string, string> = {
  n: 'noun',
  v: 'verb',
  a: 'adjective',
  s: 'adjective',
  r: 'adverb',
  noun: 'noun',
  verb: 'verb',
  adj: 'adjective',
  adv: 'adverb',
  pron: 'pronoun',
  postp: 'postposition',
  conj: 'conjunction',
  intj: 'interjection',
  num: 'number',
  particle: 'particle',
  det: 'determiner',
  name: 'name',
};

const DEVANAGARI = /\p{Script=Devanagari}/u;

/** The word without surrounding punctuation; null if nothing word-like is left. */
export function cleanWord(raw: string): string | null {
  const w = raw.replace(/^[^\p{L}\p{M}]+|[^\p{L}\p{M}]+$/gu, '').replace(/['’]s$/u, '');
  return w ? w : null;
}

// prettier-ignore
const IRREGULAR: Record<string, string> = {
  was: 'be', were: 'be', been: 'be', is: 'be', am: 'be', are: 'be', had: 'have', has: 'have', did: 'do',
  done: 'do', does: 'do', said: 'say', went: 'go', gone: 'go', came: 'come', took: 'take', taken: 'take',
  made: 'make', saw: 'see', seen: 'see', knew: 'know', known: 'know', thought: 'think', told: 'tell',
  found: 'find', gave: 'give', given: 'give', left: 'leave', felt: 'feel', began: 'begin', begun: 'begin',
  kept: 'keep', held: 'hold', stood: 'stand', heard: 'hear', brought: 'bring', wrote: 'write',
  written: 'write', sat: 'sit', spoke: 'speak', spoken: 'speak', ran: 'run', met: 'meet', paid: 'pay',
  meant: 'mean', lost: 'lose', led: 'lead', sent: 'send', built: 'build', spent: 'spend', fell: 'fall',
  fallen: 'fall', rose: 'rise', risen: 'rise', drew: 'draw', drawn: 'draw', grew: 'grow', grown: 'grow',
  threw: 'throw', thrown: 'throw', wore: 'wear', worn: 'wear', bore: 'bear', borne: 'bear', chose: 'choose',
  chosen: 'choose', drove: 'drive', driven: 'drive', rode: 'ride', ridden: 'ride', ate: 'eat', eaten: 'eat',
  forgot: 'forget', forgotten: 'forget', caught: 'catch', taught: 'teach', bought: 'buy', fought: 'fight',
  sought: 'seek', slept: 'sleep', wept: 'weep', swept: 'sweep', crept: 'creep', dealt: 'deal', laid: 'lay',
  lay: 'lie', lain: 'lie', hid: 'hide', hidden: 'hide', shook: 'shake', shaken: 'shake', woke: 'wake',
  woken: 'wake', struck: 'strike', stuck: 'stick', hung: 'hang', swung: 'swing', sang: 'sing', sung: 'sing',
  rang: 'ring', rung: 'ring', drank: 'drink', drunk: 'drink', swam: 'swim', flew: 'fly', flown: 'fly',
  men: 'man', women: 'woman', children: 'child', feet: 'foot', teeth: 'tooth', geese: 'goose', mice: 'mouse',
  people: 'person', wives: 'wife', lives: 'life', knives: 'knife', leaves: 'leaf', selves: 'self',
  better: 'good', best: 'good', worse: 'bad', worst: 'bad', further: 'far', farther: 'far',
};

/** Possible dictionary forms of an English word (WordNet's morphy rules plus common irregular forms). */
export function englishLemmas(word: string): string[] {
  const w = word.toLowerCase();
  const out = [w];
  const add = (x: string) => {
    if (x.length > 1 && !out.includes(x)) out.push(x);
  };
  const irregular = IRREGULAR[w];
  if (irregular) add(irregular);
  const rules: [string, string][] = [
    ['ies', 'y'], ['ses', 's'], ['xes', 'x'], ['zes', 'z'], ['ches', 'ch'], ['shes', 'sh'], ['men', 'man'],
    ['es', 'e'], ['es', ''], ['s', ''], ['ied', 'y'], ['ed', 'e'], ['ed', ''], ['ing', 'e'], ['ing', ''],
    ['ier', 'y'], ['iest', 'y'], ['er', 'e'], ['er', ''], ['est', 'e'], ['est', ''], ['ly', ''], ['ily', 'y'],
  ]; // prettier-ignore
  for (const [suffix, to] of rules) {
    if (!w.endsWith(suffix) || w.length - suffix.length < 2) continue;
    const stem = w.slice(0, -suffix.length);
    add(stem + to);
    // stopped → stop, running → run
    if (!to && /([b-df-hj-np-tv-z])\1$/.test(stem)) add(stem.slice(0, -1));
  }
  return out;
}

// Inflections, longest first: मुस्कुराईं → मुस्कुरा(ना), लड़कियों → लड़की.
const HINDI_SUFFIXES = [
  'ियों',
  'ईं',
  'ियाँ',
  'ाएँ',
  'ाईं',
  'ाई',
  'ीं',
  'ों',
  'ें',
  'ाँ',
  'ते',
  'ती',
  'ता',
  'ना',
  'ने',
  'नी',
  'कर',
  'या',
  'यी',
  'ये',
  'ई',
  'ए',
  'ी',
  'े',
  'ा',
  'ो',
];

/** The word and the dictionary forms it may come from. */
export function hindiCandidates(word: string): string[] {
  const out = [word];
  for (const suffix of HINDI_SUFFIXES) {
    if (!word.endsWith(suffix) || word.length - suffix.length < 2) continue;
    const stem = word.slice(0, -suffix.length);
    for (const c of [
      stem,
      `${stem}ना`,
      `${stem}ा`,
      `${stem}ी`,
      ...(suffix.startsWith('ि') ? [`${stem}ी`] : []),
    ])
      if (!out.includes(c)) out.push(c);
  }
  return out;
}

/** What to look up for [raw]; null when there's nothing to look up. */
export function lookupRequest(raw: string): LookupRequest | null {
  const word = cleanWord(raw);
  if (!word) return null;
  if (DEVANAGARI.test(word)) return { en: [], hi: hindiCandidates(word) };
  const romanised = hinglishWord(word);
  return { en: englishLemmas(word), hi: romanised ? [romanised] : [] };
}

// prettier-ignore
const STOP = new Set(('a an the of and or but to in on at by for with from as is was were be been being it its this that these those he she his her him they them their we us our you your i me my mine not no so if then than there here what which who whom whose when where why how all any some one very can could would should will shall may might must do does did have has had into out up down over under about after before again just only also such own same too said says like').split(' '));

/** Content words of a passage, crudely stemmed so "fortunes" meets "fortune". */
function contentWords(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.toLowerCase().matchAll(/[\p{L}\p{M}]+/gu)) {
    const w = m[0];
    if (w.length < 3 || STOP.has(w)) continue;
    out.add(stem(w));
  }
  return out;
}

function stem(w: string): string {
  return w.replace(/(ies|es|s|ed|ing|ly|er|est)$/u, '').slice(0, 7) || w;
}

function overlap(a: Set<string>, text: string): number {
  let n = 0;
  for (const w of contentWords(text)) if (a.has(w)) n++;
  return n;
}

/** The part of speech the words around it suggest: after "to" or "will" a verb, after "the" a noun. */
function posHint(context: string, word: string): string | null {
  const re = new RegExp(`([\\p{L}']+)\\s+${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'iu');
  const before = context.match(re)?.[1]?.toLowerCase();
  if (!before) return null;
  if (/^(to|will|would|can|could|shall|should|may|might|must|did|do|does|not)$/.test(before)) return 'v';
  // "is let", "so tiresome": a verb or an adjective, not a noun.
  if (/^(is|was|were|be|been|being|are|am|so|very|too|quite)$/.test(before)) return 'va';
  if (/^(a|an|the|his|her|my|your|our|their|its|this|that|these|those|some|every|each)$/.test(before))
    return 'n';
  return null;
}

/**
 * Fixed expressions that settle a sense the other words in the sentence can't: a fortune someone possesses,
 * makes or inherits is wealth, not luck; "in want of" and "for want of" are lack, not poverty.
 */
const EXPRESSIONS: { lemma: string; around: RegExp; gloss: RegExp }[] = [
  {
    lemma: 'fortune',
    around:
      /\b(?:possess\w*\s+of|ma[dk]e|making|inherit\w*|amass\w*|spen[dt]|worth|cost)\s+(?:[\p{L}']+\s+){0,2}fortunes?\b/iu,
    gloss: /\bwealth\b/,
  },
  { lemma: 'want', around: /\b(?:in|for)\s+want\s+of\b/i, gloss: /\bneeding\b/ },
];

/** A Hindi sense that names a god or a person: "सूर्य" in a sentence is the sun unless the text says otherwise. */
const HI_PROPER = /\b(?:god|goddess|deity|given name)\b/i;

function list(s: string | null | undefined): string[] {
  return s ? s.split('|').filter(Boolean) : [];
}

/**
 * The meaning of [raw] in [context] (the sentence, or better the paragraph, it was heard in), from the rows
 * the lookup returned; null when the dictionary doesn't know the word.
 */
export function explain(raw: string, context: string, rows: LookupRows): Meaning | null {
  const word = cleanWord(raw);
  if (!word) return null;
  const ctx = contentWords(context);
  ctx.delete(stem(word.toLowerCase()));
  if (DEVANAGARI.test(word) || (rows.hi.length && !rows.en.length)) return explainHindi(word, ctx, rows);
  if (!rows.en.length) return null;
  // The closest base form the dictionary has (the word itself before "fortune" from "fortunes").
  const lemmas = englishLemmas(word);
  const lemma = lemmas.find((l) => rows.en.some((r) => r.word === l)) ?? rows.en[0]?.word ?? word;
  const senses = rows.en.filter((r) => r.word === lemma);
  const hint = posHint(context, word);
  const fixed = EXPRESSIONS.filter((e) => e.lemma === lemma && e.around.test(context));
  const scored = senses.map((s) => {
    const words = `${s.gloss} ${s.example ?? ''} ${list(s.syn).join(' ')}`;
    const hinted = hint !== null && (hint === 'va' ? s.pos !== 'n' : s.pos === hint);
    const expression = fixed.some((e) => e.gloss.test(s.gloss));
    const score =
      overlap(ctx, words) * 2 +
      (hinted ? 1.5 : 0) +
      (expression ? 3 : 0) +
      ((s.tagged ?? 0) > 0 ? 0.75 : 0) -
      s.rank * 0.25;
    return { s, score };
  });
  scored.sort((a, b) => b.score - a.score || a.s.rank - b.s.rank);
  const best = scored[0]?.s;
  if (!best) return null;
  const synonyms = list(best.syn);
  // Hindi words whose own gloss matches this sense best: "fortune" as wealth is धन, as luck भाग्य.
  const senseWords = contentWords(`${best.gloss} ${synonyms.join(' ')} ${lemma}`);
  const exact = (h: HiEquivalent) =>
    h.gloss
      .replace(/\([^)]*\)/g, '')
      .trim()
      .toLowerCase() === h.en;
  const ranked = rows.enHi
    .filter((h) => h.en === lemma || synonyms.includes(h.en))
    .map((h) => ({
      h,
      score: overlap(senseWords, h.gloss) * 2 + (h.en === lemma ? 1 : 0) + (exact(h) ? 1 : 0) - h.rank * 0.05,
    }))
    .sort((a, b) => b.score - a.score);
  // Only the ones about as good as the best: a word that means exactly this beats a list of near misses.
  const top = ranked[0]?.score ?? 0;
  const hindi = ranked
    .filter((x) => x.score >= top - 0.5)
    .map((x) => x.h.hi)
    .filter((h, k, all) => all.indexOf(h) === k)
    .slice(0, 3);
  return {
    word,
    lemma,
    lang: 'en',
    pos: POS_NAMES[best.pos] ?? best.pos,
    definition: best.gloss,
    ...(best.example ? { example: best.example } : {}),
    synonyms: synonyms.slice(0, 3),
    hindi,
    otherSenses: senses.length - 1,
  };
}

function explainHindi(word: string, ctx: Set<string>, lookup: LookupRows): Meaning | null {
  const rows = lookup.hi;
  if (!rows.length) return null;
  // The headword: the word itself if it is one, then what the dictionary's own forms say (गलियों → गली),
  // then a guess from its ending (मुस्कुराईं → मुस्कुराना).
  const has = (w: string) => rows.some((r) => r.word === w);
  const lemma =
    (has(word) ? word : undefined) ??
    lookup.hiForms?.find((f) => f.form === word && has(f.word))?.word ??
    hindiCandidates(word).find(has) ??
    rows[0]?.word ??
    word;
  const senses = rows.filter((r) => r.word === lemma);
  const common = senses.some((s) => !HI_PROPER.test(s.gloss));
  const best = senses
    .map((s) => ({
      s,
      score:
        overlap(ctx, `${s.gloss} ${s.exampleEn ?? ''}`) * 2 -
        s.rank * 0.25 -
        (common && HI_PROPER.test(s.gloss) ? 0.6 : 0),
    }))
    .sort((a, b) => b.score - a.score || a.s.rank - b.s.rank)[0]?.s;
  if (!best) return null;
  return {
    word,
    lemma,
    lang: 'hi',
    pos: POS_NAMES[best.pos] ?? best.pos,
    ...(best.roman ? { roman: best.roman } : {}),
    definition: best.gloss,
    ...(best.example ? { example: best.example } : {}),
    synonyms: [],
    hindi: list(best.syn).slice(0, 3),
    otherSenses: senses.length - 1,
  };
}

export type AnswerLanguage = 'en' | 'hi';

/** The answer as the sheet shows it, and what the voice says when the listener asks to hear it. */
export interface Answer {
  headline: string;
  detail?: string;
  speak: { text: string; lang: AnswerLanguage };
}

/**
 * A short answer in the listener's language. In Hindi an English word is answered with its Hindi
 * equivalents and a Hindi word with its Hindi synonyms; the English definition is kept as the detail.
 */
export function answer(m: Meaning, lang: AnswerLanguage): Answer {
  const english = m.definition.charAt(0).toUpperCase() + m.definition.slice(1);
  if (lang === 'hi' && m.hindi.length) {
    const hindi = m.hindi.join(', ');
    return { headline: hindi, detail: english, speak: { text: `${m.lemma}: ${hindi}।`, lang: 'hi' } };
  }
  return {
    headline: english,
    ...(m.hindi.length ? { detail: m.hindi.join(', ') } : {}),
    speak: { text: `${m.lang === 'en' ? m.lemma : (m.roman ?? m.lemma)}: ${m.definition}.`, lang: 'en' },
  };
}
