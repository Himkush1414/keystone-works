import { findDialogue, type DialogueSpan } from './dialogue';

/** Speech verbs per language, used to find dialogue tags ("said Elizabeth", "Elizabeth asked"). */
// prettier-ignore
const VERBS: Record<string, string> = {
  en: 'said says asked asks replied replies answered answers whispered whispers shouted shouts cried cries called calls murmured murmurs muttered mutters exclaimed exclaims added adds continued continues began begins remarked remarks returned returns observed observes sighed sighs laughed laughs snapped snaps declared declares insisted insists protested protests repeated repeats told tells demanded demands inquired enquired went yelled screamed breathed admitted agreed suggested warned urged pleaded interrupted retorted',
  es: 'dijo dice preguntó pregunta respondió responde contestó contesta susurró susurra gritó grita exclamó exclama murmuró murmura añadió añade continuó continúa repitió repite insistió insiste replicó replica',
  de: 'sagte sagt fragte fragt antwortete antwortet flüsterte flüstert rief ruft schrie schreit murmelte murmelt meinte meint fügte erwiderte erwidert fuhr wiederholte',
  fr: 'dit demanda demande répondit répond murmura murmure cria crie s’écria chuchota chuchote ajouta ajoute reprit reprend continua continue répéta répète lança lance',
  it: 'disse dice chiese chiede rispose risponde sussurrò sussurra gridò grida esclamò esclama mormorò mormora aggiunse aggiunge continuò continua ripeté ripete',
  pt: 'disse diz perguntou pergunta respondeu responde sussurrou sussurra gritou grita exclamou exclama murmurou murmura acrescentou acrescenta continuou continua repetiu repete',
};

const FEMALE_HONORIFICS =
  /^(?:mrs|miss|ms|lady|madam|madame|mme|mlle|señora|sra|señorita|srta|frau|fräulein|signora|sig\.ra|dona|dña|senhora|sra|aunt|queen|princess|duchess|sister|mother)\.?$/iu;
const MALE_HONORIFICS =
  /^(?:mr|sir|lord|monsieur|m|señor|sr|herr|signor|sig|dom|don|senhor|uncle|king|prince|duke|brother|father|captain|colonel|major|general)\.?$/iu;
const HONORIFIC =
  /^(?:mr|mrs|miss|ms|dr|sir|lady|lord|madam|madame|monsieur|mme|mlle|señor|señora|señorita|sr|sra|srta|don|doña|dña|herr|frau|fräulein|signor|signora|sig|dott|dom|dona|senhor|senhora|aunt|uncle|captain|colonel|major|general|professor|prof|king|queen|prince|princess|duke|duchess|father|mother|sister|brother)\.?$/iu;

/** Capitalised words that start sentences but aren't names. */
// prettier-ignore
const NOT_NAMES = new Set('the a an and but or then there this that these those it its he she they we you i his her their our your my when while if as so yet still now here what who why how where which oh ah well yes no not one all some every no-one nobody somebody everyone el la los las un una y pero entonces ella él ellos der die das ein eine und aber dann sie er es le la les un une et mais puis elle il ils il lo gli una e ma poi lei lui o a os as um uma mas então ela ele'.split(' '));

const FEMALE_PRONOUNS = new Set(['she', 'her', 'ella', 'sie', 'elle', 'lei', 'ela']);
const MALE_PRONOUNS = new Set(['he', 'him', 'his', 'él', 'er', 'il', 'lui', 'ele']);

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

const NAME = String.raw`((?:(?:Mr|Mrs|Ms|Miss|Dr|Sir|Lady|Lord|Captain|Colonel|Madame|Monsieur|Señor|Señora|Herr|Frau|Signor|Signora|Dom|Dona|Don|Doña)\.?\s+)?\p{Lu}[\p{L}'’-]+(?:\s+\p{Lu}[\p{L}'’-]+){0,2})`;
const PRONOUN = String.raw`(he|she|they|I|we|él|ella|er|sie|il|elle|lui|lei|ele|ela)`;

function tagPatterns(lang: string) {
  const verbs = (VERBS[lang] ?? VERBS.en ?? '').split(' ').join('|');
  return {
    // After the quote: ", said Elizabeth" / " Elizabeth said" / " she asked" / "—dijo Juan—"
    verbName: new RegExp(String.raw`^[\s,—–-]*(?:${verbs})\s+${NAME}`, 'u'),
    nameVerb: new RegExp(String.raw`^[\s,—–-]*${NAME}\s+(?:\p{Ll}+\s+)?(?:${verbs})\b`, 'u'),
    pronounVerb: new RegExp(String.raw`^[\s,—–-]*${PRONOUN}\s+(?:\p{Ll}+\s+)?(?:${verbs})\b`, 'iu'),
    verbPronoun: new RegExp(String.raw`^[\s,—–-]*(?:${verbs})\s+${PRONOUN}\b`, 'iu'),
    // Before the quote: "Elizabeth said, " / "Elizabeth turned to him and said:"
    before: new RegExp(String.raw`${NAME}\s+(?:[^.!?“”"«»]{0,40}\s)?(?:${verbs})\s*[,:]?\s*$`, 'u'),
  };
}

