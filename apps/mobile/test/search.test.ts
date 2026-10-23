import { parsePlainText, prepareDocument } from '@lamplight/core';
import { describe, expect, it } from 'vitest';
import { sentenceAtBlock } from '../src/data/content';
import { createDocument, saveContent, search } from '../src/data/library';
import { rememberSearch, snippetParts } from '../src/library/search';
import { planSession, type SessionSettings } from '../src/player/session';
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
};

function seed() {
  const db = testDb();
  const id = createDocument(db, { kind: 'book', title: 'Harbour Tales', source: 'paste' });
  const text = [
    'Chapter One',
    'The boats came in. The harbour was quiet.',
    'Chapter Two',
    'A lamp burned late into the night.',
  ];
  saveContent(db, id, prepareDocument(parsePlainText(text.join('\n\n'), 'Harbour Tales', 'book')));
  return { db, id };
}

describe('snippetParts', () => {
  it('separates the matched words from the text around them', () => {
    expect(snippetParts('…the \u0002harbour\u0003 was \u0002quiet\u0003.')).toEqual([
      { text: '…the ', match: false },
      { text: 'harbour', match: true },
      { text: ' was ', match: false },
      { text: 'quiet', match: true },
      { text: '.', match: false },
    ]);
    expect(snippetParts('no match')).toEqual([{ text: 'no match', match: false }]);
  });
});

describe('rememberSearch', () => {
  it('keeps the latest five, newest first, without repeats', () => {
    let recent: string[] = [];
    for (const q of ['lamp', 'harbour', 'Lamp ', 'a', 'b', 'c', 'd']) recent = rememberSearch(recent, q);
    expect(recent).toEqual(['d', 'c', 'b', 'a', 'Lamp']);
    expect(rememberSearch(recent, '   ')).toEqual(recent);
  });
});

describe('search to sentence', () => {
  it('finds a body hit and the sentence it belongs to', () => {
    const { db, id } = seed();
    const hit = search(db, 'lamp').body[0];
    expect(hit?.documentId).toBe(id);
    const at = sentenceAtBlock(db, id, hit?.blockOrd ?? -1);
    expect(at).toBeDefined();
    const plan = planSession(db, id, SETTINGS, at);
    expect(plan.queue.segments[plan.startIndex]?.text).toMatch(/lamp/i);
    expect(plan.startMs).toBe(0);
  });

  it('has no sentence past the end of the document', () => {
    const { db, id } = seed();
    expect(sentenceAtBlock(db, id, 99)).toBeUndefined();
  });
});
