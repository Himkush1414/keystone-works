import { describe, expect, it } from 'vitest';
import { normalize, romanToInt, type DictionaryRule } from '../src/text/normalize';

const say = (text: string, lang = 'en', opts = {}) =>
  normalize(text, { start: 0, end: text.length }, lang, opts).text;

describe('English', () => {
  it('reads plain numbers and years', () => {
    expect(say('She bought 3 lamps in 1984.')).toBe('She bought three lamps in nineteen eighty-four.');
    expect(say('The book has 1,250 pages.')).toBe('The book has one thousand two hundred fifty pages.');
    expect(say('Pi is about 3.14.')).toBe('Pi is about three point one four.');
  });

  it('reads money, percentages and units', () => {
    expect(say('It costs $4.50 today.')).toBe('It costs four dollars and fifty cents today.');
    expect(say('Only $1 left.')).toBe('Only one dollar left.');
    expect(say('Prices rose 12% last year.')).toBe('Prices rose twelve percent last year.');
    expect(say('We drove 5 km and lost 1 kg.')).toBe('We drove five kilometers and lost one kilogram.');
    expect(say('It was 20 °C outside.')).toBe('It was twenty degrees Celsius outside.');
  });

  it('reads times', () => {
    expect(say('Meet at 3:30 pm.')).toBe('Meet at three thirty p m.');
    expect(say('The train left at 9:05.')).toBe('The train left at nine oh five.');
    expect(say('Doors open at 7:00.')).toBe("Doors open at seven o'clock.");
  });

  it('reads dates and ordinals', () => {
    expect(say('Born 2026-10-20 in Leeds.')).toBe('Born October twentieth, twenty twenty-six in Leeds.');
    expect(say('On October 20, 2026 it rained.')).toBe('On October twentieth, twenty twenty-six it rained.');
    expect(say('She came 21st out of 40.')).toBe('She came twenty-first out of forty.');
  });

  it('reads year ranges', () => {
    expect(say('The war of 1914–1918 changed everything.')).toBe(
      'The war of nineteen fourteen to nineteen eighteen changed everything.',
    );
    expect(say('From 1990-95 nothing happened.')).toBe(
      'From nineteen ninety to nineteen ninety-five nothing happened.',
    );
  });

  it('expands abbreviations by context', () => {
    expect(say('Mr. Darcy met Dr. Watson.')).toBe('Mister Darcy met Doctor Watson.');
    expect(say('We went to St. Paul on Baker St. today.')).toBe(
      'We went to Saint Paul on Baker Street today.',
    );
    expect(say('See p. 12 and the appendix.')).toBe('See page twelve and the appendix.');
    expect(say('Bring pens, paper, etc.')).toBe('Bring pens, paper, et cetera.');
    expect(say('Fruit, e.g. apples.')).toBe('Fruit, for example apples.');
  });

  it('reads roman numerals in headings and regnal names', () => {
    expect(say('Chapter IV')).toBe('Chapter four');
    expect(say('Henry VIII had six wives.')).toBe('Henry the Eighth had six wives.');
    expect(say('I think I can.')).toBe('I think I can.');
  });

  it('speaks or skips links', () => {
    expect(say('Read https://example.com/a?b=1 now.')).toBe('Read link now.');
    expect(say('Mail me at ana@example.org please.', 'en', { speakUrls: false })).toBe('Mail me at please.');
  });

  it('reads symbols and negative numbers', () => {
    expect(say('Salt & pepper.')).toBe('Salt and pepper.');
    expect(say('2 + 2 = 4')).toBe('two plus two equals four');
    expect(say('It fell to -5 overnight.')).toBe('It fell to minus five overnight.');
    expect(say('Track #3 is best.')).toBe('Track number three is best.');
  });

  it('reads codes with leading zeros digit by digit', () => {
    expect(say('Agent 007 reporting.')).toBe('Agent zero zero seven reporting.');
  });
});

