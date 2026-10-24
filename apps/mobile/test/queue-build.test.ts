import { buildQueue, parsePlainText, prepareDocument } from '@lamplight/core';
import { describe, expect, it } from 'vitest';
import type { QueueFile } from '../modules/lamplight-engine/src/types';
import { createDocument, saveContent, updateSettings } from '../src/data/library';
import {
  buildRange,
  changeVoice,
  planSession,
  prepareQueue,
  QUEUE_CHUNK,
  QUEUE_WINDOW,
  queueContext,
  startDocument,
  type SessionSettings,
} from '../src/player/session';
import { createPlayerStore } from '../src/player/store';
import { testDb } from './nodeDb';

const SETTINGS: SessionSettings = {
  castMode: 'full',
  quality: 'auto',
  defaultSpeed: 1,
  voices: {},
  speakUrls: false,
  rewindOnResume: true,
  expressive: true,
  breaths: true,
};

/** A book long enough for several chunks, with dialogue so pauses, breaths and voices vary. */
function bookText(chapters: number): string {
  const parts: string[] = [];
  for (let c = 1; c <= chapters; c++) {
    parts.push(`Chapter ${c}`);
    for (let p = 0; p < 30; p++) {
      parts.push(
        `“Is it ${c}.${p} already?” asked Anna, looking up. “It is,” said Tom quietly. ` +
          `The rain kept on for ${p + 2} hours — nobody moved. She sighed. Then the lamp went out!`,
      );
    }
  }
  return parts.join('\n\n');
}

function seed(chapters = 6) {
  const db = testDb();
  const id = createDocument(db, { kind: 'book', title: 'Long', source: 'file' });
  saveContent(db, id, prepareDocument(parsePlainText(bookText(chapters), 'Long', 'book')));
  return { db, id };
}

function fakeDevice() {
  const files = new Map<string, string>();
  const calls: string[] = [];
  const filled: number[] = [];
  const store = createPlayerStore();
  return {
    files,
    calls,
    filled,
    store,
    deps: (db: ReturnType<typeof testDb>) => ({
      db,
      store,
      engine: {
        loadQueue: async (path: string, start: number) => void calls.push(`load ${path}@${start}`),
        play: async () => void calls.push('play'),
        fillSegments: async (json: string) => {
          const q = JSON.parse(json) as QueueFile;
          filled.push(...q.segments.map((s) => s.i));
        },
      },
      writeQueue: async (docId: string, json: string) => {
        files.set(docId, json);
        return `/cache/${docId}.json`;
      },
      readQueue: async (docId: string) => files.get(docId) ?? null,
      yieldToUi: async () => undefined,
    }),
  };
}

describe('building a queue in chunks', () => {
  it('gives exactly the segments of a whole-book build, chunk boundaries included', () => {
    const { db, id } = seed();
    const ctx = queueContext(db, id, SETTINGS);
    const whole = buildQueue({ ...ctx.content, language: ctx.item.language }, ctx.options);
    expect(whole.length).toBeGreaterThan(QUEUE_CHUNK * 2);
    const chunked = [];
    for (let a = 0; a < whole.length; a += 97) chunked.push(...buildRange(ctx, a, a + 97));
    expect(chunked).toEqual(whole);
  });
});

describe('opening a long book', () => {
  it('starts narrating after building only the sentences around the start, then fills in the rest', async () => {
    const { db, id } = seed();
    const device = fakeDevice();
    const at = 250;
    const plan = await startDocument(device.deps(db), id, SETTINGS, { at });
    const total = planSession(db, id, SETTINGS).queue;

    // The player was loaded with the window only, and told how long the book is.
    const first = JSON.parse(device.files.get(id) ?? '{}') as QueueFile;
    expect(device.calls).toEqual([`load /cache/${id}.json@${at}`, 'play']);
    // The final write is the finished queue; the first load had only the window (checked through fills).
    expect(new Set(device.filled).size).toBe(total.segments.length - QUEUE_WINDOW);
    expect(device.filled.slice(0, 3)).toEqual([
      at + QUEUE_WINDOW,
      at + QUEUE_WINDOW + 1,
      at + QUEUE_WINDOW + 2,
    ]);
    expect(device.filled).not.toContain(at);

    // Everything ends up identical to a whole-book build, and cached with its key.
    expect(plan.queue.segments).toEqual(total.segments);
    expect(device.store.getState().queue?.segments).toEqual(total.segments);
    expect(first.key).toBe(total.key);
    expect(first.segments).toEqual(total.segments);
  });

  it('reuses the cached queue on the next open without building anything', async () => {
    const { db, id } = seed(3);
    const device = fakeDevice();
    await startDocument(device.deps(db), id, SETTINGS);
    device.filled.length = 0;
    const plan = await startDocument(device.deps(db), id, SETTINGS);
    expect(device.filled).toEqual([]);
    expect(plan.queue.segments).toEqual(planSession(db, id, SETTINGS).queue.segments);
  });

  it('rebuilds when anything the queue depends on changes', async () => {
    const { db, id } = seed(2);
    const device = fakeDevice();
    await startDocument(device.deps(db), id, SETTINGS);
    updateSettings(db, id, { voice: 'M2' });
    device.filled.length = 0;
    const plan = await startDocument(device.deps(db), id, SETTINGS);
    expect(device.filled.length).toBeGreaterThan(0);
    expect(plan.queue.segments.find((s) => s.kind === 'narration')?.voice).toBe('M2');
  });

  it('prebuilds after import so the first open is instant', async () => {
    const { db, id } = seed(2);
    const device = fakeDevice();
    expect(await prepareQueue(device.deps(db), id, SETTINGS)).toBe(true);
    const plan = await startDocument(device.deps(db), id, SETTINGS);
    expect(device.filled).toEqual([]);
    expect(plan.queue.segments).toEqual(planSession(db, id, SETTINGS).queue.segments);
  });
});

describe('re-voicing a long book', () => {
  it('sends the new voice from the next sentence on, a chunk at a time, and caches the result', async () => {
    const { db, id } = seed(4);
    const device = fakeDevice();
    await startDocument(device.deps(db), id, SETTINGS);
    const sent: number[][] = [];
    const engine = {
      updateSegments: async (json: string) =>
        void sent.push((JSON.parse(json) as QueueFile).segments.map((s) => s.i)),
      setQuality: async () => undefined,
    };
    const current = 120;
    await changeVoice(
      {
        db,
        store: device.store,
        engine,
        writeQueue: device.deps(db).writeQueue,
        yieldToUi: async () => undefined,
      },
      id,
      'M2',
      SETTINGS,
      current,
    );
    expect(sent[0]?.[0]).toBe(current + 1);
    expect(sent.every((chunk) => chunk.length <= QUEUE_CHUNK && chunk.every((i) => i > current))).toBe(true);
    const total = planSession(db, id, SETTINGS).queue;
    expect(device.store.getState().queue?.segments).toEqual(total.segments);
    expect((JSON.parse(device.files.get(id) ?? '{}') as QueueFile).key).toBe(total.key);
  });
});
