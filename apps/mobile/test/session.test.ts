import { parsePlainText, prepareDocument } from '@lamplight/core';
import { describe, expect, it } from 'vitest';
import type { Quality } from '../modules/lamplight-engine/src/types';
import { createDocument, getItem, saveContent, setFinished, updateSettings } from '../src/data/library';
import { getPosition, savePosition } from '../src/data/userdata';
import {
  changeQuality,
  changeVoice,
  planSession,
  startDocument,
  trackPosition,
  type SessionSettings,
} from '../src/player/session';
import { createPlayerStore, IDLE } from '../src/player/store';
import { testDb } from './nodeDb';

const SETTINGS: SessionSettings = {
  castMode: 'full',
  quality: 'auto',
  defaultSpeed: 1.25,
  voices: {},
  speakUrls: true,
  rewindOnResume: true,
  expressive: true,
  breaths: true,
  voiceProcessing: false,
};

const TEXT = [
  'Chapter One',
  'The lamp was lit. She read aloud. See https://example.com for more.',
  'Chapter Two',
  '“Who is there?” asked Anna. Nobody answered.',
].join('\n\n');

function seed() {
  const db = testDb();
  const id = createDocument(db, { kind: 'book', title: 'Lamp', source: 'file' });
  saveContent(db, id, prepareDocument(parsePlainText(TEXT, 'Lamp', 'book')));
  return { db, id };
}

describe('planSession', () => {
  it('builds a contiguous queue with chapters and starts at the beginning', () => {
    const { db, id } = seed();
    const plan = planSession(db, id, SETTINGS);
    expect(plan.queue.segments.map((s) => s.i)).toEqual(plan.queue.segments.map((_, k) => k));
    expect(plan.queue.chapterTitles).toEqual(['Chapter One', 'Chapter Two']);
    expect(plan).toMatchObject({ startIndex: 0, startMs: 0, speed: 1.25, quality: 'auto' });
    expect(plan.queue.segments[0]?.voice).toBe('F1');
  });

  it('speaks links when the listener wants them, and skips them otherwise', () => {
    const { db, id } = seed();
    const spoken = planSession(db, id, SETTINGS)
      .queue.segments.map((s) => s.text)
      .join(' ');
    const skipped = planSession(db, id, { ...SETTINGS, speakUrls: false })
      .queue.segments.map((s) => s.text)
      .join(' ');
    expect(spoken).toMatch(/link/i);
    expect(skipped).not.toMatch(/example|link/i);
  });

  it('resumes at the saved sentence, from its start unless rewinding is off', () => {
    const { db, id } = seed();
    savePosition(db, id, { sentenceOrd: 3, offsetMs: 900, progress: 0.5 });
    expect(planSession(db, id, SETTINGS)).toMatchObject({ startIndex: 3, startMs: 0 });
    expect(planSession(db, id, { ...SETTINGS, rewindOnResume: false })).toMatchObject({
      startIndex: 3,
      startMs: 900,
    });
  });

  it('starts a finished item over', () => {
    const { db, id } = seed();
    savePosition(db, id, { sentenceOrd: 3, offsetMs: 900, progress: 0.5 });
    setFinished(db, id, true);
    expect(planSession(db, id, SETTINGS)).toMatchObject({ startIndex: 0, startMs: 0 });
  });

  it('lets the document override voice, speed and quality', () => {
    const { db, id } = seed();
    updateSettings(db, id, { voice: 'M2', speed: 0.8, quality: 'studioPlus' });
    const plan = planSession(db, id, { ...SETTINGS, voices: { en: 'F3' } });
    expect(plan.queue.segments[0]?.voice).toBe('M2');
    expect(plan).toMatchObject({ speed: 0.8, quality: 'studioPlus' });
  });

  it('uses the default voice for the document language', () => {
    const { db, id } = seed();
    expect(planSession(db, id, { ...SETTINGS, voices: { en: 'F3' } }).queue.segments[0]?.voice).toBe('F3');
  });

  it('refuses a document that is not ready', () => {
    const db = testDb();
    const id = createDocument(db, { kind: 'book', title: 'x', source: 'file' });
    expect(() => planSession(db, id, SETTINGS)).toThrow(/not ready/);
  });
});

