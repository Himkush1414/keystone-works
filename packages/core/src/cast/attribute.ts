import type { Age, Temperament } from './profile';
import { findDialogue, type DialogueSpan } from './dialogue';
import { givenNameGender } from './names';

/** Speech verbs per language, used to find dialogue tags ("said Elizabeth", "Elizabeth asked"). */
// prettier-ignore
const VERBS: Record<string, string> = {
  en: 'said says thought thinks asked asks replied replies answered answers whispered whispers shouted shouts cried cries called calls murmured murmurs muttered mutters exclaimed exclaims added adds continued continues began begins remarked remarks returned returns observed observes sighed sighs laughed laughs snapped snaps declared declares insisted insists protested protests repeated repeats told tells demanded demands inquired enquired went yelled screamed breathed admitted agreed suggested warned urged pleaded interrupted retorted grumbled growled hissed sobbed giggled chuckled groaned stammered gasped barked roared bellowed teased explained announced confessed promised wondered whimpered moaned',
  es: 'dijo dice preguntó pregunta respondió responde contestó contesta susurró susurra gritó grita exclamó exclama murmuró murmura añadió añade continuó continúa repitió repite insistió insiste replicó replica',
  de: 'sagte sagt fragte fragt antwortete antwortet flüsterte flüstert rief ruft schrie schreit murmelte murmelt meinte meint fügte erwiderte erwidert fuhr wiederholte',
  fr: 'dit demanda demande répondit répond murmura murmure cria crie s’écria chuchota chuchote ajouta ajoute reprit reprend continua continue répéta répète lança lance',
  it: 'disse dice chiese chiede rispose risponde sussurrò sussurra gridò grida esclamò esclama mormorò mormora aggiunse aggiunge continuò continua ripeté ripete',
  pt: 'disse diz perguntou pergunta respondeu responde sussurrou sussurra gritou grita exclamou exclama murmurou murmura acrescentou acrescenta continuou continua repetiu repete',
};

/**
 * Hindi speech verbs (Devanagari and romanised Hinglish). Intransitive forms agree with the speaker's gender
 * (बोला / बोली, bola / boli), which also tells us who "वह" / "woh" is; with "ने" the verb agrees with the
 * object, so कहा / kaha carries no gender.
 */
// prettier-ignore
const HI_VERBS_M = 'बोला बोले चिल्लाया फुसफुसाया हँसा हंसा मुस्कुराया मुस्कराया रोया गरजा बड़बड़ाया चिल्लाए फुसफुसाए हँसे हंसे मुस्कुराए मुस्कराए रोए गरजे'.split(' ');
// prettier-ignore
const HI_VERBS_F = 'बोली चिल्लाई चिल्लायी फुसफुसाई हँसी हंसी मुस्कुराई मुस्कराई रोई गरजी बड़बड़ाई बोलीं चिल्लाईं फुसफुसाईं हँसीं हंसीं मुस्कुराईं रोईं'.split(' ');
// prettier-ignore
const HI_VERBS_N = 'कहा पूछा जवाब दिया उत्तर दिया आवाज़ लगाई आवाज लगाई पुकारा टोका समझाया डांटा डाँटा'.split(' ');
// prettier-ignore
const HG_VERBS_M = 'bola bole chillaya phusphusaya hansa muskuraya roya garja chillaye chillaaye phusphusaye hanse muskuraye roye garje'.split(' ');
// prettier-ignore
const HG_VERBS_F = 'boli chillayi chillai phusphusayi phusphusai hansi muskurayi muskurai royi roi garji'.split(' ');
// prettier-ignore
const HG_VERBS_N = 'kaha kahaa poocha pucha puchha jawab diya awaaz lagayi awaz lagayi pukara toka samjhaya daanta'.split(' ');

const FEMALE_HONORIFICS =
  /^(?:mrs|miss|ms|lady|madam|madame|mme|mlle|señora|sra|señorita|srta|frau|fräulein|signora|sig\.ra|dona|dña|senhora|sra|aunt|queen|princess|duchess|sister|mother)\.?$/iu;
const MALE_HONORIFICS =
  /^(?:mr|sir|lord|monsieur|m|señor|sr|herr|signor|sig|dom|don|senhor|uncle|king|prince|duke|brother|father|captain|colonel|major|general)\.?$/iu;
const HONORIFIC =
  /^(?:mr|mrs|miss|ms|dr|sir|lady|lord|madam|madame|monsieur|mme|mlle|señor|señora|señorita|sr|sra|srta|don|doña|dña|herr|frau|fräulein|signor|signora|sig|dott|dom|dona|senhor|senhora|aunt|uncle|captain|colonel|major|general|professor|prof|king|queen|prince|princess|duke|duchess|father|mother|sister|brother)\.?$/iu;

/** Family words used as names in Hindi stories ("दादी ने कहा", "Dadi bola"), with their gender. */
// prettier-ignore
const KIN_F = new Set('दादी नानी माँ मां मम्मी अम्मा अम्माँ दीदी बहन चाची मौसी बुआ भाभी खाला खालाजान फूफी मामी काकी ताई dadi nani maa ma mummy amma didi behen behan chachi mausi bua bhabhi grandmother grandma granny mother mom mum mommy auntie'.split(' '));
// prettier-ignore
const KIN_M = new Set('दादा नाना पापा पिताजी बाबा भैया भाई चाचा मामा ताऊ फूफा काका मौसा खालू dada nana papa pitaji baba bhaiya bhai chacha mama grandfather grandpa father dad daddy'.split(' '));

/** Relations that tell a named person's gender: "his sister Maya", "Tom, her brother", "बहन मीरा", "bhai Rohan". */
const REL_F =
  'sister|daughter|wife|mother|aunt|niece|grandmother|granddaughter|girlfriend|fiancée|widow|girl|woman|lady';
const REL_M =
  'brother|son|husband|father|uncle|nephew|grandfather|grandson|boyfriend|fiancé|widower|boy|man|gentleman';
const REL_ADJ = String.raw`(?:(?:little|younger|elder|older|big|baby|twin|eldest|youngest|young|old)\s+)?`;
const KIN_BEFORE = new RegExp(
  String.raw`\b(?:his|her|their|my|our|your)\s+${REL_ADJ}(${REL_F}|${REL_M})\s*,?\s+(\p{Lu}[\p{L}'’-]+)`,
  'giu',
);
const KIN_AFTER = new RegExp(
  String.raw`(\p{Lu}[\p{L}'’-]+),\s+(?:his|her|their|my|our|your|a|an|the)\s+${REL_ADJ}(${REL_F}|${REL_M})\b`,
  'gu',
);
// prettier-ignore
const HI_REL_F = 'बहन बेटी पत्नी दीदी भाभी सहेली behen behan beti patni didi bhabhi saheli'.split(' ');
// prettier-ignore
const HI_REL_M = 'भाई बेटा पति भैया bhai beta pati bhaiya'.split(' ');
const HI_KIN_BEFORE = new RegExp(
  String.raw`(?:^|\s)(${[...HI_REL_F, ...HI_REL_M].join('|')})\s+([\p{L}\p{M}]+)`,
  'giu',
);
/**
 * Verbs in narration agree with their subject in Hindi ("रोहन बाज़ार गया।", "Neha school gayi."), unless the
 * subject takes ने, when they agree with the object.
 */
