import { describe, expect, it } from 'vitest';
import { analyseCast } from '../src/cast/attribute';
import { findDialogue } from '../src/cast/dialogue';
import { assignVoices, NAMED_VOICE_CONFIDENCE, voiceFor, type VoiceTraits } from '../src/cast/voices';

const spoken = (text: string, lang = 'en') => findDialogue(text, lang).map((s) => text.slice(s.start, s.end));

describe('findDialogue', () => {
  it('finds curly, straight and guillemet quotes', () => {
    expect(spoken('“Come in,” she said. “The lamp is lit.”')).toEqual(['“Come in,”', '“The lamp is lit.”']);
    expect(spoken('"Who is there?" he asked.')).toEqual(['"Who is there?"']);
    expect(spoken('« Entrez », dit-elle.', 'fr')).toEqual(['« Entrez »']);
    expect(spoken('„Komm herein“, sagte sie.', 'de')).toEqual(['„Komm herein“']);
  });

  it('handles British single quotes without tripping on apostrophes', () => {
    expect(spoken('‘It’s late,’ said Tom. ‘Don’t wait.’')).toEqual(['‘It’s late,’', '‘Don’t wait.’']);
  });

  it('handles em-dash dialogue with an inciso', () => {
    expect(spoken('—Hola —dijo Juan—. ¿Qué tal?', 'es')).toEqual(['—Hola ', '¿Qué tal?']);
    expect(spoken('—Bonjour, dit-il.', 'fr')).toEqual(['—Bonjour, dit-il.']);
    expect(spoken('—Not dialogue in English.', 'en')).toEqual([]);
  });

  it('ignores scare quotes and titles', () => {
    expect(spoken('She called it her “lamp hour” every night.')).toEqual([]);
    expect(spoken('He read “Ulysses” twice.')).toEqual([]);
  });
});

describe('analyseCast', () => {
  const chapter = [
    'Elizabeth closed the book and looked up at her sister.',
    '“You are late,” said Elizabeth.',
    '“I was reading,” Jane replied. “The lamp went out twice.”',
    '“Twice?”',
    '“Twice.”',
    'Mr. Bennet came in with the newspaper.',
    '“Girls, the post has come,” he said.',
    '“Is there a letter for me?” she asked.',
  ];

  it('attributes named tags, paragraph carry-over, alternation and pronouns', () => {
    const { characters, attributions } = analyseCast(chapter);
    const who = attributions.map((a) => [a.block, a.speaker ?? null]);
    expect(who).toEqual([
      [1, 'elizabeth'],
      [2, 'jane'],
      [2, 'jane'],
      [3, 'elizabeth'],
      [4, 'jane'],
      [6, 'bennet-m'],
      [7, 'jane'], // "she" is ambiguous (two women): a guess, held below the named-voice threshold
    ]);
    expect(attributions[6]?.confidence).toBeLessThan(NAMED_VOICE_CONFIDENCE);
    const names = characters.map((c) => [c.id, c.name, c.gender ?? null]);
    expect(names).toContainEqual(['bennet-m', 'Mr. Bennet', 'm']);
    expect(characters[0]?.id).toBe('jane'); // three lines to Elizabeth's two
  });

  it('resolves pronouns when gender evidence is clear', () => {
    const text = [
      'Mrs. Hale lit the lamp.',
      '“It is cold tonight,” said Mrs. Hale.',
      'Captain Moor stood by the door.',
      '“Then close the window,” she said.',
    ];
    const { attributions } = analyseCast(text);
    expect(attributions.map((a) => a.speaker)).toEqual(['hale-f', 'hale-f']);
    expect(attributions[1]?.confidence).toBeGreaterThanOrEqual(NAMED_VOICE_CONFIDENCE);
  });

  it('attributes first-person narrators', () => {
    const { characters, attributions } = analyseCast(['“Wait,” I said.']);
    expect(attributions[0]?.speaker).toBe('narrator-i');
    expect(characters[0]?.name).toBe('I (narrator)');
  });

  it('works in Spanish with em-dash tags', () => {
    const { attributions } = analyseCast(['—Hola —dijo Juan—. ¿Qué tal?'], 'es');
    expect(attributions.map((a) => a.speaker)).toEqual(['juan', 'juan']);
  });

  it('never invents speakers from capitalised sentence starters', () => {
    const { characters } = analyseCast(['“Run,” Then the lamp fell.']);
    expect(characters).toEqual([]);
  });
});

