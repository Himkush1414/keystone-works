import { describe, expect, it } from 'vitest';
import { cardinal, decimal, numberLang, ordinal, year } from '../src/text/numbers';

describe('English', () => {
  it.each([
    [0, 'zero'],
    [7, 'seven'],
    [13, 'thirteen'],
    [21, 'twenty-one'],
    [100, 'one hundred'],
    [105, 'one hundred five'],
    [999, 'nine hundred ninety-nine'],
    [1000, 'one thousand'],
    [2026, 'two thousand twenty-six'],
    [1_000_001, 'one million one'],
    [3_400_000_000, 'three billion four hundred million'],
    [-42, 'minus forty-two'],
  ])('cardinal %i → %s', (n, w) => expect(cardinal(n, 'en')).toBe(w));

  it.each([
    [1, 'first'],
    [2, 'second'],
    [3, 'third'],
    [5, 'fifth'],
    [9, 'ninth'],
    [12, 'twelfth'],
    [20, 'twentieth'],
    [21, 'twenty-first'],
    [100, 'one hundredth'],
    [103, 'one hundred third'],
  ])('ordinal %i → %s', (n, w) => expect(ordinal(n, 'en')).toBe(w));

  it.each([
    [1984, 'nineteen eighty-four'],
    [1900, 'nineteen hundred'],
    [1905, 'nineteen oh five'],
    [2000, 'two thousand'],
    [2007, 'two thousand seven'],
    [2026, 'twenty twenty-six'],
    [800, 'eight hundred'],
  ])('year %i → %s', (n, w) => expect(year(n, 'en')).toBe(w));

  it('reads decimals digit by digit after the point', () => {
    expect(decimal('3', '14', 'en')).toBe('three point one four');
  });
});

describe('Spanish', () => {
  it.each([
    [1, 'uno'],
    [16, 'dieciséis'],
    [21, 'veintiuno'],
    [31, 'treinta y uno'],
    [100, 'cien'],
    [101, 'ciento uno'],
    [500, 'quinientos'],
    [1000, 'mil'],
    [2001, 'dos mil uno'],
    [21_000, 'veintiún mil'],
    [1_000_000, 'un millón'],
    [21_000_000, 'veintiún millones'],
  ])('cardinal %i → %s', (n, w) => expect(cardinal(n, 'es')).toBe(w));

  it('ordinals up to tenth, cardinals beyond', () => {
    expect(ordinal(3, 'es')).toBe('tercero');
    expect(ordinal(11, 'es')).toBe('once');
  });
});

describe('German', () => {
  it.each([
    [1, 'eins'],
    [21, 'einundzwanzig'],
    [101, 'einhunderteins'],
    [1000, 'eintausend'],
    [2026, 'zweitausendsechsundzwanzig'],
    [1_000_000, 'eine Million'],
    [3_000_000, 'drei Millionen'],
    [2_500_000_000, 'zwei Milliarden fünfhundert Millionen'],
  ])('cardinal %i → %s', (n, w) => expect(cardinal(n, 'de')).toBe(w));

  it.each([
    [1, 'erste'],
    [3, 'dritte'],
    [7, 'siebte'],
    [19, 'neunzehnte'],
    [20, 'zwanzigste'],
  ])('ordinal %i → %s', (n, w) => expect(ordinal(n, 'de')).toBe(w));

  it('reads years in hundreds', () => {
    expect(year(1984, 'de')).toBe('neunzehnhundertvierundachtzig');
    expect(year(2026, 'de')).toBe('zweitausendsechsundzwanzig');
  });
});

describe('French', () => {
  it.each([
    [21, 'vingt et un'],
    [70, 'soixante-dix'],
    [71, 'soixante et onze'],
    [80, 'quatre-vingts'],
    [81, 'quatre-vingt-un'],
    [99, 'quatre-vingt-dix-neuf'],
    [200, 'deux cents'],
    [201, 'deux cent un'],
    [1000, 'mille'],
    [80_000, 'quatre-vingt mille'],
    [2_000_000, 'deux millions'],
  ])('cardinal %i → %s', (n, w) => expect(cardinal(n, 'fr')).toBe(w));

  it.each([
    [1, 'premier'],
    [4, 'quatrième'],
    [5, 'cinquième'],
    [9, 'neuvième'],
    [21, 'vingt et unième'],
  ])('ordinal %i → %s', (n, w) => expect(ordinal(n, 'fr')).toBe(w));
});

describe('Portuguese (Brazil)', () => {
  it.each([
    [16, 'dezesseis'],
    [100, 'cem'],
    [123, 'cento e vinte e três'],
    [1200, 'mil e duzentos'],
    [1250, 'mil duzentos e cinquenta'],
    [2001, 'dois mil e um'],
    [1_000_000, 'um milhão'],
    [2_000_000, 'dois milhões'],
  ])('cardinal %i → %s', (n, w) => expect(cardinal(n, 'pt')).toBe(w));
});

describe('Italian', () => {
  it.each([
    [21, 'ventuno'],
    [23, 'ventitré'],
    [28, 'ventotto'],
    [101, 'centouno'],
    [108, 'centotto'],
    [1000, 'mille'],
    [2000, 'duemila'],
    [1_000_000, 'un milione'],
  ])('cardinal %i → %s', (n, w) => expect(cardinal(n, 'it')).toBe(w));

  it.each([
    [3, 'terzo'],
    [11, 'undicesimo'],
    [20, 'ventesimo'],
    [23, 'ventitreesimo'],
  ])('ordinal %i → %s', (n, w) => expect(ordinal(n, 'it')).toBe(w));
});

describe('fallbacks', () => {
  it('keeps digits for unsupported languages and values', () => {
    expect(numberLang('ja')).toBeUndefined();
    expect(numberLang('pt-BR')).toBe('pt');
    expect(cardinal(1.5, 'en')).toBe('1.5');
    expect(cardinal(1e18, 'en')).toBe('1000000000000000000');
    expect(ordinal(0, 'en')).toBe('0');
  });
});