// prettier-ignore
const HI_AGREE_F = new Set('गई गयी आई आयी थी लगी रही सकी चुकी बैठी उठी पहुँची पहुंची चली दौड़ी gayi gai aayi aai thi lagi rahi saki chuki baithi uthi pahunchi chali daudi'.split(' '));
// prettier-ignore
const HI_AGREE_M = new Set('गया आया था लगा रहा सका चुका बैठा उठा पहुँचा पहुंचा चला दौड़ा gaya aaya tha laga raha saka chuka baitha utha pahuncha chala dauda'.split(' '));

/** Capitalised words that start sentences but aren't names. */
// prettier-ignore
const NOT_NAMES = new Set('the a an and but or then there this that these those it its he she they we you i his her their our your my when while if as so yet still now here what who why how where which oh ah well yes no not one all some every no-one nobody somebody everyone old young with without after before for from once since upon at in on to into by of though although because perhaps indeed suddenly finally later meanwhile again never always only even just however therefore besides beyond moreover otherwise presently sometimes outside inside january february march april may june july august september october november december monday tuesday wednesday thursday friday saturday sunday english french german spanish italian latin greek hindi urdu chinese japanese russian american british indian european el la los las un una y pero entonces ella él ellos der die das ein eine und aber dann sie er es le la les un une et mais puis elle il ils il lo gli una e ma poi lei lui o a os as um uma mas então ela ele'.split(' '));

/** Words that open a Hindi clause without being its speaker: adverbs, conjunctions, postpositions, time words. */
// prettier-ignore
const HI_NOT_SUBJECT = new Set('अन्तमें अंतमें अन्त अंत में फिर तब अब इतने इतनेमें उसके बाद सहसा अचानक आखिर अंततः परन्तु लेकिन किन्तु मगर और तो भी ही यह वह इस उस एक दिन रात सुबह शाम आज कल को से पर का की के ने जो जब जैसे अपने सामने उनसे उससे उन्हें उसे'.split(' '));
/**
 * Hindi words a clause can open with that are never a speaker: possessive pronouns and speech verbs
 * themselves ("मेरे पास …", "बोली, …").
 */
// prettier-ignore
const HI_NOT_PERSON = new Set('मेरा मेरे मेरी तेरा तेरे तेरी हमारा हमारे हमारी तुम्हारा तुम्हारे तुम्हारी आपका आपके आपकी उसका उसकी उनका उनकी इसका इसके इसकी अपना अपनी कहते कहता कहती कहा कही बोला बोली बोले पूछा पूछी कहकर बोलकर'.split(' '));
/** Several people speaking at once: "सब बोले", "दोनों ने कहा", "लड़के चिल्लाए". */
// prettier-ignore
const HI_GROUP = new Set('सब सबने सभी सभीने दोनों दोनोंने लोग लोगोंने बच्चे बच्चोंने लड़के लड़कोंने'.split(' '));
/** A perfective transitive verb: with no ने in the clause, the noun before it is its object, not the speaker. */
const HI_TRANSITIVE_PERFECT =
  /(?:^|\s)(?:दी|दिया|दिये|दिए|ली|लिया|लिये|लिए|की|किया|डाली|डाला|उठाई|उठाया|रखी|रखा)(?=[\s,।]|$)/u;
/**
 * First-person verb forms that agree with the speaker ("मैं आ जाऊँगा", "मैं जा रही हूँ"): a character's own lines
 * tell their gender when every tag about them takes ने (whose verb agrees with the object).
 */
// The ending alone isn't trusted (transcriptions write "कहूँगी" for "कहेंगी"): मैं must come first in the sentence.
const HI_SELF_M =
  /(?:^|[\s“"])(?:मैं|मै)\s[^।?!]{0,60}?(?:ऊँगा|ऊंगा|ूँगा|ूंगा|(?:\S+ता|रहा|सकता|चुका|गया|आया)\s(?:हूँ|हूं|था))(?=[\s,।?!”"]|$)/u;
const HI_SELF_F =
  /(?:^|[\s“"])(?:मैं|मै)\s[^।?!]{0,60}?(?:ऊँगी|ऊंगी|ूँगी|ूंगी|(?:\S+ती|रही|सकती|चुकी|गई|गयी|आई|आयी)\s(?:हूँ|हूं|थी))(?=[\s,।?!”"]|$)/u;
/**
 * A Hindi title for a woman by her husband's rank: चौधराइन, ठकुराइन, पंडिताइन. (Not -िन: मोहसिन is a man.)
 */
const HI_FEMININE_TITLE = /(?:ाइन|ाईन)$/u;
/** Hindi words for people by trade that say their gender: दुकानदार, चौकीदार, सब्ज़ीवाला / सब्ज़ीवाली. */
const HI_TRADE_M = /(?:दार|वाला|वाले)$/u;
const HI_TRADE_F = /वाली$/u;

/** A word before these starts a participle phrase ("प्रभावित होकर", "मुस्कुराते हुए"), not the speaker. */
// prettier-ignore
const HI_PARTICIPLE_NEXT = new Set('होकर हुए होते करके कर'.split(' '));

// prettier-ignore
const CALENDAR = new Set('january february march april may june july august september october november december monday tuesday wednesday thursday friday saturday sunday'.split(' '));

const FEMALE_PRONOUNS = new Set(['she', 'her', 'hers', 'herself', 'ella', 'sie', 'elle', 'lei', 'ela']);
const MALE_PRONOUNS = new Set(['he', 'him', 'his', 'himself', 'él', 'er', 'il', 'lui', 'ele']);
/** Hindi and Hinglish third-person pronouns carry no gender; the verb does. */
// prettier-ignore
const HI_PRONOUNS = new Set('वह वो उसने उन्होंने यह ये woh wo vo usne unhone yeh ye'.split(' '));
// prettier-ignore
const HI_FIRST_PERSON = new Set('मैं मैंने हम हमने main maine mai maine hum humne'.split(' '));

export type Gender = 'f' | 'm';

export interface Character {
  id: string;
  name: string;
  aliases: string[];
  gender?: Gender;
  lines: number;
  /** From `profileCharacters`: how old they sound and how they usually speak. */
  age?: Age;
  temperament?: Temperament;
}

export interface Attribution {
  block: number;
  span: DialogueSpan;
  /** Character id, or undefined for unattributed dialogue (spoken by the generic dialogue voice). */
  speaker?: string;
  confidence: number;
}

export interface CastAnalysis {
  characters: Character[];
  attributions: Attribution[];
}

