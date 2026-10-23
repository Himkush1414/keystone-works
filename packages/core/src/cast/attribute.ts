import { findDialogue, type DialogueSpan } from './dialogue';

/** Speech verbs per language, used to find dialogue tags ("said Elizabeth", "Elizabeth asked"). */
// prettier-ignore
const VERBS: Record<string, string> = {
  en: 'said says asked asks replied replies answered answers whispered whispers shouted shouts cried cries called calls murmured murmurs muttered mutters exclaimed exclaims added adds continued continues began begins remarked remarks returned returns observed observes sighed sighs laughed laughs snapped snaps declared declares insisted insists protested protests repeated repeats told tells demanded demands inquired enquired went yelled screamed breathed admitted agreed suggested warned urged pleaded interrupted retorted grumbled growled hissed sobbed giggled chuckled groaned stammered gasped barked roared bellowed teased explained announced confessed promised wondered whimpered moaned',
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
const HI_VERBS_M = 'बोला बोले चिल्लाया फुसफुसाया हँसा हंसा मुस्कुराया मुस्कराया रोया गरजा बड़बड़ाया'.split(' ');
// prettier-ignore
const HI_VERBS_F = 'बोली चिल्लाई चिल्लायी फुसफुसाई हँसी हंसी मुस्कुराई मुस्कराई रोई गरजी बड़बड़ाई'.split(' ');
// prettier-ignore
const HI_VERBS_N = 'कहा पूछा जवाब दिया उत्तर दिया आवाज़ लगाई आवाज लगाई पुकारा टोका समझाया डांटा डाँटा'.split(' ');
// prettier-ignore
const HG_VERBS_M = 'bola bole chillaya phusphusaya hansa muskuraya roya garja'.split(' ');
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
const KIN_F = new Set('दादी नानी माँ मां मम्मी अम्मा दीदी बहन चाची मौसी बुआ भाभी dadi nani maa ma mummy amma didi behen behan chachi mausi bua bhabhi'.split(' '));
// prettier-ignore
const KIN_M = new Set('दादा नाना पापा पिताजी बाबा भैया भाई चाचा मामा dada nana papa pitaji baba bhaiya bhai chacha mama'.split(' '));

/** Capitalised words that start sentences but aren't names. */
// prettier-ignore
const NOT_NAMES = new Set('the a an and but or then there this that these those it its he she they we you i his her their our your my when while if as so yet still now here what who why how where which oh ah well yes no not one all some every no-one nobody somebody everyone old young with without after before for from once since upon at in on to into by of though although because perhaps indeed suddenly finally later meanwhile again never always only even just however therefore besides beyond moreover otherwise presently sometimes outside inside january february march april may june july august september october november december monday tuesday wednesday thursday friday saturday sunday el la los las un una y pero entonces ella él ellos der die das ein eine und aber dann sie er es le la les un une et mais puis elle il ils il lo gli una e ma poi lei lui o a os as um uma mas então ela ele'.split(' '));

const FEMALE_PRONOUNS = new Set(['she', 'her', 'ella', 'sie', 'elle', 'lei', 'ela']);
const MALE_PRONOUNS = new Set(['he', 'him', 'his', 'él', 'er', 'il', 'lui', 'ele']);
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
const NAME = String.raw`((?:${HONORIFIC_WORDS}\.?\s+)?\p{Lu}[\p{L}'’-]+(?:\s+\p{Lu}[\p{L}'’-]+){0,2})`;
const HONORIFIC_NAME = new RegExp(String.raw`\b(${HONORIFIC_WORDS}\.?\s+\p{Lu}[\p{L}'’-]+)`, 'gu');
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
    before: new RegExp(String.raw`${NAME}\s+(?:[^.!?“”"«»]{0,40}\s)?(?:${verbs})\s*[,:]?\s*$`, 'u'),
    // Action beat in a dialogue paragraph: "Anna pulled on her coat."
    beat: new RegExp(String.raw`^[\s,—–-]*${NAME}\s+\p{Ll}+`, 'u'),
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
  | { kind: 'first-person' };

/** Conversation memory survives this many narration paragraphs ("This was invitation enough."). */
const CONVERSATION_GAP = 3;

/**
 * Detects dialogue across paragraphs and attributes speakers. `blocks` are paragraph texts in reading order;
 * non-paragraph blocks should be passed as empty strings so indices line up.
 */
export function analyseCast(blocks: readonly string[], lang = 'en'): CastAnalysis {
  const base = lang.slice(0, 2);
  const pat = tagPatterns(base);
  const chars = new Map<string, Character>();
  const genderVotes = new Map<string, { f: number; m: number }>();
  const attributions: Attribution[] = [];
  const recent: string[] = []; // characters mentioned or speaking, most recent last

  const findKnown = (raw: string) => {
    const key = canonicalKey(raw).key;
    const matches = [...chars.values()].filter(
      (c) => c.id === slug(key) || c.aliases.some((a) => keysMatch(key, canonicalKey(a).key)),
    );
    // Several Bennets: the one mentioned most recently.
    return matches.sort((a, b) => recent.lastIndexOf(b.id) - recent.lastIndexOf(a.id))[0];
  };

  const register = (raw: string, gender?: Gender): string | undefined => {
    const words = raw.trim().split(/\s+/);
    const lower = raw.trim().toLowerCase();
    if (words.length === 1 && (NOT_NAMES.has(lower) || HI_PRONOUNS.has(lower) || HI_FIRST_PERSON.has(lower)))
      return undefined;
    if (NOT_NAMES.has((words[0] ?? '').toLowerCase()) && !HONORIFIC.test(words[0] ?? '')) return undefined;
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
    if (gender) vote(existing.id, gender, 2);
    return existing.id;
  };

  const vote = (id: string, g: Gender, weight = 1) => {
    const v = genderVotes.get(id) ?? { f: 0, m: 0 };
    v[g] += weight;
    genderVotes.set(id, v);
  };

  const voteFromNarration = (id: string, narration: string) => {
    for (const w of narration.toLowerCase().match(/\p{L}+/gu) ?? []) {
      if (FEMALE_PRONOUNS.has(w)) vote(id, 'f');
      else if (MALE_PRONOUNS.has(w)) vote(id, 'm');
    }
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
    for (const c of chars.values()) {
      for (const a of c.aliases) {
        const key = canonicalKey(a).key;
        if (key && quote.toLowerCase().includes(key)) out.add(c.id);
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
  const findTag = (after: string, before: string): { tag: Tag; confidence: number } | undefined => {
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
  let narrationSince = 0;

  blocks.forEach((text, block) => {
    if (!text) {
      lastSpeakers = [];
      narrationSince = 0;
      return;
    }
    const spans = findDialogue(text, base);
    if (!spans.length) {
      noticeNames(text);
      if (++narrationSince > CONVERSATION_GAP) lastSpeakers = [];
      return;
    }
    narrationSince = 0;

    // Narration inside the paragraph (outside the quotes) can introduce or recall people.
    const narration =
      spans.reduce((acc, s, k) => acc + text.slice(spans[k - 1]?.end ?? 0, s.start), '') +
      text.slice(spans[spans.length - 1]?.end ?? 0);
    const namedHere = noticeNames(narration);

    const lastSpeaker = lastSpeakers[lastSpeakers.length - 1];
    let paragraphSpeaker: { id: string; confidence: number } | undefined;
    const local: { span: DialogueSpan; id?: string; confidence: number }[] = [];
    spans.forEach((span, k) => {
      const after = text.slice(span.end, spans[k + 1]?.start ?? text.length).slice(0, 80);
      const before = text.slice(spans[k - 1]?.end ?? 0, span.start).slice(-80);
      const quote = text.slice(span.start, span.end);
      const found = findTag(after, before);
      const ambiguous =
        found?.tag.kind === 'pronoun' && pronounIsAmbiguous(found.tag, quote, lastSpeaker, namedHere);
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
        if (!l.id) {
          l.id = paragraphSpeaker.id;
          l.confidence = Math.min(0.85, paragraphSpeaker.confidence);
        }
      }
    } else {
      // Untagged turn: the other person in the conversation, never the one being spoken to.
      const quotes = local.map((l) => text.slice(l.span.start, l.span.end)).join(' ');
      const spokenTo = addressees(quotes);
      const previous = lastSpeakers[lastSpeakers.length - 2];
      const other =
        previous && previous !== lastSpeaker && !spokenTo.has(previous)
          ? previous
          : recentWhere((id) => id !== lastSpeaker && !spokenTo.has(id) && id !== 'narrator-i');
      if (other && lastSpeaker) {
        // Two people taking turns is the commonest pattern in fiction; confident enough for their own voices.
        const confidence = previous === other ? 0.75 : 0.7;
        for (const l of local) {
          l.id = other;
          l.confidence = confidence;
        }
      }
    }

    for (const l of local) {
      attributions.push(
        l.id
          ? { block, span: l.span, speaker: l.id, confidence: l.confidence }
          : { block, span: l.span, confidence: 0 },
      );
      if (l.id) {
        const c = chars.get(l.id);
        if (c) c.lines++;
        touch(l.id);
      }
    }
    const speaker = local.find((l) => l.id)?.id;
    if (speaker) lastSpeakers = [...lastSpeakers, speaker].slice(-4);
  });

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
