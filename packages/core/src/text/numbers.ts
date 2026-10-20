/**
 * Numbers to words for narration in English, Spanish, German, French, Portuguese (Brazil) and Italian.
 * Other languages keep digits (the voice model reads them acceptably).
 */

export type NumberLang = 'en' | 'es' | 'de' | 'fr' | 'pt' | 'it';

export const NUMBER_LANGS: readonly NumberLang[] = ['en', 'es', 'de', 'fr', 'pt', 'it'];

export function numberLang(lang: string): NumberLang | undefined {
  const base = lang.slice(0, 2) as NumberLang;
  return NUMBER_LANGS.includes(base) ? base : undefined;
}

const MAX = 999_999_999_999_999;

// ───────────────────────────── English ─────────────────────────────
// prettier-ignore
const EN_ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
// prettier-ignore
const EN_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
// prettier-ignore
const EN_SCALES = ['', 'thousand', 'million', 'billion', 'trillion'];

function en999(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${EN_ONES[h]} hundred`);
  if (r)
    parts.push(
      r < 20 ? (EN_ONES[r] ?? '') : `${EN_TENS[Math.floor(r / 10)]}${r % 10 ? `-${EN_ONES[r % 10]}` : ''}`,
    );
  return parts.join(' ');
}

function enCardinal(n: number): string {
  if (n === 0) return 'zero';
  const groups: string[] = [];
  for (let i = 0; n > 0; i++, n = Math.floor(n / 1000)) {
    const g = n % 1000;
    if (g) groups.unshift(`${en999(g)}${EN_SCALES[i] ? ` ${EN_SCALES[i]}` : ''}`);
  }
  return groups.join(' ');
}

// prettier-ignore
const EN_ORD_IRREGULAR: Record<string, string> = { one: 'first', two: 'second', three: 'third', five: 'fifth', eight: 'eighth', nine: 'ninth', twelve: 'twelfth' };

function enOrdinal(n: number): string {
  const words = enCardinal(n);
  return words.replace(
    /(\w+)$/,
    (w) => EN_ORD_IRREGULAR[w] ?? (w.endsWith('y') ? `${w.slice(0, -1)}ieth` : `${w}th`),
  );
}

function enYear(n: number): string {
  if (n >= 2000 && n <= 2009) return enCardinal(n);
  if (n < 1000 || n > 2099) return enCardinal(n);
  const hi = Math.floor(n / 100);
  const lo = n % 100;
  if (lo === 0) return `${enCardinal(hi)} hundred`;
  return `${enCardinal(hi)} ${lo < 10 ? `oh ${EN_ONES[lo]}` : enCardinal(lo)}`;
}

// ───────────────────────────── Spanish ─────────────────────────────
// prettier-ignore
const ES_ONES = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
// prettier-ignore
const ES_TENS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
// prettier-ignore
const ES_HUNDREDS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

function es999(n: number, apocope: boolean): string {
  if (n === 100) return 'cien';
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(ES_HUNDREDS[h] ?? '');
  if (r) {
    let w =
      r < 30 ? (ES_ONES[r] ?? '') : `${ES_TENS[Math.floor(r / 10)]}${r % 10 ? ` y ${ES_ONES[r % 10]}` : ''}`;
    if (apocope) w = w.replace(/veintiuno$/, 'veintiún').replace(/uno$/, 'un');
    parts.push(w);
  }
  return parts.join(' ');
}

function esCardinal(n: number, apocope = false): string {
  if (n === 0) return 'cero';
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (millions) {
    if (millions >= 1_000_000) {
      const b = Math.floor(millions / 1_000_000);
      parts.push(b === 1 ? 'un billón' : `${esCardinal(b, true)} billones`);
    }
    const m = millions % 1_000_000;
    if (m) parts.push(m === 1 ? 'un millón' : `${esCardinal(m, true)} millones`);
  }
  if (thousands) parts.push(thousands === 1 ? 'mil' : `${es999(thousands, true)} mil`);
  if (rest) parts.push(es999(rest, apocope));
  return parts.join(' ');
}

// prettier-ignore
const ES_ORD = ['', 'primero', 'segundo', 'tercero', 'cuarto', 'quinto', 'sexto', 'séptimo', 'octavo', 'noveno', 'décimo'];

// ───────────────────────────── German ─────────────────────────────
// prettier-ignore
const DE_ONES = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf', 'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn'];
// prettier-ignore
const DE_TENS = ['', '', 'zwanzig', 'dreißig', 'vierzig', 'fünfzig', 'sechzig', 'siebzig', 'achtzig', 'neunzig'];

function de99(n: number, unit: boolean): string {
  if (n < 20) return n === 1 ? (unit ? 'eins' : 'ein') : (DE_ONES[n] ?? '');
  const o = n % 10;
  const t = DE_TENS[Math.floor(n / 10)] ?? '';
  return o ? `${o === 1 ? 'ein' : DE_ONES[o]}und${t}` : t;
}

function de999(n: number, unit: boolean): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return `${h ? `${h === 1 ? 'ein' : DE_ONES[h]}hundert` : ''}${r ? de99(r, unit) : ''}`;
}

function deCardinal(n: number): string {
  if (n === 0) return 'null';
  const parts: string[] = [];
  const big: [number, string, string][] = [
    [1e12, 'Billion', 'Billionen'],
    [1e9, 'Milliarde', 'Milliarden'],
    [1e6, 'Million', 'Millionen'],
  ];
  for (const [size, one, many] of big) {
    const q = Math.floor(n / size);
    if (q) parts.push(q === 1 ? `eine ${one}` : `${deCardinal(q)} ${many}`);
    n %= size;
  }
  const th = Math.floor(n / 1000);
  const rest = n % 1000;
  const small = `${th ? `${de999(th, false)}tausend` : ''}${rest ? de999(rest, true) : ''}`;
  if (small) parts.push(small);
  return parts.join(' ');
}

function deOrdinal(n: number): string {
  if (n === 1) return 'erste';
  if (n === 3) return 'dritte';
  if (n === 7) return 'siebte';
  if (n === 8) return 'achte';
  const w = deCardinal(n);
  return n < 20 ? `${w}te` : `${w}ste`;
}

function deYear(n: number): string {
  if (n >= 1100 && n < 2000)
    return `${deCardinal(Math.floor(n / 100))}hundert${n % 100 ? de99(n % 100, true) : ''}`;
  return deCardinal(n);
}

// ───────────────────────────── French ─────────────────────────────
// prettier-ignore
const FR_ONES = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
// prettier-ignore
const FR_TENS = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];

function fr99(n: number): string {
  if (n < 20) return FR_ONES[n] ?? '';
  if (n < 70) {
    const t = FR_TENS[Math.floor(n / 10)] ?? '';
    const o = n % 10;
    return o === 0 ? t : o === 1 ? `${t} et un` : `${t}-${FR_ONES[o]}`;
  }
  if (n < 80) return n === 71 ? 'soixante et onze' : `soixante-${FR_ONES[n - 60]}`;
  return n === 80 ? 'quatre-vingts' : `quatre-vingt-${FR_ONES[n - 80]}`;
}

function fr999(n: number, final: boolean): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  let s = '';
  if (h) s = h === 1 ? 'cent' : `${FR_ONES[h]} cent${r === 0 && final ? 's' : ''}`;
  if (r) s = s ? `${s} ${fr99(r)}` : fr99(r);
  if (!final) s = s.replace(/quatre-vingts$/, 'quatre-vingt');
  return s;
}

function frCardinal(n: number): string {
  if (n === 0) return 'zéro';
  const parts: string[] = [];
  const big: [number, string][] = [
    [1e12, 'billion'],
    [1e9, 'milliard'],
    [1e6, 'million'],
  ];
  for (const [size, word] of big) {
    const q = Math.floor(n / size);
    if (q) parts.push(`${frCardinal(q)} ${word}${q > 1 ? 's' : ''}`);
    n %= size;
  }
  const th = Math.floor(n / 1000);
  const rest = n % 1000;
  if (th) parts.push(th === 1 ? 'mille' : `${fr999(th, false)} mille`);
  if (rest) parts.push(fr999(rest, true));
  return parts.join(' ');
}

function frOrdinal(n: number): string {
  if (n === 1) return 'premier';
  const w = frCardinal(n)
    .replace(/cinq$/, 'cinqu')
    .replace(/neuf$/, 'neuv')
    .replace(/e$/, '')
    .replace(/s$/, '');
  return `${w}ième`;
}

// ───────────────────────────── Portuguese (Brazil) ─────────────────────────────
// prettier-ignore
const PT_ONES = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
// prettier-ignore
const PT_TENS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
// prettier-ignore
const PT_HUNDREDS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

function pt999(n: number): string {
  if (n === 100) return 'cem';
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(PT_HUNDREDS[h] ?? '');
  if (r)
    parts.push(
      r < 20 ? (PT_ONES[r] ?? '') : `${PT_TENS[Math.floor(r / 10)]}${r % 10 ? ` e ${PT_ONES[r % 10]}` : ''}`,
    );
  return parts.join(' e ');
}

function ptCardinal(n: number): string {
  if (n === 0) return 'zero';
  const groups: { value: number; text: string }[] = [];
  const big: [number, string, string][] = [
    [1e12, 'trilhão', 'trilhões'],
    [1e9, 'bilhão', 'bilhões'],
    [1e6, 'milhão', 'milhões'],
  ];
  for (const [size, one, many] of big) {
    const q = Math.floor(n / size);
    if (q) groups.push({ value: q * size, text: `${ptCardinal(q)} ${q === 1 ? one : many}` });
    n %= size;
  }
  const th = Math.floor(n / 1000);
  const rest = n % 1000;
  if (th) groups.push({ value: th * 1000, text: th === 1 ? 'mil' : `${pt999(th)} mil` });
  if (rest) groups.push({ value: rest, text: pt999(rest) });
  // "e" joins the last group when it is below 100 or a round hundred.
  return groups
    .map((g, i) =>
      i > 0 && i === groups.length - 1 && (g.value < 100 || g.value % 100 === 0) ? `e ${g.text}` : g.text,
    )
    .join(' ');
}

// prettier-ignore
const PT_ORD = ['', 'primeiro', 'segundo', 'terceiro', 'quarto', 'quinto', 'sexto', 'sétimo', 'oitavo', 'nono', 'décimo'];

// ───────────────────────────── Italian ─────────────────────────────
// prettier-ignore
const IT_ONES = ['zero', 'uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove', 'dieci', 'undici', 'dodici', 'tredici', 'quattordici', 'quindici', 'sedici', 'diciassette', 'diciotto', 'diciannove'];
// prettier-ignore
const IT_TENS = ['', '', 'venti', 'trenta', 'quaranta', 'cinquanta', 'sessanta', 'settanta', 'ottanta', 'novanta'];

function it99(n: number): string {
  if (n < 20) return IT_ONES[n] ?? '';
  const t = IT_TENS[Math.floor(n / 10)] ?? '';
  const o = n % 10;
  if (o === 0) return t;
  const stem = o === 1 || o === 8 ? t.slice(0, -1) : t;
  return `${stem}${o === 3 ? 'tré' : IT_ONES[o]}`;
}

function it999(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const head = h === 0 ? '' : h === 1 ? 'cento' : `${IT_ONES[h]}cento`;
  const tail = r ? it99(r) : '';
  return head && tail.startsWith('o') ? `${head.slice(0, -1)}${tail}` : `${head}${tail}`;
}

function itCardinal(n: number): string {
  if (n === 0) return 'zero';
  const parts: string[] = [];
  const big: [number, string, string][] = [
    [1e12, 'mille miliardi', 'mila miliardi'],
    [1e9, 'miliardo', 'miliardi'],
    [1e6, 'milione', 'milioni'],
  ];
  for (const [size, one, many] of big) {
    const q = Math.floor(n / size);
    if (q) parts.push(q === 1 ? `un ${one}` : `${itCardinal(q)} ${many}`);
    n %= size;
  }
  const th = Math.floor(n / 1000);
  const rest = n % 1000;
  const small = `${th ? (th === 1 ? 'mille' : `${it999(th)}mila`) : ''}${rest ? it999(rest) : ''}`;
  if (small) parts.push(small);
  return parts.join(' ');
}

// prettier-ignore
const IT_ORD = ['', 'primo', 'secondo', 'terzo', 'quarto', 'quinto', 'sesto', 'settimo', 'ottavo', 'nono', 'decimo'];

function itOrdinal(n: number): string {
  if (n <= 10) return IT_ORD[n] ?? '';
  const w = itCardinal(n);
  return /tré$/.test(w) ? `${w.slice(0, -1)}eesimo` : `${w.replace(/[aeio]$/, '')}esimo`;
}

// ───────────────────────────── Public API ─────────────────────────────

/** Cardinal number in words. Integers only, |n| ≤ 999 trillion; others fall back to digits. */
export function cardinal(n: number, lang: NumberLang): string {
  if (!Number.isInteger(n) || Math.abs(n) > MAX) return String(n);
  if (n < 0) return `${MINUS[lang]} ${cardinal(-n, lang)}`;
  switch (lang) {
    case 'en':
      return enCardinal(n);
    case 'es':
      return esCardinal(n);
    case 'de':
      return deCardinal(n);
    case 'fr':
      return frCardinal(n);
    case 'pt':
      return ptCardinal(n);
    case 'it':
      return itCardinal(n);
  }
}

/** Ordinal number in words ("twenty-first", "vigésimo primero" falls back to cardinal beyond tenth). */
export function ordinal(n: number, lang: NumberLang): string {
  if (!Number.isInteger(n) || n < 1 || n > MAX) return String(n);
  switch (lang) {
    case 'en':
      return enOrdinal(n);
    case 'de':
      return deOrdinal(n);
    case 'fr':
      return frOrdinal(n);
    case 'it':
      return itOrdinal(n);
    case 'es':
      return ES_ORD[n] ?? esCardinal(n);
    case 'pt':
      return PT_ORD[n] ?? ptCardinal(n);
  }
}

/** A year read the way people say it ("nineteen eighty-four", "neunzehnhundertvierundachtzig"). */
export function year(n: number, lang: NumberLang): string {
  if (lang === 'en') return enYear(n);
  if (lang === 'de') return deYear(n);
  return cardinal(n, lang);
}

const MINUS: Record<NumberLang, string> = {
  en: 'minus',
  es: 'menos',
  de: 'minus',
  fr: 'moins',
  pt: 'menos',
  it: 'meno',
};
const POINT: Record<NumberLang, string> = {
  en: 'point',
  es: 'coma',
  de: 'Komma',
  fr: 'virgule',
  pt: 'vírgula',
  it: 'virgola',
};

/** Decimal number: integer part in words, then each fractional digit ("three point one four"). */
export function decimal(intPart: string, fracPart: string, lang: NumberLang): string {
  const digits = [...fracPart].map((d) => cardinal(Number(d), lang)).join(' ');
  return `${cardinal(Number(intPart), lang)} ${POINT[lang]} ${digits}`;
}