const HONORIFIC_WORDS = String.raw`(?:Mr|Mrs|Ms|Miss|Dr|Sir|Lady|Lord|Captain|Colonel|Madame|Monsieur|Señor|Señora|Herr|Frau|Signor|Signora|Dom|Dona|Don|Doña)`;
/** A name, possibly after "the" or a small adjective ("the Hatter", "little Amy", "old Mr. Grey"). */
const NAME_LEAD = String.raw`(?:(?:the|little|old|young|poor|dear)\s+)?`;
const NAME = String.raw`(${NAME_LEAD}(?:${HONORIFIC_WORDS}\.?\s+)?\p{Lu}[\p{L}'’-]+(?:\s+\p{Lu}[\p{L}'’-]+){0,2})`;
const HONORIFIC_NAME = new RegExp(
  String.raw`\b(${HONORIFIC_WORDS}\.?\s+\p{Lu}[\p{L}'’-]+(?:\s+\p{Lu}[\p{L}'’-]+)?)`,
  'gu',
);
const PRONOUN = String.raw`(he|she|they|I|we|él|ella|er|sie|il|elle|lui|lei|ele|ela)`;
// prettier-ignore
const DESCRIPTOR_NOUNS = 'wife|husband|lady|mother|father|son|daughter|man|woman|boy|girl|gentleman|stranger|child|sister|brother|friend|companion|host|hostess|servant|maid|soldier|captain|doctor|priest|king|queen';
const DESCRIPTOR = String.raw`(his|her|their|the|a|an)\s+((?:old|young|little|tall|other|elder|younger)\s+)?(${DESCRIPTOR_NOUNS})`;
const DESCRIPTOR_GENDER: Record<string, Gender> = {
  wife: 'f',
  lady: 'f',
  mother: 'f',
  daughter: 'f',
  woman: 'f',
  girl: 'f',
  sister: 'f',
  hostess: 'f',
  maid: 'f',
  queen: 'f',
  husband: 'm',
  father: 'm',
  son: 'm',
  man: 'm',
  boy: 'm',
  gentleman: 'm',
  brother: 'm',
  king: 'm',
  priest: 'm',
};
/** Relations that name a new person from someone else ("his wife" of Mr. Bennet → Mrs. Bennet). */
const RELATION_OF: Record<string, { gender: Gender; honorific: string }> = {
  wife: { gender: 'f', honorific: 'Mrs.' },
  lady: { gender: 'f', honorific: 'Mrs.' },
  husband: { gender: 'm', honorific: 'Mr.' },
};

const alt = (words: readonly string[]) =>
  [...words]
    .sort((a, b) => b.length - a.length)
    .map((w) => w.replace(/\s+/g, String.raw`\s+`))
    .join('|');

function tagPatterns(lang: string) {
  const verbs = (VERBS[lang] ?? VERBS.en ?? '').split(' ').join('|');
  const hiVerbs = alt([...HI_VERBS_M, ...HI_VERBS_F, ...HI_VERBS_N]);
  const hgVerbs = alt([...HG_VERBS_M, ...HG_VERBS_F, ...HG_VERBS_N]);
  const W = String.raw`[\p{L}\p{M}]+`;
  return {
    // After the quote: ", said Elizabeth" / " Elizabeth said" / " she asked" / "—dijo Juan—"
    verbName: new RegExp(String.raw`^[\s,—–-]*(?:${verbs})\s+${NAME}`, 'u'),
    nameVerb: new RegExp(String.raw`^[\s,—–-]*${NAME}\s+(?:\p{Ll}+\s+)?(?:${verbs})\b`, 'u'),
    pronounVerb: new RegExp(String.raw`^[\s,—–-]*${PRONOUN}\s+(?:\p{Ll}+\s+)?(?:${verbs})\b`, 'iu'),
    verbPronoun: new RegExp(String.raw`^[\s,—–-]*(?:${verbs})\s+${PRONOUN}\b`, 'iu'),
    verbDescriptor: new RegExp(String.raw`^[\s,—–-]*(?:${verbs})\s+${DESCRIPTOR}\b`, 'iu'),
    descriptorVerb: new RegExp(String.raw`^[\s,—–-]*${DESCRIPTOR}\s+(?:\p{Ll}+\s+)?(?:${verbs})\b`, 'iu'),
    // Before the quote: "Elizabeth said, " / "Elizabeth turned to him and said:"
    before: new RegExp(
      String.raw`${NAME}\s+(?:[^.!?“”"«»]{0,40}\s)?(?:${verbs})(?:\s[^.!?“”"«»]{0,30})?\s*[,:]?\s*$`,
      'u',
    ),
    // Action beat in a dialogue paragraph: "Anna pulled on her coat."
    beat: new RegExp(String.raw`^[\s,—–-]*(?:(?:And|But|Then|So|and|but|then|so)\s+)?${NAME}\s+\p{Ll}+`, 'u'),
    // Hindi: "मीरा ने पूछा", "मीरा हँसकर बोली", "वह बोला"; before: "दादी ने खिड़की से आवाज़ लगाई,"
    hiAfter: new RegExp(
      String.raw`^[\s,।—–-]*(${W})(?:\s+ने)?\s+(?:${W}\s+){0,3}?(${hiVerbs})(?=[\s।,!?.]|$)`,
      'u',
    ),
    hiBefore: new RegExp(String.raw`(${W})\s+ने\s+(?:[^“”"]{0,40}\s)?(?:${hiVerbs})\s*[,:]?\s*$`, 'u'),
    // Hinglish: "Meera ne poocha", "woh bola", "Meera hanste hue boli"; before: "Dadi ne ... awaaz lagayi,"
    hgAfter: new RegExp(String.raw`^[\s,—–-]*(\p{L}+)(?:\s+ne)?\s+(?:\p{L}+\s+){0,3}?(${hgVerbs})\b`, 'iu'),
    hgBefore: new RegExp(String.raw`(\p{L}+)\s+ne\s+(?:[^“”"]{0,40}\s)?(?:${hgVerbs})\s*[,:]?\s*$`, 'iu'),
    // Before the quote without ने: "Mummy kitchen se boli," / "माँ रसोई से बोली,"
    hiBeforeIntransitive: new RegExp(
      String.raw`(${W})\s+(?:${W}\s+){0,3}?(${alt([...HI_VERBS_M, ...HI_VERBS_F, ...HG_VERBS_M, ...HG_VERBS_F])})\s*[,:]\s*$`,
      'iu',
    ),
    // Hindi action beat right after a quote: "अनु ने नाक सिकोड़ी", "Arjun ne cup uthaya"
    hiBeat: new RegExp(String.raw`^[\s,।—–-]*(${W})\s+(?:ने|ne)\s+`, 'iu'),
    // Hindi speech without quotation marks (cast/dialogue.ts hindiSpans), named just before it:
    // "मोहसिन—", "महमूद ने कहा—", "खालाने नम्रतासे कहा, ", "हामिद को यकीन न आया—".
    hiOpening: /(?:[—―]|--|–{2}|,)\s*$/u,
    hiLabel: new RegExp(String.raw`(?:^|[।?!॥]\s*)[\s\u200b\u2060]*(${W}(?:\s${W})?)\s*[—―–-]+\s*$`, 'u'),
    hiSayClause: new RegExp(
      String.raw`(?:^|[।?!॥]\s*)[\s\u200b\u2060]*(${W})[^।?!]*?\s(${alt([...HI_VERBS_M, ...HI_VERBS_F, ...HI_VERBS_N, ...HG_VERBS_M, ...HG_VERBS_F, ...HG_VERBS_N, 'कहता', 'कहती', 'कहते', 'कहेगी', 'कहेगा', 'जवाब दिया', 'उत्तर दिया', 'सुनाया', 'वोले'])})(?:\s+(?:है|हैं|था|थी|थे))?\s*,?\s*[—―–-]*\s*$`,
      'iu',
    ),
    hiClause: new RegExp(
      String.raw`(?:^|[।?!॥]\s*)[\s\u200b\u2060]*(${W})\s[^।?!]*?(?:[—―]+|-{2,})[-–]*\s*$`,
      'u',
    ),
    // A known name opening the narration before a quote: "पिताजी मुस्कुराए।", "Maria laughed."
    leadingWord: new RegExp(String.raw`(?:^|[.!?।]\s+)(${W})\s+${W}[^.!?।]*[.!?।]?\s*$`, 'u'),
  };
}

/** Words that come before places, not people ("in Baker Street", "to London"). */
const PLACE_PREPOSITIONS = new Set(
  'in at into near across toward towards through around inside outside past beyond within'.split(' '),
);