describe('startDocument', () => {
  it('writes the queue, loads it, marks the item opened and plays', async () => {
    const { db, id } = seed();
    const store = createPlayerStore();
    const calls: string[] = [];
    const engine = {
      loadQueue: (path: string, i: number, ms: number, speed: number, q: Quality) => {
        calls.push(`load ${path} ${i} ${ms} ${speed} ${q}`);
        return Promise.resolve();
      },
      play: () => {
        calls.push('play');
        return Promise.resolve();
      },
    };
    let written = '';
    await startDocument(
      {
        db,
        store,
        engine,
        writeQueue: (docId, json) => {
          written = json;
          return Promise.resolve(`/q/${docId}.json`);
        },
        now: () => 7_000,
      },
      id,
      SETTINGS,
    );
    expect(calls).toEqual([`load /q/${id}.json 0 0 1.25 auto`, 'play']);
    expect(JSON.parse(written).docId).toBe(id);
    expect(store.getState().queue?.docId).toBe(id);
    expect(getItem(db, id)?.openedAt).toBe(7_000);
  });
});

describe('trackPosition', () => {
  it('saves on each new sentence and on pause, adding the time listened', () => {
    const { db, id } = seed();
    const store = createPlayerStore();
    store.getState().setQueue(planSession(db, id, SETTINGS).queue);
    let t = 0;
    const stop = trackPosition(db, store, () => t);
    const s = store.getState();
    s.onState({ ...IDLE, docId: id, playing: true }, t);
    t = 4_000;
    s.onSentence({ index: 1, durationMs: 3_000 }, t);
    expect(getPosition(db, id)).toMatchObject({ sentenceOrd: 1, offsetMs: 0, listenedMs: 4_000 });
    t = 5_500;
    s.onProgress({ index: 1, positionMs: 1_500 }, t);
    s.onState({ ...IDLE, docId: id, playing: false, index: 1, positionMs: 1_500 }, t);
    expect(getPosition(db, id)).toMatchObject({ sentenceOrd: 1, offsetMs: 1_500, listenedMs: 5_500 });
    expect(getPosition(db, id)?.progress).toBeGreaterThan(0);
    stop();
  });
});

describe('changing voice and quality while playing', () => {
  it('saves the voice and re-queues only the sentences after the current one', async () => {
    const { db, id } = seed();
    const store = createPlayerStore();
    store.getState().setQueue(planSession(db, id, SETTINGS).queue);
    const sent: string[] = [];
    const engine = {
      updateSegments: (json: string) => {
        sent.push(json);
        return Promise.resolve();
      },
      setQuality: () => Promise.resolve(),
    };
    await changeVoice({ db, store, engine }, id, 'M2', SETTINGS, 1);
    expect(getItem(db, id)?.settings.voice).toBe('M2');
    const update = JSON.parse(sent[0] ?? '{}') as {
      docId: string;
      segments: { i: number; voice: string; kind: string }[];
    };
    expect(update.docId).toBe(id);
    expect(update.segments.every((s) => s.i > 1)).toBe(true);
    expect(update.segments.filter((s) => s.kind !== 'dialogue').every((s) => s.voice === 'M2')).toBe(true);
    expect(store.getState().queue?.segments[0]?.voice).toBe('M2');
  });

  it('sends nothing to re-queue at the last sentence', async () => {
    const { db, id } = seed();
    const store = createPlayerStore();
    const calls: string[] = [];
    const engine = {
      updateSegments: (j: string) => (calls.push(j), Promise.resolve()),
      setQuality: () => Promise.resolve(),
    };
    const last = planSession(db, id, SETTINGS).queue.segments.length - 1;
    await changeVoice({ db, store, engine }, id, 'F3', SETTINGS, last);
    expect(calls).toEqual([]);
  });

  it('saves the quality and tells the engine', async () => {
    const { db, id } = seed();
    const set: string[] = [];
    await changeQuality(
      {
        db,
        engine: {
          updateSegments: () => Promise.resolve(),
          setQuality: (q) => (set.push(q), Promise.resolve()),
        },
      },
      id,
      'studioPlus',
    );
    expect(getItem(db, id)?.settings.quality).toBe('studioPlus');
    expect(set).toEqual(['studioPlus']);
  });
});
