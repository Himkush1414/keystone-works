import { describe, expect, it } from 'vitest';
import { analyseCast } from '../src/cast/attribute';
import { VOICE_CATALOG } from '../src/cast/catalog';
import { findDialogue } from '../src/cast/dialogue';
import { profileCharacters } from '../src/cast/profile';
import { assignVoices } from '../src/cast/voices';
import type { Character } from '../src/cast/attribute';
import { CAST_CORPUS } from './fixtures/castCorpus';

const profile = (paragraphs: string[], lang = 'en') => {
  const cast = analyseCast(paragraphs, lang);
  const profiles = profileCharacters(paragraphs, cast.characters, cast.attributions, (b) =>
    findDialogue(paragraphs[b] ?? '', lang),
  );
  const byName = (name: string) => {
    const c = cast.characters.find((ch) => ch.aliases.includes(name));
    return c ? profiles[c.id] : undefined;
  };
  return byName;
};

const story = (id: string) => CAST_CORPUS.find((s) => s.id === id)?.text.split('\n\n') ?? [];

describe('profileCharacters', () => {
  it('hears age in how a character is described', () => {
    const p = profile(story('en-harbour'));
    expect(p('Mr. Grey')?.age).toBe('old');
    expect(p('Anna')?.age).toBeUndefined();
  });

  it('reads age from kinship names in Hindi and Hinglish', () => {
    expect(profile(story('hi-bazaar'), 'hi')('दादी')?.age).toBe('old');
    expect(profile(story('hinglish-bazaar'), 'hi')('Dadi')?.age).toBe('old');
  });

  it('notices a child', () => {
    const p = profile(
      [
        'Little Sam ran into the kitchen.',
        '“Can I have a biscuit?” asked Sam.',
        '“After dinner,” said Mrs. Hall.',
      ],
      'en',
    );
    expect(p('Sam')?.age).toBe('child');
  });

  it('calls a character fiery only when shouting is a habit', () => {
    const p = profile(
      [
        '“Get out!” shouted Bruno.',
        '“Please, just listen,” said Clara softly.',
        '“I said get out!” Bruno roared.',
        '“Fine,” Clara whispered.',
        '“And take your things,” Bruno snapped.',
        '“Goodbye,” Clara said gently.',
      ],
      'en',
    );
    expect(p('Bruno')?.temperament).toBe('fiery');
    expect(p('Clara')?.temperament).toBe('gentle');

    const once = profile([
      '“Stop!” shouted Ivan.',
      '“Why?” asked Ivan.',
      '“Fine,” said Ivan.',
      '“Go,” said Ivan.',
    ])('Ivan');
    expect(once?.temperament).toBeUndefined();
  });
});

describe('assignVoices casting', () => {
  const ch = (id: string, extra: Partial<Character> = {}): Character => ({
    id,
    name: id,
    aliases: [id],
    lines: 5,
    ...extra,
  });

  it('gives the old a low register and a child a high one', () => {
    const a = assignVoices(
      [ch('grandpa', { gender: 'm', age: 'old' }), ch('boy', { gender: 'm', age: 'child' })],
      'F1',
      VOICE_CATALOG,
    );
    const pitch = (id: string) => VOICE_CATALOG.find((v) => v.id === a.byCharacter[id])?.pitchHz ?? 0;
    expect(pitch('grandpa')).toBe(
      Math.min(...VOICE_CATALOG.filter((v) => v.gender === 'm').map((v) => v.pitchHz)),
    );
    expect(pitch('boy')).toBe(
      Math.max(...VOICE_CATALOG.filter((v) => v.gender === 'm').map((v) => v.pitchHz)),
    );
    expect(a.rateByCharacter?.['grandpa']).toBeLessThan(1);
    expect(a.rateByCharacter?.['boy']).toBeGreaterThan(1);
  });

  it('paces by temperament and stays within a natural range', () => {
    const a = assignVoices(
      [
        ch('hot', { gender: 'm', temperament: 'fiery', age: 'child' }),
        ch('soft', { gender: 'f', temperament: 'gentle', age: 'old' }),
      ],
      'F1',
      VOICE_CATALOG,
    );
    expect(a.rateByCharacter?.['hot']).toBeGreaterThan(1.05);
    expect(a.rateByCharacter?.['soft']).toBeLessThan(0.9);
    for (const r of Object.values(a.rateByCharacter ?? {})) {
      expect(r).toBeGreaterThanOrEqual(0.86);
      expect(r).toBeLessThanOrEqual(1.12);
    }
  });

  it('tells apart characters who must share a voice by pace', () => {
    const many = Array.from({ length: 6 }, (_, i) => ch(`w${i}`, { gender: 'f' }));
    const a = assignVoices(many, 'F1', VOICE_CATALOG);
    const groups = new Map<string, string[]>();
    for (const c of many)
      groups.set(a.byCharacter[c.id] ?? '', [...(groups.get(a.byCharacter[c.id] ?? '') ?? []), c.id]);
    const shared = [...groups.values()].find((g) => g.length > 1) ?? [];
    expect(shared.length).toBe(2);
    const rates = shared.map((id) => a.rateByCharacter?.[id] ?? 1);
    expect(new Set(rates).size).toBe(2);
  });

  it('keeps saved automatic choices so voices never shift mid-book', () => {
    const before = assignVoices(
      [ch('a', { gender: 'f' }), ch('b', { gender: 'f', lines: 2 })],
      'F1',
      VOICE_CATALOG,
    );
    // b now speaks more (a merge added lines), which would re-order the automatic choice.
    const after = assignVoices(
      [ch('b', { gender: 'f', lines: 20 }), ch('a', { gender: 'f' })],
      'F1',
      VOICE_CATALOG,
      {},
      before.byCharacter,
    );
    expect(after.byCharacter).toEqual(before.byCharacter);
  });

  it('re-casts a saved voice that became the narrator, and lets overrides win', () => {
    const saved = { a: 'F2' };
    const a = assignVoices([ch('a', { gender: 'f' })], 'F2', VOICE_CATALOG, {}, saved);
    expect(a.byCharacter['a']).not.toBe('F2');
    const o = assignVoices([ch('a', { gender: 'f' })], 'F1', VOICE_CATALOG, { a: 'M3' }, saved);
    expect(o.byCharacter['a']).toBe('M3');
  });
});