function verbGender(verb: string): Gender | undefined {
  const v = verb.toLowerCase().replace(/\s+/g, ' ');
  if (HI_VERBS_M.includes(v) || HG_VERBS_M.includes(v)) return 'm';
  if (HI_VERBS_F.includes(v) || HG_VERBS_F.includes(v)) return 'f';
  return undefined;
}

/**
 * The identity of a name: its last word, plus the gender of its honorific, so "Mr. Bennet" and "Mrs. Bennet"
 * stay two people while "Elizabeth Bennet" and "Elizabeth" are one.
 */
function canonicalKey(name: string): { key: string; display: string; honorific?: string } {
  const parts = name.trim().split(/\s+/);
  const first = parts[0] ?? '';
  if (parts.length > 1 && HONORIFIC.test(first)) {
    const surname = (parts[parts.length - 1] ?? '').toLowerCase();
    const g = FEMALE_HONORIFICS.test(first) ? '~f' : MALE_HONORIFICS.test(first) ? '~m' : '';
    return { key: `${surname}${g}`, display: name.trim(), honorific: first };
  }
  return { key: (parts[parts.length - 1] ?? first).toLowerCase(), display: name.trim() };
}

/** "Bennet" alone may mean either Bennet; "Mr. Bennet" means only him. */
const keysMatch = (wanted: string, have: string) =>
  wanted === have || (!wanted.includes('~') && have.split('~')[0] === wanted);

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '');

/** What a tag says about the speaker. */
type Tag =
  | { kind: 'name'; text: string; gender?: Gender; confidence: number }
  | { kind: 'pronoun'; text: string; gender?: Gender }
  | { kind: 'descriptor'; owner: string; noun: string; adjective?: string }
  | { kind: 'first-person' }
  /** Several people at once ("they cried out", "सब बोले"): a line that is no one character's. */
  | { kind: 'group' };

/** Conversation memory survives this many narration paragraphs ("This was invitation enough."). */
const CONVERSATION_GAP = 3;

/**
 * Detects dialogue across paragraphs and attributes speakers. `blocks` are paragraph texts in reading order;
 * non-paragraph blocks should be passed as empty strings so indices line up.
 */
/**
 * Cast's version: raise it when attribution improves, so books analysed before are analysed again the next
 * time they play (the listener's corrections held fixed). 2: dialogue measured on real books (Premchand's
 * unquoted Hindi, "said the Hatter", turns by name and by the first-person narrator). 3: lines said by several
 * people go to no one, things and verbs are never speakers, Hindi genders from a speaker's own words.
 */
export const CAST_VERSION = 2;

/** A line whose speaker the listener has set: the quotation starting at `start` in paragraph `block`. */
export interface FixedSpeaker {
  block: number;
  start: number;
  /** The speaker's name as Cast knows it, or null for no one in particular. */
  speaker: string | null;
}