describe('other languages', () => {
  it('Spanish', () => {
    expect(say('Cuesta 4,50 € y el 21% del total.', 'es')).toBe(
      'Cuesta cuatro euros y cincuenta céntimos y el veintiuno por ciento del total.',
    );
    expect(say('La Sra. García vive en el 3º piso.', 'es')).toBe('La señora García vive en el tercer piso.');
    expect(say('Hay 1.200 libros.', 'es')).toBe('Hay mil doscientos libros.');
  });

  it('German', () => {
    expect(say('Das kostet 12,99 € z. B. im Laden.', 'de')).toBe(
      'Das kostet zwölf Euro und neunundneunzig Cent zum Beispiel im Laden.',
    );
    expect(say('Wir treffen uns um 15:30.', 'de')).toBe('Wir treffen uns um fünfzehn Uhr dreißig.');
    expect(say('Am 3. Oktober 1990 war es so.', 'de')).toBe(
      'Am dritten Oktober neunzehnhundertneunzig war es so.',
    );
  });

  it('French', () => {
    expect(say('Il est 15 h 30 et il fait 21 °C.', 'fr')).toBe(
      'Il est quinze heures trente et il fait vingt et un degrés.',
    );
    expect(say('M. Dupont arrive le 1er mai.', 'fr')).toBe('Monsieur Dupont arrive le premier mai.');
    expect(say('Il y a 1 250 000 habitants.', 'fr')).toBe(
      'Il y a un million deux cent cinquante mille habitants.',
    );
  });

  it('Portuguese', () => {
    expect(say('Custa R$ 10,50 hoje.', 'pt-BR')).toBe('Custa dez reais e cinquenta centavos hoje.');
  });

  it('Italian', () => {
    expect(say('Il Sig. Rossi ha 23 anni.', 'it')).toBe('Il signor Rossi ha ventitré anni.');
  });

  it('keeps digits for languages without number rules', () => {
    expect(say('東京 2026 年', 'ja')).toBe('東京 2026 年');
  });
});

describe('skips and dictionary', () => {
  it('drops skipped spans and tidies the space around them', () => {
    const text = 'Lamps glow [12] at night.';
    const s = normalize(text, { start: 0, end: text.length }, 'en', {
      skips: [{ start: 11, end: 15, reason: 'citation' }],
    });
    expect(s.text).toBe('Lamps glow at night.');
  });

  it('applies dictionary entries first, longest match first, respecting whole words and case', () => {
    const dictionary: DictionaryRule[] = [
      { match: 'Hermione', sayAs: 'her-MY-oh-nee', wholeWord: true, caseSensitive: false },
      { match: 'Dr.', sayAs: 'Drive', wholeWord: false, caseSensitive: true },
      { match: 'cat', sayAs: 'feline', wholeWord: true, caseSensitive: false },
    ];
    expect(say('hermione lives on Elm Dr. with a cat and a category.', 'en', { dictionary })).toBe(
      'her-MY-oh-nee lives on Elm Drive with a feline and a category.',
    );
  });

  it('pieces cover the range contiguously and map back to display text', () => {
    const text = 'In 1984 Mr. Lee paid $3.';
    const { pieces } = normalize(text, { start: 0, end: text.length }, 'en');
    expect(pieces[0]?.start).toBe(0);
    expect(pieces[pieces.length - 1]?.end).toBe(text.length);
    for (let i = 1; i < pieces.length; i++) expect(pieces[i]?.start).toBe(pieces[i - 1]?.end);
    const year = pieces.find((p) => p.spoken === 'nineteen eighty-four');
    expect(year && text.slice(year.start, year.end)).toBe('1984');
  });

  it('respects a sub-range of the block', () => {
    const text = 'First 1. Second 2.';
    expect(normalize(text, { start: 9, end: 18 }, 'en').text).toBe('Second two.');
  });
});

describe('romanToInt', () => {
  it('parses valid numerals and rejects invalid ones', () => {
    expect(romanToInt('XIV')).toBe(14);
    expect(romanToInt('MCMXC')).toBe(1990);
    expect(romanToInt('IIII')).toBeNull();
    expect(romanToInt('')).toBeNull();
  });
});
