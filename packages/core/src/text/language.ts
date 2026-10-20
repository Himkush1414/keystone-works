/**
 * Language detection for the voice languages Lamplight supports. Script first, then frequent-word and
 * diacritic scoring for Latin and Cyrillic text. Small, deterministic, no model files.
 */

export const VOICE_LANGUAGES = [
  'en',
  'ko',
  'ja',
  'ar',
  'bg',
  'cs',
  'da',
  'de',
  'el',
  'es',
  'et',
  'fi',
  'fr',
  'hi',
  'hr',
  'hu',
  'id',
  'it',
  'lt',
  'lv',
  'nl',
  'pl',
  'pt',
  'ro',
  'ru',
  'sk',
  'sl',
  'sv',
  'tr',
  'uk',
  'vi',
] as const;

export type VoiceLanguage = (typeof VOICE_LANGUAGES)[number];

export interface Detection {
  /** Best language, or undefined when the text is in a script no voice supports (e.g. Chinese, Thai). */
  lang: VoiceLanguage | undefined;
  /** 0–1. Below ~0.35 the guess is weak; callers keep the user's or document's language. */
  confidence: number;
}

// prettier-ignore
const STOPWORDS: Record<string, string> = {
  en: 'the of and to in a is that it was for on with as he she his her you they be at by this had not but from have are or which one all were we when there an their',
  de: 'der die und in den von zu das mit sich des auf für ist im dem nicht ein eine als auch es an werden aus er hat dass sie nach wird bei einer um am sind noch wie',
  es: 'de la que el en y a los del se las por un para con no una su al lo como más pero sus le ya o este sí porque esta entre cuando muy sin sobre también',
  fr: 'de la le et les des en un du une que est pour qui dans par plus pas au sur ne se ce il sont avec elle mais nous vous cette son ses aux ou',
  it: 'di e il la che in a per un è del non una le si da con i al lo sono della come ma anche ha nel gli più questo alla se',
  pt: 'de a o que e do da em um para é com não uma os no se na por mais as dos como mas foi ao ele das tem à seu sua ou ser quando muito',
  nl: 'de en van het een in is dat op te zijn met voor niet aan er die maar om ook als bij of door hij ze uit nog wel dan naar',
  sv: 'och i att det som en på är av för med till den har de inte om ett han men var jag sig från vi så kan när',
  da: 'og i at det en den til er som på de med han af for ikke der var mig sig men et har om vi min havde fra',
  pl: 'i w nie na się z do to że jest jak o co ale po tak za od go już jego jej przez tylko może są być',
  cs: 'a se na je v že to s z o do i jako ale by jsem jsou už jeho když tak jak pro být nebo který také',
  sk: 'a sa na je v že to s z o do ako ale by som sú už jeho keď tak pre byť alebo ktorý aj',
  sl: 'in je v se na da za z so ki pa ne bi to tudi kot iz do po ali še sem jih',
  hr: 'i je u se na da za s su od ne to kao što koji ali iz bi li sam ga mu još',
  ro: 'și de la în a cu pe că nu se este o un din care pentru mai ca sunt sau dar fost',
  hu: 'a az és hogy nem is egy meg van de ez már csak volt mint még el ki fel azt ha',
  tr: 've bir bu da de için ile çok ne ama gibi daha o en kadar olan sonra var mi ben',
  fi: 'ja on ei se että hän oli ovat kun niin mutta tai jos kuin myös mitä joka hänen ole',
  et: 'ja on ei et see ta oli ka kui aga või siis veel nii mis oma mida seda',
  lt: 'ir yra kad ne su į iš o bet kaip tai jo jis buvo dar tik apie',
  lv: 'un ir ka ar no par uz bet kā tas vai ja arī tikai viņš bija',
  id: 'yang dan di itu dengan untuk tidak ini dari dalam akan ke ada pada juga saya mereka atau',
  vi: 'và của là có không một những được trong cho người này đã với các khi',
  ru: 'и в не на я что он с как а то это по но из у за она так же от бы его',
  uk: 'і в не на що я він з як а та це по але з у за вона так же від би його',
  bg: 'и в не на да се че е с за от по са как но това той тя ще като',
};

const SETS = new Map(Object.entries(STOPWORDS).map(([k, v]) => [k, new Set(v.split(' '))]));

