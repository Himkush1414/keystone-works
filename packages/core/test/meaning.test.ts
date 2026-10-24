import { describe, expect, it } from 'vitest';
import {
  answer,
  englishLemmas,
  explain,
  hindiCandidates,
  lookupRequest,
  type LookupRows,
} from '../src/meaning/meaning';

// Rows as the on-device dictionary returns them (abridged from WordNet 3.1 and Wiktionary).
const bank: LookupRows = {
  en: [
    {
      word: 'bank',
      pos: 'n',
      rank: 0,
      gloss: 'sloping land (especially the slope beside a body of water)',
      example: 'they pulled the canoe up on the bank',
      syn: null,
      tagged: 10,
    },
    {
      word: 'bank',
      pos: 'n',
      rank: 1,
      gloss: 'a financial institution that accepts deposits and channels the money into lending activities',
      example: 'he cashed a check at the bank',
      syn: 'depository financial institution|banking concern',
      tagged: 10,
    },
    {
      word: 'bank',
      pos: 'v',
      rank: 0,
      gloss: 'tip laterally',
      example: 'the pilot had to bank the aircraft',
      syn: null,
      tagged: 2,
    },
  ],
  hi: [],
  enHi: [
    { en: 'bank', hi: 'बैंक', rank: 0, gloss: 'bank' },
    { en: 'bank', hi: 'किनारा', rank: 2, gloss: 'shore, bank, edge (of a river or body of water)' },
    { en: 'bank', hi: 'पगार', rank: 13, gloss: 'salary, wages, bank' },
  ],
};

const let_: LookupRows = {
  en: [
    {
      word: 'let',
      pos: 'n',
      rank: 0,
      gloss: 'a brutal terrorist group active in Kashmir',
      syn: 'Lashkar-e-Taiba',
      tagged: 0,
    },
    {
      word: 'let',
      pos: 'v',
      rank: 0,
      gloss: 'make it possible through a specific action or lack of action for something to happen',
      syn: 'allow|permit',
      tagged: 30,
    },
    {
      word: 'let',
      pos: 'v',
      rank: 3,
      gloss: 'grant use or occupation of under a term of contract',
      example: 'We let our house to students',
      syn: 'rent|lease',
      tagged: 30,
    },
  ],
  hi: [],
  enHi: [],
};

describe('lemmas', () => {
  it('finds base forms the way WordNet does, plus irregular ones', () => {
    expect(englishLemmas('fortunes')).toContain('fortune');
    expect(englishLemmas('stopped')).toContain('stop');
    expect(englishLemmas('running')).toContain('run');
    expect(englishLemmas('ladies')).toContain('lady');
    expect(englishLemmas('went')).toContain('go');
  });

  it('guesses Hindi headwords from inflections', () => {
    expect(hindiCandidates('मुस्कुराईं')).toContain('मुस्कुराना');
    expect(hindiCandidates('लड़कियों')).toContain('लड़की');
  });

  it('asks for Hindi when the word is Devanagari or romanised Hindi', () => {
    const hi = lookupRequest('“पानी,”');
    expect(hi?.en).toEqual([]);
    expect(hi?.hi[0]).toBe('पानी');
    expect(lookupRequest('Dost')?.hi).toEqual(['दोस्त']);
    expect(lookupRequest('…')).toBeNull();
  });
});

describe('explain', () => {
  it('picks the sense that fits the sentence', () => {
    const river = explain('bank', 'They sat on the bank of the river and watched the water.', bank);
    expect(river?.definition).toMatch(/sloping land/);
    const money = explain('bank', 'She went to the bank to deposit the money.', bank);
    expect(money?.definition).toMatch(/financial institution/);
    expect(money?.hindi).toEqual(['बैंक']);
  });

  it('reads the part of speech from the words before it', () => {
    expect(explain('let', 'Have you heard that Netherfield Park is let at last?', let_)?.pos).toBe('verb');
  });

  it('prefers what the dictionary says a Hindi form belongs to', () => {
    const rows: LookupRows = {
      en: [],
      hi: [
        { word: 'गली', pos: 'noun', rank: 0, gloss: 'street, lane', roman: 'galī' },
        { word: 'गलना', pos: 'verb', rank: 0, gloss: 'to melt, dissolve', roman: 'galnā' },
      ],
      enHi: [],
      hiForms: [{ form: 'गलियों', word: 'गली' }],
    };
    const m = explain('गलियों', 'गाँव की गलियों में सन्नाटा था।', rows);
    expect(m).toMatchObject({ lemma: 'गली', lang: 'hi', definition: 'street, lane', roman: 'galī' });
  });

  it('returns null for a word the dictionary does not know', () => {
    expect(explain('Netherfield', 'Netherfield Park is let.', { en: [], hi: [], enHi: [] })).toBeNull();
  });
});

describe('answer', () => {
  const m = explain('bank', 'She went to the bank to deposit the money.', bank);
  it('answers in English with the Hindi alongside', () => {
    const a = answer(m as NonNullable<typeof m>, 'en');
    expect(a.headline).toMatch(/^A financial institution/);
    expect(a.detail).toBe('बैंक');
    expect(a.speak.lang).toBe('en');
  });

  it('answers in Hindi with the English definition as detail', () => {
    const a = answer(m as NonNullable<typeof m>, 'hi');
    expect(a.headline).toBe('बैंक');
    expect(a.speak).toEqual({ text: 'bank: बैंक।', lang: 'hi' });
  });
});
