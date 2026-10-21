import { parsePlainText, prepareDocument } from '@lamplight/core';
import { describe, expect, it } from 'vitest';
import { loadContent } from '../src/data/content';
import { createDocument, saveContent } from '../src/data/library';
import {
  changeCharacterVoice,
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