const HINTS: [RegExp, string, number][] = [
  [/[őű]/gu, 'hu', 3],
  [/[ąęłńśźż]/gu, 'pl', 2],
  [/[řěů]/gu, 'cs', 3],
  [/[ľĺŕô]/gu, 'sk', 2],
  [/[șțâî]/gu, 'ro', 1.5],
  [/ă/gu, 'ro', 1],
  [/[ğış]/gu, 'tr', 3],
  [/[āēīūļņģķ]/gu, 'lv', 2],
  [/[ėįų]/gu, 'lt', 3],
  [/õ/gu, 'et', 1],
  [/[ạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹơư]/gu, 'vi', 4],
  [/[ãõ]/gu, 'pt', 0.6],
  [/ç/gu, 'pt', 0.2],
  [/ñ/gu, 'es', 1.5],
  [/[¿¡]/gu, 'es', 2],
  [/ß/gu, 'de', 3],
  [/[äöü]/gu, 'de', 0.4],
  [/[æø]/gu, 'da', 2],
  [/å/gu, 'sv', 0.8],
  [/[čšž]/gu, 'sl', 0.3],
  [/đ/gu, 'hr', 2],
  [/[ïëœ]/gu, 'fr', 0.8],
  [/[àèù]/gu, 'it', 0.2],
];

function scriptOf(text: string): 'latin' | 'cyrillic' | VoiceLanguage | 'unsupported' | 'none' {
  const counts = { latin: 0, cyrillic: 0, ko: 0, kana: 0, han: 0, ar: 0, el: 0, hi: 0, other: 0 };
  for (const ch of text) {
    if (/\p{Script=Latin}/u.test(ch)) counts.latin++;
    else if (/\p{Script=Cyrillic}/u.test(ch)) counts.cyrillic++;
    else if (/\p{Script=Hangul}/u.test(ch)) counts.ko++;
    else if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(ch)) counts.kana++;
    else if (/\p{Script=Han}/u.test(ch)) counts.han++;
    else if (/\p{Script=Arabic}/u.test(ch)) counts.ar++;
    else if (/\p{Script=Greek}/u.test(ch)) counts.el++;
    else if (/\p{Script=Devanagari}/u.test(ch)) counts.hi++;
    else if (/\p{L}/u.test(ch)) counts.other++;
  }
  const japanese = counts.kana + (counts.kana > 0 ? counts.han : 0);
  const entries: [string, number][] = [
    ['latin', counts.latin],
    ['cyrillic', counts.cyrillic],
    ['ko', counts.ko],
    ['ja', japanese],
    ['unsupported', counts.kana > 0 ? counts.other : counts.han + counts.other],
    ['ar', counts.ar],
    ['el', counts.el],
    ['hi', counts.hi],
  ];
  const [best, n] = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
  if (n === 0) return 'none';
  return best as ReturnType<typeof scriptOf>;
}

/** Detects the language of `text` (uses up to the first ~4,000 characters). */
export function detectLanguage(text: string): Detection {
  const sample = text.slice(0, 4000);
  const script = scriptOf(sample);
  if (script === 'none') return { lang: undefined, confidence: 0 };
  if (script === 'unsupported') return { lang: undefined, confidence: 0.9 };
  if (script !== 'latin' && script !== 'cyrillic') return { lang: script, confidence: 0.95 };

  const lower = sample.toLowerCase();
  const tokens = lower.match(/\p{L}+/gu) ?? [];
  if (!tokens.length) return { lang: undefined, confidence: 0 };
  const candidates =
    script === 'cyrillic'
      ? ['ru', 'uk', 'bg']
      : [...SETS.keys()].filter((k) => !['ru', 'uk', 'bg'].includes(k));

  const scores = new Map<string, number>(candidates.map((c) => [c, 0]));
  for (const t of tokens)
    for (const c of candidates) if (SETS.get(c)?.has(t)) scores.set(c, (scores.get(c) ?? 0) + 1);
  for (const [k, v] of scores) scores.set(k, v / tokens.length);

  if (script === 'latin') {
    for (const [re, lang, weight] of HINTS) {
      const hits = lower.match(re)?.length ?? 0;
      if (hits) scores.set(lang, (scores.get(lang) ?? 0) + (weight * hits) / tokens.length);
    }
  } else {
    const uk = lower.match(/[іїєґ]/gu)?.length ?? 0;
    const ru = lower.match(/[ыэё]/gu)?.length ?? 0;
    scores.set('uk', (scores.get('uk') ?? 0) + (3 * uk) / tokens.length);
    scores.set('ru', (scores.get('ru') ?? 0) + (3 * ru) / tokens.length);
    if (!uk && !ru)
      scores.set('bg', (scores.get('bg') ?? 0) + (lower.match(/ъ/gu)?.length ?? 0) / tokens.length);
  }

  const ranked = [...scores].sort((a, b) => b[1] - a[1]);
  const [top, second] = ranked;
  if (!top || top[1] === 0) return { lang: script === 'latin' ? 'en' : 'ru', confidence: 0.1 };
  const margin = top[1] - (second?.[1] ?? 0);
  const confidence = Math.min(1, top[1] * 2.2) * Math.min(1, 0.4 + margin * 6);
  return { lang: top[0] as VoiceLanguage, confidence: Math.round(confidence * 100) / 100 };
}
