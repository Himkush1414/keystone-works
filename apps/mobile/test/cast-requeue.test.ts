import { parsePlainText, prepareDocument } from '@lamplight/core';
import { describe, expect, it } from 'vitest';
import { loadContent } from '../src/data/content';
import { createDocument, saveContent } from '../src/data/library';
import {
  changeCharacterVoice,
  correctSpeakerAndRequeue,
  mergeCharactersAndRequeue,
  planSession,
  type SessionSettings,
} from '../src/player/session';
import { createPlayerStore } from '../src/player/store';
import { testDb } from './nodeDb';

const SETTINGS: SessionSettings = {
  castMode: 'full',
  quality: 'auto',
  defaultSpeed: 1,
  voices: {},
  speakUrls: true,
  rewindOnResume: true,
  expressive: true,
  breaths: true,
  voiceProcessing: false,
};

const STORY = [
  'Chapter One',
  '“Where are you going?” asked Anna.',
  '“To the harbour,” said Tom.',
  '“Wait for me,” Anna said. “I want to see the boats.”',
  '“Then hurry,” Tom said.',
].join('\n\n');

function seed() {
  const db = testDb();
  const id = createDocument(db, { kind: 'book', title: 'Harbour', source: 'paste' });
  saveContent(db, id, prepareDocument(parsePlainText(STORY, 'Harbour', 'book')));
  const sent: string[] = [];
  const deps = {
    db,
    store: createPlayerStore(),
    engine: {
      updateSegments: (json: string) => (sent.push(json), Promise.resolve()),
      setQuality: () => Promise.resolve(),
    },
  };
  return { db, id, deps, sent };
}

const characterNamed = (db: ReturnType<typeof testDb>, id: string, name: string) =>
  loadContent(db, id).characters.find((c) => c.name === name);

describe('Cast changes while playing', () => {
  it('finds the speakers in the story', () => {
    const { db, id } = seed();
    expect(
      loadContent(db, id)
        .characters.map((c) => c.name)
        .sort(),
    ).toEqual(['Anna', 'Tom']);
  });

  it('gives a character the chosen voice from the next sentence on', async () => {
    const { db, id, deps, sent } = seed();
    const anna = characterNamed(db, id, 'Anna');
    await changeCharacterVoice(deps, id, anna?.id ?? '', 'M5', SETTINGS, 0);
    expect(characterNamed(db, id, 'Anna')?.voiceId).toBe('M5');
    const update = JSON.parse(sent[0] ?? '{}') as { segments: { i: number; voice: string; kind: string }[] };
    const content = loadContent(db, id);
    const annaLines = update.segments.filter((s) => content.sentences[s.i]?.speaker === anna?.id);
    expect(annaLines.length).toBeGreaterThan(0);
    expect(annaLines.every((s) => s.voice === 'M5')).toBe(true);
    expect(update.segments.every((s) => s.i > 0)).toBe(true);
  });

  it('merges two names into one character, who then shares one voice', async () => {
    const { db, id, deps } = seed();
    const anna = characterNamed(db, id, 'Anna');
    const tom = characterNamed(db, id, 'Tom');
    await mergeCharactersAndRequeue(deps, id, tom?.id ?? '', anna?.id ?? '', SETTINGS, 0);
    const content = loadContent(db, id);
    expect(content.characters.map((c) => c.name)).toEqual(['Anna']);
    const plan = planSession(db, id, SETTINGS);
    const dialogueVoices = new Set(
      plan.queue.segments.filter((s) => content.sentences[s.i]?.speaker === anna?.id).map((s) => s.voice),
    );
    expect(dialogueVoices.size).toBe(1);
  });
});

describe('Correcting a speaker while playing', () => {
  it('re-voices the corrected line from the next sentence on, and the queue knows it changed', async () => {
    const { db, id, deps, sent } = seed();
    const anna = characterNamed(db, id, 'Anna');
    const content = loadContent(db, id);
    const ord = content.sentences.findIndex((s) =>
      content.blocks[s.block]?.text.slice(s.start, s.end).includes('Then hurry'),
    );
    const before = planSession(db, id, SETTINGS).queue.key;
    expect(await correctSpeakerAndRequeue(deps, id, ord, anna?.id ?? '', SETTINGS, 0)).toBe(true);
    expect(loadContent(db, id).sentences[ord]?.speaker).toBe(anna?.id);
    const after = planSession(db, id, SETTINGS);
    expect(after.queue.key).not.toBe(before);
    const annaVoice = after.queue.segments.find(
      (s) => s.i !== ord && loadContent(db, id).sentences[s.i]?.speaker === anna?.id,
    )?.voice;
    expect(after.queue.segments.find((s) => s.i === ord)?.voice).toBe(annaVoice);
    expect(sent.length).toBeGreaterThan(0);
  });
});

describe('Casting holds for the whole book', () => {
  const VILLAGE = [
    'Chapter One',
    'Old Mr. Grey sat by the fire.',
    '“Who is there?” asked Mr. Grey.',
    '“Only me, Grandpa,” said little Sam.',
    '“Come in, then,” Mr. Grey said.',
    '“Can I stay?” asked Sam.',
    '“Of course,” said Mrs. Hall from the door.',
  ].join('\n\n');

  function village() {
    const db = testDb();
    const id = createDocument(db, { kind: 'book', title: 'Village', source: 'paste' });
    saveContent(db, id, prepareDocument(parsePlainText(VILLAGE, 'Village', 'book')));
    return { db, id };
  }

  it('stores who each character is and gives them a pace that suits them', () => {
    const { db, id } = village();
    const grey = characterNamed(db, id, 'Mr. Grey');
    const sam = characterNamed(db, id, 'Sam');
    expect(grey?.age).toBe('old');
    expect(sam?.age).toBe('child');
    const plan = planSession(db, id, SETTINGS);
    const content = loadContent(db, id);
    const rateOf = (speaker: string | undefined) =>
      plan.queue.segments.find((s) => content.sentences[s.i]?.speaker === speaker)?.rate;
    expect(rateOf(grey?.id)).toBeLessThan(1);
    expect(rateOf(sam?.id)).toBeGreaterThan(1);
  });

  it('writes the automatic voices down on first play and keeps them after a merge', async () => {
    const { db, id } = village();
    const first = planSession(db, id, SETTINGS);
    const saved = Object.fromEntries(loadContent(db, id).characters.map((c) => [c.id, c.autoVoiceId]));
    expect(Object.values(saved).every((v) => v !== null)).toBe(true);

    const deps = {
      db,
      store: createPlayerStore(),
      engine: { updateSegments: () => Promise.resolve(), setQuality: () => Promise.resolve() },
    };
    const hall = characterNamed(db, id, 'Mrs. Hall');
    const sam = characterNamed(db, id, 'Sam');
    // Merging moves lines (and the order Cast would cast in); the others keep their voices.
    await mergeCharactersAndRequeue(deps, id, sam?.id ?? '', hall?.id ?? '', SETTINGS, 0);
    const after = planSession(db, id, SETTINGS);
    const voiceOf = (plan: typeof first, speaker: string | undefined) =>
      plan.queue.segments.find((s) => loadContent(db, id).sentences[s.i]?.speaker === speaker)?.voice;
    const grey = characterNamed(db, id, 'Mr. Grey')?.id;
    expect(voiceOf(after, grey)).toBe(voiceOf(first, grey));
    expect(voiceOf(after, hall?.id)).toBe(saved[hall?.id ?? '']);
  });
});