function canonicalKey(name: string): { key: string; display: string; honorific?: string } {
  const parts = name.trim().split(/\s+/);
  const first = parts[0] ?? '';
  if (parts.length > 1 && HONORIFIC.test(first)) {
    return { key: (parts[parts.length - 1] ?? '').toLowerCase(), display: name.trim(), honorific: first };
  }
  return { key: (parts[parts.length - 1] ?? first).toLowerCase(), display: name.trim() };
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '');

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
  const recent: string[] = []; // speakers, most recent last

  const register = (raw: string): string | undefined => {
    const words = raw.trim().split(/\s+/);
    if (words.length === 1 && NOT_NAMES.has(raw.toLowerCase())) return undefined;
    if (NOT_NAMES.has((words[0] ?? '').toLowerCase()) && !HONORIFIC.test(words[0] ?? '')) return undefined;
    const { key, display, honorific } = canonicalKey(raw);
    if (!key || NOT_NAMES.has(key)) return undefined;
    // Match an existing character by key (last name / single name).
    let existing = [...chars.values()].find(
      (c) => c.id === slug(key) || c.aliases.some((a) => canonicalKey(a).key === key),
    );
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
    return existing.id;
  };

  const voteGender = (id: string, narration: string) => {
    const words = narration.toLowerCase().match(/\p{L}+/gu) ?? [];
    const v = genderVotes.get(id) ?? { f: 0, m: 0 };
    for (const w of words) {
      if (FEMALE_PRONOUNS.has(w)) v.f++;
      else if (MALE_PRONOUNS.has(w)) v.m++;
    }
    genderVotes.set(id, v);
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

  const resolvePronoun = (p: string): string | undefined => {
    const lower = p.toLowerCase();
    const want: Gender | undefined = FEMALE_PRONOUNS.has(lower)
      ? 'f'
      : MALE_PRONOUNS.has(lower)
        ? 'm'
        : undefined;
    if (!want) return undefined;
    for (let i = recent.length - 1; i >= 0; i--) {
      const id = recent[i];
      if (id && genderOf(id) === want) return id;
    }
    return undefined;
  };

  const touch = (id: string) => {
    const idx = recent.lastIndexOf(id);
    if (idx >= 0) recent.splice(idx, 1);
    recent.push(id);
    if (recent.length > 8) recent.shift();
  };

  let lastDialogueSpeakers: (string | undefined)[] = [];

  blocks.forEach((text, block) => {
    if (!text) {
      lastDialogueSpeakers = [];
      return;
    }
    const spans = findDialogue(text, base);
    if (!spans.length) {
      // Narration: names mentioned here become likely speakers of what follows.
      // Known characters, and new ones introduced with an honorific ("Mr. Bennet came in"), are tracked.
      for (const m of text.matchAll(new RegExp(NAME, 'gu'))) {
        const raw = m[1] ?? '';
        const known = [...chars.values()].find((c) =>
          c.aliases.some((a) => canonicalKey(a).key === canonicalKey(raw).key),
        );
        const id = known?.id ?? (canonicalKey(raw).honorific ? register(raw) : undefined);
        if (id) {
          voteGender(id, text);
          touch(id);
        }
      }
      lastDialogueSpeakers = [];
      return;
    }

    let paragraphSpeaker: { id: string; confidence: number } | undefined;
    const local: { span: DialogueSpan; id?: string; confidence: number }[] = [];
    spans.forEach((span, k) => {
      const after = text.slice(span.end, spans[k + 1]?.start ?? text.length).slice(0, 80);
      const before = text.slice(spans[k - 1]?.end ?? 0, span.start).slice(-80);
      let id: string | undefined;
      let confidence = 0;
      const m1 = pat.verbName.exec(after) ?? pat.nameVerb.exec(after);
      const m2 = !m1 ? pat.before.exec(before) : null;
      const named = m1?.[1] ?? m2?.[1];
      if (named) {
        id = register(named);
        if (id) {
          confidence = 0.95;
          voteGender(id, after + before);
        }
      }
      if (!id) {
        const pm = pat.pronounVerb.exec(after) ?? pat.verbPronoun.exec(after);
        const pron = pm?.[1];
        if (pron && /^(?:i|we)$/i.test(pron)) {
          id = register('Narrator-I') ?? undefined;
          confidence = 0.9;
        } else if (pron) {
          id = resolvePronoun(pron);
          if (id) confidence = 0.75;
        }
      }
      if (id) {
        touch(id);
        paragraphSpeaker ??= { id, confidence };
      }
      local.push(id ? { span, id, confidence } : { span, confidence: 0 });
    });

    // One tag in a paragraph usually covers every quote in it.
    if (paragraphSpeaker) {
      for (const l of local) {
        if (!l.id) {
          l.id = paragraphSpeaker.id;
          l.confidence = Math.min(0.85, paragraphSpeaker.confidence);
        }
      }
    } else if (local.every((l) => !l.id)) {
      // Untagged exchange: alternate between the two most recent distinct speakers.
      const [a, b] = lastDialogueSpeakers.slice(-2);
      if (a && b && a !== b) {
        for (const l of local) {
          l.id = a;
          l.confidence = 0.6;
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
      }
    }
    const speaker = local.find((l) => l.id)?.id;
    lastDialogueSpeakers = [...lastDialogueSpeakers, speaker].slice(-2);
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