export function analyseCast(
  blocks: readonly string[],
  lang = 'en',
  fixed: readonly FixedSpeaker[] = [],
): CastAnalysis {
  const steps = castSteps(blocks, lang, fixed);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

/** Paragraphs analysed between pauses of [castSteps]. */
const CAST_STEP = 200;

/**
 * [analyseCast] in steps: the generator pauses every few hundred paragraphs, so a caller on the UI thread can
 * let the screen draw in between, and returns the analysis when done.
 */
export function* castSteps(
  blocks: readonly string[],
  lang = 'en',
  fixed: readonly FixedSpeaker[] = [],
): Generator<void, CastAnalysis> {
  const base = lang.slice(0, 2);
  // Lines the listener has set are taken as given, and the turns after them follow from them.
  const fixedAt = new Map(fixed.map((f) => [`${f.block}:${f.start}`, f.speaker]));
  const pat = tagPatterns(base);
  const chars = new Map<string, Character>();
  const genderVotes = new Map<string, { f: number; m: number }>();
  const attributions: Attribution[] = [];
  const recent: string[] = []; // characters mentioned or speaking, most recent last

  // Each name in the text is looked up against every character and alias; on a phone's JavaScript engine
  // (Hermes, no JIT) recomputing these keys for every lookup made Cast take over ten seconds on a long book.
  const aliasKeys = new Map<string, string>();
  const aliasKey = (alias: string) => {
    let k = aliasKeys.get(alias);
    if (k === undefined) aliasKeys.set(alias, (k = canonicalKey(alias).key));
    return k;
  };
  const findKnown = (raw: string) => {
    const key = canonicalKey(raw).key;
    const id = slug(key);
    const matches = [...chars.values()].filter(
      (c) => c.id === id || c.aliases.some((a) => keysMatch(key, aliasKey(a))),
    );
    // Several Bennets: the one mentioned most recently.
    return matches.sort((a, b) => recent.lastIndexOf(b.id) - recent.lastIndexOf(a.id))[0];
  };

  const register = (input: string, gender?: Gender): string | undefined => {
    // "the Hatter" is the Hatter, "little Amy" is Amy, "Holmes’ quick eye" is Holmes.
    const raw = input
      .trim()
      .replace(/^(?:(?:the|little|old|young|poor|dear)\s+)+/u, '')
      .replace(/['’]s?$/u, '');
    const words = raw.trim().split(/\s+/);
    const lower = raw.trim().toLowerCase();
    if (
      words.length === 1 &&
      (NOT_NAMES.has(lower) ||
        HI_PRONOUNS.has(lower) ||
        HI_FIRST_PERSON.has(lower) ||
        HI_NOT_PERSON.has(lower) ||
        HI_GROUP.has(lower))
    )
      return undefined;
    // A function word can't start a name, but a month can ("March Hare", "May Bennet").
    const first = (words[0] ?? '').toLowerCase();
    if (NOT_NAMES.has(first) && !HONORIFIC.test(words[0] ?? '') && !(words.length > 1 && CALENDAR.has(first)))
      return undefined;
    const { key, display, honorific } = canonicalKey(raw);
    if (!key || NOT_NAMES.has(key)) return undefined;
    let existing = findKnown(raw);
    if (!existing) {
      existing = { id: slug(key), name: display, aliases: [display], lines: 0 };
      chars.set(existing.id, existing);
    } else if (!existing.aliases.includes(display)) {
      existing.aliases.push(display);
      if (display.length > existing.name.length) existing.name = display;
    }
    if (honorific) {
      if (FEMALE_HONORIFICS.test(honorific)) existing.gender = 'f';
      else if (MALE_HONORIFICS.test(honorific)) existing.gender = 'm';
    }
    if (KIN_F.has(lower)) existing.gender = 'f';
    else if (KIN_M.has(lower)) existing.gender = 'm';
    // A common given name is a prior worth one tag; pronouns and verbs in the text can still outvote it.
    if (!primed.has(existing.id)) {
      primed.add(existing.id);
      const byName = givenNameGender(display);
      if (byName) vote(existing.id, byName, 2);
    }
    if (gender) vote(existing.id, gender, 2);
    return existing.id;
  };
  const primed = new Set<string>();

  /** Votes from relations ("his sister Maya") and Hindi verb agreement ("रोहन गया") in a stretch of narration. */
  const idFor = (raw: string) => findKnown(raw)?.id ?? slug(canonicalKey(raw).key);
  let contextSeen = '';
  const voteFromContext = (narration: string) => {
    if (contextSeen === narration) return;
    contextSeen = narration;
    const relation = (word: string): Gender | undefined => {
      const w = word.toLowerCase();
      if (new RegExp(`^(?:${REL_F})$`).test(w) || HI_REL_F.includes(w)) return 'f';
      if (new RegExp(`^(?:${REL_M})$`).test(w) || HI_REL_M.includes(w)) return 'm';
      return undefined;
    };
    const named = (raw: string) => !NOT_NAMES.has(raw.toLowerCase()) && !HI_PRONOUNS.has(raw.toLowerCase());
    for (const m of narration.matchAll(KIN_BEFORE)) {
      const g = relation(m[1] ?? '');
      if (g && m[2] && named(m[2])) vote(idFor(m[2]), g, 2);
    }
    for (const m of narration.matchAll(KIN_AFTER)) {
      const g = relation(m[2] ?? '');
      if (g && m[1] && named(m[1])) vote(idFor(m[1]), g, 2);
    }
    for (const m of narration.matchAll(HI_KIN_BEFORE)) {
      const g = relation(m[1] ?? '');
      if (g && m[2] && named(m[2]) && !HI_FIRST_PERSON.has(m[2].toLowerCase())) vote(idFor(m[2]), g, 2);
    }
    for (const sentence of narration.split(/[।.!?]+/u)) {
      const words = sentence.match(/[\p{L}\p{M}]+/gu) ?? [];
      const subject = words[0];
      if (!subject || words.length < 2 || words.some((w) => w === 'ने' || w.toLowerCase() === 'ne')) continue;
      const lower = subject.toLowerCase();
      if (
        NOT_NAMES.has(lower) ||
        HI_PRONOUNS.has(lower) ||
        HI_FIRST_PERSON.has(lower) ||
        KIN_F.has(lower) ||
        KIN_M.has(lower)
      )
        continue;
      if (/\p{Ll}/u.test(subject[0] ?? '')) continue; // Latin names are capitalised
      const f = words.some((w) => HI_AGREE_F.has(w.toLowerCase()));
      const m = words.some((w) => HI_AGREE_M.has(w.toLowerCase()));
      if (f !== m) vote(idFor(subject), f ? 'f' : 'm', 2);
    }
  };

  const vote = (id: string, g: Gender, weight = 1) => {
    const v = genderVotes.get(id) ?? { f: 0, m: 0 };
    v[g] += weight;
    genderVotes.set(id, v);
  };

  // The same paragraph votes for every character it names: count its pronouns once.
  let counted = { text: '', f: 0, m: 0 };
  const voteFromNarration = (id: string, narration: string) => {
    if (counted.text !== narration) {
      counted = { text: narration, f: 0, m: 0 };
      for (const w of narration.toLowerCase().match(/\p{L}+/gu) ?? []) {
        if (FEMALE_PRONOUNS.has(w)) counted.f++;
        else if (MALE_PRONOUNS.has(w)) counted.m++;
      }
    }
    if (counted.f) vote(id, 'f', counted.f);
    if (counted.m) vote(id, 'm', counted.m);
  };

  const genderOf = (id: string): Gender | undefined => {
    const c = chars.get(id);
    if (c?.gender) return c.gender;
    const v = genderVotes.get(id);
    if (!v || v.f + v.m < 2) return undefined;
    if (v.f >= v.m * 2) return 'f';
    if (v.m >= v.f * 2) return 'm';
    return undefined;
  };

  const touch = (id: string) => {
    const idx = recent.lastIndexOf(id);
    if (idx >= 0) recent.splice(idx, 1);
    recent.push(id);
    if (recent.length > 8) recent.shift();
  };

  /** Most recent character matching `ok`, searching back from the latest mention. */
  const recentWhere = (ok: (id: string) => boolean) => {
    for (let i = recent.length - 1; i >= 0; i--) {
      const id = recent[i];
      if (id && ok(id)) return id;
    }
    return undefined;
  };

  /** Characters named as the person spoken to ("My dear Mr. Bennet,", "Haan Dadi!"): not the speaker. */
  const addressees = (quote: string): Set<string> => {
    const out = new Set<string>();
    // "My dear Mr. Bennet," introduces Mr. Bennet even before the narration names him.
    for (const m of quote.matchAll(HONORIFIC_NAME)) {
      const id = register(m[1] ?? '');
      if (id) out.add(id);
    }
    const lower = quote.toLowerCase();
    for (const c of chars.values()) {
      for (const a of c.aliases) {
        const key = aliasKey(a);
        if (key && lower.includes(key)) out.add(c.id);
      }
    }
    return out;
  };

  /** Characters spoken to by name: "Don’t, Jo." "So I did, Beth." "Ah, Watson, …" (at the start or after a comma). */
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const vocatives = (quote: string): Set<string> => {
    const out = new Set<string>();
    for (const c of chars.values()) {
      if (c.id === 'narrator-i') continue;
      for (const a of c.aliases) {
        const re = new RegExp(
          String.raw`(?:^[“"‘'«„]?\s*(?:(?:Oh|Ah|Well|Yes|No|Now|Come),?\s+)?|,\s+)${escape(a)}(?=\s*[,.!?;—–])`,
          'u',
        );
        if (re.test(quote)) out.add(c.id);
      }
    }
    return out;
  };

  const resolve = (
    tag: Tag,
    quote: string,
    lastSpeaker: string | undefined,
    namedHere: ReadonlySet<string> = new Set(),
  ): string | undefined => {
    switch (tag.kind) {
      case 'name':
        return register(tag.text, tag.gender);
      case 'first-person':
        return register('Narrator-I');
      case 'group':
        return undefined;
      case 'pronoun': {
        const lower = tag.text.toLowerCase();
        const want =
          tag.gender ?? (FEMALE_PRONOUNS.has(lower) ? 'f' : MALE_PRONOUNS.has(lower) ? 'm' : undefined);
        const spokenTo = addressees(quote);
        const speaking = (id: string) => (chars.get(id)?.lines ?? 0) > 0;
        // Someone named in this paragraph first ("Old Mr. Grey looked up. … he grumbled."), then someone already
        // in the conversation, and anyone merely mentioned only if no speaker fits.
        const fits = (id: string) => genderOf(id) === want && !spokenTo.has(id);
        const byGender = want
          ? (recentWhere((id) => fits(id) && namedHere.has(id)) ??
            recentWhere((id) => fits(id) && speaking(id)) ??
            recentWhere(fits))
          : undefined;
        // Without a known gender, "वह बोला" after someone else spoke is the other person in the conversation,
        // as long as nothing says they're of the other gender.
        const id =
          byGender ??
          recentWhere(
            (id) =>
              id !== lastSpeaker &&
              !spokenTo.has(id) &&
              id !== 'narrator-i' &&
              (!want || genderOf(id) === undefined || genderOf(id) === want),
          );
        if (id && want) vote(id, want);
        return id;
      }
      case 'descriptor': {
        const noun = tag.noun.toLowerCase();
        const relation = RELATION_OF[noun];
        const ownerGender: Gender | undefined = /^his$/i.test(tag.owner)
          ? 'm'
          : /^her$/i.test(tag.owner)
            ? 'f'
            : undefined;
        if (relation && ownerGender) {
          // "his wife" belongs to the man being spoken to, or the most recent man.
          const spokenTo = [...addressees(quote)].find((id) => genderOf(id) === ownerGender);
          const owner = spokenTo ?? recentWhere((id) => genderOf(id) === ownerGender);
          const ownerName = owner ? chars.get(owner)?.name : undefined;
          const surname = ownerName ? canonicalKey(ownerName) : undefined;
          if (surname?.honorific) {
            return register(`${relation.honorific} ${ownerName?.split(/\s+/).pop() ?? ''}`, relation.gender);
          }
        }
        const g = DESCRIPTOR_GENDER[noun];
        // "the old man asked": the most recent character of that kind who isn't the one who just spoke.
        return recentWhere((id) => (!g || genderOf(id) === g) && id !== lastSpeaker);
      }
    }
  };

  /** A gendered pronoun with more than one recent character of that gender (none being spoken to). */
  const pronounIsAmbiguous = (
    tag: Extract<Tag, { kind: 'pronoun' }>,
    quote: string,
    lastSpeaker: string | undefined,
    namedHere: ReadonlySet<string>,
  ) => {
    const lower = tag.text.toLowerCase();
    const want =
      tag.gender ?? (FEMALE_PRONOUNS.has(lower) ? 'f' : MALE_PRONOUNS.has(lower) ? 'm' : undefined);
    if (!want) return false;
    const spokenTo = addressees(quote);
    // Anyone who could be meant: of that gender (or unknown but already speaking), not spoken to, not the one
    // who just spoke. People only mentioned in narration with no known gender are not in the conversation.
    const candidates = recent.filter(
      (id) =>
        id !== lastSpeaker &&
        !spokenTo.has(id) &&
        id !== 'narrator-i' &&
        (chars.get(id)?.lines ?? 0) > 0 &&
        (genderOf(id) === want || genderOf(id) === undefined),
    );
    // A name in the same paragraph settles it ("Old Mr. Grey looked up. 'You two again,' he grumbled.").
    if (candidates.some((id) => namedHere.has(id) && genderOf(id) === want)) return false;
    return candidates.length > 1;
  };

  /** Finds a tag in the narration right after (or, failing that, right before) a quotation. */
  /** The speaker named before Hindi speech that has no quotation marks (a dash or a speech verb's comma). */
  const hindiOpening = (before: string): { tag: Tag; confidence: number } | undefined => {
    if (base !== 'hi' || !pat.hiOpening.test(before)) return undefined;
    // The transcription often glues ने to the name ("खालाने", "जुम्मनने"): the name is the word without it.
    const subject = (word: string) => {
      const w = word.replace(/[\u200b\u2060]/gu, '');
      return /ने$/u.test(w) && w.length > 4 && !HI_PRONOUNS.has(w) ? w.slice(0, -2) : w;
    };
    const asTag = (raw: string, verb: string | undefined, confidence: number) => {
      const word = subject(raw);
      const lower = word.toLowerCase();
      const gender = verb ? verbGender(verb) : undefined;
      if (HI_FIRST_PERSON.has(lower)) return { tag: { kind: 'first-person' } as Tag, confidence };
      if (HI_GROUP.has(lower) || HI_GROUP.has(raw)) return { tag: { kind: 'group' } as Tag, confidence };
      if (HI_PRONOUNS.has(lower) || ['वे', 'उन्होंने', 've'].includes(lower)) {
        // "चौधराइन ने … दोषारोपण किया। उसने कहा, …": the pronoun is whoever was just named, if the verb allows.
        const ref = lastAgentIn(before) ?? lastNamedIn(before);
        if (ref) {
          const known = findKnown(ref);
          const refGender = (known ? genderOf(known.id) : undefined) ?? givenNameGender(ref);
          if (!gender || !refGender || refGender === gender)
            return {
              tag: { kind: 'name', text: ref, ...(gender ? { gender } : {}), confidence: 0.75 } as Tag,
              confidence: 0.75,
            };
        }
      }
      if (HI_PRONOUNS.has(lower) || ['वे', 'उन्होंने', 've'].includes(lower))
        return {
          tag: { kind: 'pronoun', text: word, ...(gender ? { gender } : {}) } as Tag,
          confidence: confidence - 0.1,
        };
      if (NOT_NAMES.has(lower) || HI_NOT_PERSON.has(lower)) return undefined;
      return {
        tag: { kind: 'name', text: word, ...(gender ? { gender } : {}), confidence } as Tag,
        confidence,
      };
    };
    const say = pat.hiSayClause.exec(before);
    if (say?.[2]) {
      const who = hiSubject(clauseOf(before), say[2]);
      if (who) return asTag(who, say[2], 0.9);
      // The person named just before: a known character whose gender the verb allows ("बेचारी खाला अलगू चौधरी के
      // पास आई। लाठी पटक दी और … बोली"), or the agent of the previous sentence ("सम्मी ने खेजरी ली थी।
      // प्रभावित होकर बोला---…").
      const g = verbGender(say[2]);
      const named = lastNamedIn(before, g) ?? lastKinIn(before, g) ?? lastAgentIn(before);
      if (named) return asTag(named, say[2], 0.8);
      const gender = verbGender(say[2]);
      return { tag: { kind: 'pronoun', text: 'वह', ...(gender ? { gender } : {}) }, confidence: 0.7 };
    }
    const label = pat.hiLabel.exec(before);
    if (label?.[1] && label[1].split(/\s+/).length <= 2)
      return asTag(label[1].split(/\s+/)[0] ?? label[1], undefined, 0.9);
    const clause = pat.hiClause.exec(before);
    if (clause?.[1]) {
      const who = hiSubject(clauseOf(before)) ?? lastNamedIn(before);
      if (who) return asTag(who, undefined, 0.8);
    }
    return undefined;
  };

  /** The clause that introduces speech: from the last sentence end before it. */
  const clauseOf = (before: string) =>
    before.slice(Math.max(...['।', '?', '!', '॥'].map((c) => before.lastIndexOf(c))) + 1);
  /**
   * Who speaks in a Hindi clause introducing speech: with कहा, पूछा or जवाब दिया, the one marked by ने
   * ("…खालाने जुम्मनसे कहा,"); otherwise the first word that can be a person, skipping adverbs, postpositions
   * and the start of a participle phrase ("अन्तमें एक दिन…", "प्रभावित होकर बोला"). Undefined when none is.
   */
  const hiSubject = (clause: string, verb?: string): string | undefined => {
    const words = clause
      .replace(/[\u200b\u2060]/gu, '')
      .split(/[\s,]+/)
      .filter(Boolean);
    if (verb && !verbGender(verb)) {
      for (let i = 0; i < words.length; i++) {
        const w = words[i] ?? '';
        if (words[i + 1] === 'ने' && !HI_PRONOUNS.has(w)) return w;
        if (/ने$/u.test(w) && w.length > 4 && !HI_PRONOUNS.has(w) && !HI_NOT_SUBJECT.has(w))
          return w.slice(0, -2);
      }
    }
    // "लाठी पटक दी और दम लेकर बोली": a perfective transitive verb with no ने has no agent in the clause, so
    // its first noun is the object and the speaker was named in an earlier sentence.
    if (!words.some((w) => w === 'ने' || /ने$/u.test(w)) && HI_TRANSITIVE_PERFECT.test(clause))
      return undefined;
    for (let i = 0; i < words.length; i++) {
      const w = words[i] ?? '';
      const next = words[i + 1] ?? '';
      if (HI_NOT_SUBJECT.has(w) || /कर$/u.test(w) || HI_PARTICIPLE_NEXT.has(next)) continue;
      if (HI_GROUP.has(w)) return w;
      if (/[—―–-]/u.test(w) || /\p{Nd}/u.test(w)) return undefined;
      return w;
    }
    return undefined;
  };
  /** The last person marked by ने in `text` ("सम्मी ने …"), not a pronoun. */
  const lastAgentIn = (text: string): string | undefined => {
    const agents = [...text.matchAll(/([\p{L}\p{M}]+)\s+ने\s/gu)].map((m) => m[1] ?? '');
    return agents.reverse().find((w) => w && !HI_PRONOUNS.has(w) && !HI_NOT_SUBJECT.has(w));
  };
  /** The last family word in `text` that can be of `gender` ("बेचारी खाला … आई"), for a speaker not yet known. */
  const lastKinIn = (text: string, gender?: Gender): string | undefined => {
    const words = text.match(/[\p{L}\p{M}]+/gu) ?? [];
    return words.reverse().find((w) => (gender !== 'm' && KIN_F.has(w)) || (gender !== 'f' && KIN_M.has(w)));
  };
  /** The last known character named in `text` (of `gender`, when given: one known to be otherwise is skipped). */
  const lastNamedIn = (text: string, gender?: Gender): string | undefined => {
    let best: { at: number; name: string } | undefined;
    for (const c of chars.values()) {
      if (c.id === 'narrator-i') continue;
      const g = gender ? (genderOf(c.id) ?? givenNameGender(c.name)) : undefined;
      if (g && g !== gender) continue;
      for (const a of c.aliases) {
        const at = text.lastIndexOf(a);
        if (at >= 0 && (!best || at > best.at)) best = { at, name: a };
      }
    }
    return best?.name;
  };

  const findTag = (after: string, before: string): { tag: Tag; confidence: number } | undefined => {
    const opening = hindiOpening(before);
    if (opening) return opening;
    const name = pat.verbName.exec(after) ?? pat.nameVerb.exec(after);
    if (name?.[1]) return { tag: { kind: 'name', text: name[1], confidence: 0.95 }, confidence: 0.95 };
    const hi = pat.hiAfter.exec(after) ?? pat.hgAfter.exec(after);
    if (hi?.[1] && hi[2]) {
      const word = hi[1].toLowerCase();
      const gender = verbGender(hi[2]);
      if (HI_FIRST_PERSON.has(word)) return { tag: { kind: 'first-person' }, confidence: 0.9 };
      if (HI_PRONOUNS.has(word))
        return { tag: { kind: 'pronoun', text: hi[1], ...(gender ? { gender } : {}) }, confidence: 0.8 };
      return {
        tag: { kind: 'name', text: hi[1], ...(gender ? { gender } : {}), confidence: 0.95 },
        confidence: 0.95,
      };
    }
    const desc = pat.verbDescriptor.exec(after) ?? pat.descriptorVerb.exec(after);
    if (desc?.[1] && desc[3]) {
      return {
        tag: {
          kind: 'descriptor',
          owner: desc[1],
          noun: desc[3],
          ...(desc[2] ? { adjective: desc[2].trim() } : {}),
        },
        confidence: 0.85,
      };
    }
    const pron = pat.pronounVerb.exec(after) ?? pat.verbPronoun.exec(after);
    if (pron?.[1]) {
      if (/^they$/i.test(pron[1])) return { tag: { kind: 'group' }, confidence: 0.9 };
      if (/^(?:i|we)$/i.test(pron[1])) return { tag: { kind: 'first-person' }, confidence: 0.9 };
      return { tag: { kind: 'pronoun', text: pron[1] }, confidence: 0.8 };
    }
    const beforeName = pat.before.exec(before);
    if (beforeName?.[1])
      return { tag: { kind: 'name', text: beforeName[1], confidence: 0.9 }, confidence: 0.9 };
    const hiBefore = pat.hiBefore.exec(before) ?? pat.hgBefore.exec(before);
    if (hiBefore?.[1] && !HI_PRONOUNS.has(hiBefore[1].toLowerCase())) {
      return { tag: { kind: 'name', text: hiBefore[1], confidence: 0.9 }, confidence: 0.9 };
    }
    const intransitive = pat.hiBeforeIntransitive.exec(before);
    if (intransitive?.[1] && intransitive[2] && !HI_PRONOUNS.has(intransitive[1].toLowerCase())) {
      const gender = verbGender(intransitive[2]);
      return {
        tag: { kind: 'name', text: intransitive[1], ...(gender ? { gender } : {}), confidence: 0.9 },
        confidence: 0.9,
      };
    }
    const hiBeat = pat.hiBeat.exec(after);
    if (
      hiBeat?.[1] &&
      !HI_PRONOUNS.has(hiBeat[1].toLowerCase()) &&
      !HI_FIRST_PERSON.has(hiBeat[1].toLowerCase())
    ) {
      return { tag: { kind: 'name', text: hiBeat[1], confidence: 0.85 }, confidence: 0.85 };
    }
    const beat = pat.beat.exec(after) ?? pat.beat.exec(before);
    if (beat?.[1] && findKnown(beat[1])) {
      return { tag: { kind: 'name', text: beat[1], confidence: 0.8 }, confidence: 0.8 };
    }
    // A known person opening the sentence just before the quote is the one who speaks.
    const lead = pat.leadingWord.exec(before);
    if (lead?.[1] && findKnown(lead[1])) {
      return { tag: { kind: 'name', text: lead[1], confidence: 0.8 }, confidence: 0.8 };
    }
    return undefined;
  };

  /** Names in narration become likely speakers of what follows (known names, and any with an honorific). */
  const noticeNames = (narration: string): Set<string> => {
    voteFromContext(narration);
    const seen = new Set<string>();
    const see = (id: string) => {
      voteFromNarration(id, narration);
      touch(id);
      seen.add(id);
    };
    for (const m of narration.matchAll(HONORIFIC_NAME)) {
      const id = register(m[1] ?? '');
      if (id) see(id);
    }
    for (const m of narration.matchAll(new RegExp(NAME, 'gu'))) {
      // "To Sherlock Holmes": drop leading capitalised words that aren't names.
      const words = (m[1] ?? '').split(/\s+/);
      while (words.length > 1 && NOT_NAMES.has((words[0] ?? '').toLowerCase())) words.shift();
      const raw = words.join(' ');
      const known = findKnown(raw);
      if (known) {
        see(known.id);
        continue;
      }
      // New people: a capitalised word mid-sentence that isn't after a place word ("…said Holmes…"), or a
      // sentence's subject followed by its verb ("Maria set the kettle").
      const at = (m.index ?? 0) + (m[0].length - (m[1]?.length ?? 0));
      const prefix = narration.slice(0, at);
      const previous = /(\p{L}+)\W*$/u.exec(prefix)?.[1] ?? '';
      const sentenceStart = /(?:^|[.!?:;]["”’]?\s+)$/u.test(prefix);
      const next = /^\s+(\p{L}+)/u.exec(narration.slice(at + raw.length))?.[1] ?? '';
      const midSentence = !sentenceStart && /^\p{Ll}/u.test(previous) && !PLACE_PREPOSITIONS.has(previous);
      const subject = sentenceStart && /^\p{Ll}/u.test(next) && words.length <= 3;
      if ((midSentence || subject) && !NOT_NAMES.has(raw.toLowerCase())) {
        const id = register(raw);
        if (id) see(id);
      }
    }
    // Names without capital letters (Devanagari) are recognised once they've spoken.
    for (const c of chars.values()) {
      if (!/\p{Lu}/u.test(c.name) && narration.includes(c.name)) {
        touch(c.id);
        seen.add(c.id);
      }
    }
    return seen;
  };

  let lastSpeakers: string[] = []; // speakers of recent dialogue paragraphs, most recent last
  let lastVocatives = new Set<string>(); // who the last dialogue paragraph spoke to by name
  let lastFirstPerson = -Infinity; // the last paragraph whose narration says "I", "me" or "my" (English)
  const inferred = new Set<number>(); // attributions guessed from turn-taking, open to a later vocative
  let narrationSince = 0;

  for (let block = 0; block < blocks.length; block++) {
    // A phone imports a long book with the screen still responsive: callers can pause here (castSteps).
    if (block > 0 && block % CAST_STEP === 0) yield;
    const text = blocks[block] ?? '';
    if (!text) {
      lastSpeakers = [];
      narrationSince = 0;
      continue;
    }
    const spans = findDialogue(text, base);
    const outsideQuotes = spans.length
      ? spans.reduce((acc, s, k) => acc + text.slice(spans[k - 1]?.end ?? 0, s.start), '') +
        text.slice(spans[spans.length - 1]?.end ?? 0)
      : text;
    if (base === 'en' && /\b(?:I|me|my)\b/u.test(outsideQuotes)) lastFirstPerson = block;
    if (!spans.length) {
      noticeNames(text);
      if (++narrationSince > CONVERSATION_GAP) lastSpeakers = [];
      continue;
    }
    narrationSince = 0;

    // Narration inside the paragraph (outside the quotes) can introduce or recall people.
    const narration =
      spans.reduce((acc, s, k) => acc + text.slice(spans[k - 1]?.end ?? 0, s.start), '') +
      text.slice(spans[spans.length - 1]?.end ?? 0);
    const namedHere = noticeNames(narration);

    const lastSpeaker = lastSpeakers[lastSpeakers.length - 1];
    let paragraphSpeaker: { id: string; confidence: number } | undefined;
    const local: { span: DialogueSpan; id?: string; confidence: number; fixed?: true; group?: true }[] = [];
    spans.forEach((span, k) => {
      const after = text.slice(span.end, spans[k + 1]?.start ?? text.length).slice(0, 80);
      const before = text.slice(spans[k - 1]?.end ?? 0, span.start).slice(-80);
      const quote = text.slice(span.start, span.end);
      const found = findTag(after, before);
      const ambiguous =
        found?.tag.kind === 'pronoun' && pronounIsAmbiguous(found.tag, quote, lastSpeaker, namedHere);
      const set = fixedAt.get(`${block}:${span.start}`);
      if (set !== undefined) {
        const id = set === null ? undefined : register(set);
        if (id) {
          touch(id);
          paragraphSpeaker = { id, confidence: 1 };
        }
        local.push(id ? { span, id, confidence: 1, fixed: true } : { span, confidence: 1, fixed: true });
        return;
      }
      if (found?.tag.kind === 'group') {
        // Said by several at once: no one character's voice, and no guess fills it in later.
        local.push({ span, confidence: found.confidence, group: true });
        return;
      }
      const id = found ? resolve(found.tag, quote, lastSpeaker, namedHere) : undefined;
      // "she asked" with two women in the scene: keep the guess, but below the threshold for a named voice.
      const confidence = ambiguous ? 0.6 : (found?.confidence ?? 0.8);
      if (id) {
        voteFromNarration(id, after + before);
        touch(id);
        paragraphSpeaker ??= { id, confidence };
      }
      local.push(id ? { span, id, confidence } : { span, confidence: 0 });
    });

    if (paragraphSpeaker) {
      // One tag in a paragraph usually covers every quote in it.
      for (const l of local) {
        if (!l.id && !l.fixed && !l.group) {
          l.id = paragraphSpeaker.id;
          l.confidence = Math.min(0.85, paragraphSpeaker.confidence);
        }
      }
    } else {
      // Untagged turn: the other person in the conversation, never the one being spoken to.
      const quotes = local.map((l) => text.slice(l.span.start, l.span.end)).join(' ');
      const spokenTo = addressees(quotes);
      const previous = lastSpeakers[lastSpeakers.length - 2];
      // The one just spoken to by name answers ("Don’t, Jo. It’s so boyish!" / "That’s why I do it.").
      const called = [...lastVocatives].filter((id) => id !== lastSpeaker && !spokenTo.has(id));
      // In a story told in the first person, the narrator is the likely other side of a conversation.
      const narrator =
        !previous && lastSpeaker !== 'narrator-i' && block - lastFirstPerson <= 12
          ? register('Narrator-I')
          : undefined;
      const other =
        called.length === 1
          ? called[0]
          : previous && previous !== lastSpeaker && !spokenTo.has(previous)
            ? previous
            : (narrator ??
              recentWhere((id) => id !== lastSpeaker && !spokenTo.has(id) && id !== 'narrator-i'));
      if (other && lastSpeaker) {
        // Two people taking turns is the commonest pattern in fiction; confident enough for their own voices.
        const confidence = previous === other || called.length === 1 ? 0.75 : 0.7;
        for (const l of local) {
          if (l.fixed || l.group) continue;
          l.id = other;
          l.confidence = confidence;
        }
      }
      for (let k = 0; k < local.length; k++) inferred.add(attributions.length + k);
    }
    lastVocatives = vocatives(local.map((l) => text.slice(l.span.start, l.span.end)).join(' '));

    for (const l of local) {
      attributions.push(
        l.id
          ? { block, span: l.span, speaker: l.id, confidence: l.confidence }
          : { block, span: l.span, confidence: l.fixed ? 1 : l.group ? l.confidence : 0 },
      );
      if (l.id) {
        const c = chars.get(l.id);
        if (c) c.lines++;
        touch(l.id);
      }
    }
    const speaker = local.find((l) => l.id)?.id;
    if (speaker) lastSpeakers = [...lastSpeakers, speaker].slice(-4);
  }

  // A guessed turn followed by a reply that names whoever spoke it ("So I did, Beth.") was that person's.
  for (let i = 0; i < attributions.length; i++) {
    const a = attributions[i];
    if (!a || !inferred.has(i)) continue;
    const next = attributions.find((n, j) => j > i && n.block > a.block);
    if (!next || next.block !== a.block + 1) continue;
    const reply = (blocks[next.block] ?? '').slice(next.span.start, next.span.end);
    const named = [...vocatives(reply.slice(0, 40))].filter((id) => id !== next.speaker);
    if (named.length === 1 && named[0] && named[0] !== a.speaker) {
      const was = a.speaker;
      for (const b of attributions) if (b.block === a.block && b.speaker === was) b.speaker = named[0];
    }
  }

  // Hindi: what each character says of themselves in their own lines ("मैं आ जाऊँगा"), and feminine titles.
  if (base === 'hi') {
    for (const a of attributions) {
      if (!a.speaker) continue;
      const quote = (blocks[a.block] ?? '').slice(a.span.start, a.span.end);
      const m = HI_SELF_M.test(quote);
      const f = HI_SELF_F.test(quote);
      if (m !== f) vote(a.speaker, m ? 'm' : 'f', 2);
    }
    for (const c of chars.values()) {
      if (c.name.length <= 3) continue;
      if (HI_FEMININE_TITLE.test(c.name) || HI_TRADE_F.test(c.name)) vote(c.id, 'f', 3);
      else if (HI_TRADE_M.test(c.name)) vote(c.id, 'm', 2);
    }
  }
  for (const c of chars.values()) {
    const g = genderOf(c.id);
    if (g) c.gender = g;
  }
  const narratorI = chars.get('narrator-i');
  if (narratorI) narratorI.name = 'I (narrator)';
  return {
    characters: [...chars.values()].filter((c) => c.lines > 0).sort((a, b) => b.lines - a.lines),
    attributions,
  };
}