describe('assignVoices', () => {
  const catalog: VoiceTraits[] = [
    { id: 'F1', gender: 'f', pitch: 0.6 },
    { id: 'F2', gender: 'f', pitch: 0.8 },
    { id: 'F3', gender: 'f', pitch: 0.4 },
    { id: 'M1', gender: 'm', pitch: 0.3 },
    { id: 'M2', gender: 'm', pitch: 0.1 },
  ];
  const chars = [
    { id: 'elizabeth', name: 'Elizabeth', aliases: [], gender: 'f' as const, lines: 30 },
    { id: 'darcy', name: 'Mr. Darcy', aliases: [], gender: 'm' as const, lines: 20 },
    { id: 'jane', name: 'Jane', aliases: [], gender: 'f' as const, lines: 10 },
    { id: 'kitty', name: 'Kitty', aliases: [], gender: 'f' as const, lines: 5 },
    { id: 'kid', name: 'Kid', aliases: [], lines: 1 },
  ];

  it('contrasts the dialogue voice and gives characters distinct, gender-matched voices', () => {
    const a = assignVoices(chars, 'F1', catalog);
    expect(a.narrator).toBe('F1');
    expect(a.dialogue).toBe('M2');
    expect(a.byCharacter.elizabeth?.startsWith('F')).toBe(true);
    expect(a.byCharacter.elizabeth).not.toBe('F1');
    expect(a.byCharacter.darcy?.startsWith('M')).toBe(true);
    expect(new Set([a.byCharacter.elizabeth, a.byCharacter.jane]).size).toBe(2);
    expect(Object.values(a.byCharacter)).not.toContain('F1');
  });

  it('tells characters on the same or a near-identical voice apart by register, and keeps each one steady', () => {
    const many = [
      ...chars,
      { id: 'lydia', name: 'Lydia', aliases: [], gender: 'f' as const, lines: 4 },
      { id: 'mary', name: 'Mary', aliases: [], gender: 'f' as const, lines: 3 },
    ];
    const a = assignVoices(many, 'F1', catalog);
    const sound = (id: string) =>
      `${a.byCharacter[id]}/${a.styleByCharacter?.[id]?.pitch ?? 0}/${a.rateByCharacter?.[id] ?? 1}`;
    const women = ['elizabeth', 'jane', 'kitty', 'lydia', 'mary'];
    expect(new Set(women.map(sound)).size).toBe(women.length);
    expect(assignVoices(many, 'F1', catalog)).toEqual(a);
  });

  it('styles the old, children, the gentle and the fiery', () => {
    const cast = [
      { id: 'grandpa', name: 'Grandpa', aliases: [], gender: 'm' as const, lines: 9, age: 'old' as const },
      { id: 'tim', name: 'Tim', aliases: [], gender: 'm' as const, lines: 8, age: 'child' as const },
      {
        id: 'rose',
        name: 'Rose',
        aliases: [],
        gender: 'f' as const,
        lines: 7,
        temperament: 'gentle' as const,
      },
      {
        id: 'kate',
        name: 'Kate',
        aliases: [],
        gender: 'f' as const,
        lines: 6,
        temperament: 'fiery' as const,
      },
    ];
    const s = assignVoices(cast, 'F1', catalog).styleByCharacter ?? {};
    expect(s.grandpa).toMatchObject({ ending: 'trail' });
    expect(s.grandpa?.pitch).toBeLessThan(0);
    expect(s.grandpa?.pause).toBeGreaterThan(1);
    expect(s.tim?.pitch).toBeGreaterThan(1);
    expect(s.rose?.gainDb).toBeLessThan(0);
    expect(s.kate).toMatchObject({ ending: 'clip' });
    expect(s.kate?.gainDb).toBeGreaterThan(0);
  });

  it('applies overrides', () => {
    const a = assignVoices(chars, 'F1', catalog, { darcy: 'M1', __dialogue: 'F3' });
    expect(a.byCharacter.darcy).toBe('M1');
    expect(a.dialogue).toBe('F3');
  });

  it('picks the voice for a sentence by mode and confidence', () => {
    const a = assignVoices(chars, 'F1', catalog, { elizabeth: 'F2' });
    expect(voiceFor(a, 'off', 'dialogue', 'elizabeth')).toBe('F1');
    expect(voiceFor(a, 'dialogue', 'dialogue', 'elizabeth')).toBe(a.dialogue);
    expect(voiceFor(a, 'full', 'dialogue', 'elizabeth', 0.95)).toBe('F2');
    expect(voiceFor(a, 'full', 'dialogue', 'elizabeth', 0.6)).toBe(a.dialogue);
    expect(voiceFor(a, 'full', 'narration', 'elizabeth')).toBe('F1');
  });
});
