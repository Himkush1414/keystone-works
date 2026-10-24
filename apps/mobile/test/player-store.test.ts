import { describe, expect, it } from 'vitest';
import type { LamplightEngineEvents, QueueFile } from '../modules/lamplight-engine/src/types';
import { connectEngine, createPlayerStore, IDLE, livePosition } from '../src/player/store';

const queue: QueueFile = {
  docId: 'd1',
  title: 'Book',
  chapterStarts: [0],
  chapterTitles: [''],
  segments: [0, 1, 2].map((i) => ({
    i,
    text: 'x'.repeat(30),
    lang: 'en',
    voice: 'F1',
    pauseMs: 0,
    kind: 'narration',
  })),
};

const playing = { ...IDLE, docId: 'd1', playing: true, engineLoaded: true };

describe('player mirror', () => {
  it('builds a timeline for the loaded queue', () => {
    const store = createPlayerStore();
    store.getState().setQueue(queue);
    expect(store.getState().timeline?.totalMs()).toBe(6000);
    store.getState().setQueue(null);
    expect(store.getState().timeline).toBeNull();
  });

  it('interpolates between progress events while playing, at the playback speed', () => {
    const store = createPlayerStore();
    store.getState().onState({ ...playing, speed: 1.5 }, 0);
    store.getState().onProgress({ index: 0, positionMs: 1000 }, 100);
    expect(livePosition(store.getState(), 200)).toEqual({ index: 0, positionMs: 1150 });
  });

  it('does not run ahead of a stalled stream', () => {
    const store = createPlayerStore();
    store.getState().onState(playing, 0);
    store.getState().onProgress({ index: 0, positionMs: 1000 }, 100);
    expect(livePosition(store.getState(), 5_000)).toEqual({ index: 0, positionMs: 1250 });
    store.getState().onState({ ...playing, buffering: true }, 5_000);
    expect(livePosition(store.getState(), 6_000)).toEqual({ index: 0, positionMs: 1000 });
  });

  it('holds still while paused and re-anchors on play', () => {
    const store = createPlayerStore();
    store.getState().onState({ ...IDLE, docId: 'd1', index: 1, positionMs: 400 }, 0);
    expect(livePosition(store.getState(), 9_000)).toEqual({ index: 1, positionMs: 400 });
    store.getState().onState({ ...playing, index: 1, positionMs: 400 }, 10_000);
    expect(livePosition(store.getState(), 10_100)).toEqual({ index: 1, positionMs: 500 });
  });

  it('starts each sentence at zero and records its measured length', () => {
    const store = createPlayerStore();
    store.getState().setQueue(queue);
    store.getState().onState(playing, 0);
    store.getState().onSentence({ index: 1, durationMs: 3000 }, 50);
    const m = store.getState();
    expect(m.progress).toEqual({ index: 1, positionMs: 0, at: 50 });
    expect(m.timeline?.totalMs()).toBe(7000);
    expect(m.timelineVersion).toBe(1);
  });
});

describe('connectEngine', () => {
  it('forwards engine events with the clock and unsubscribes cleanly', () => {
    const listeners = new Map<string, (e: never) => void>();
    let removed = 0;
    const engine = {
      addListener<E extends keyof LamplightEngineEvents>(event: E, fn: LamplightEngineEvents[E]) {
        listeners.set(event, fn as (e: never) => void);
        return { remove: () => void removed++ };
      },
    };
    const store = createPlayerStore();
    const stop = connectEngine(store, engine, () => 42);
    (listeners.get('onProgress') as LamplightEngineEvents['onProgress'])({ index: 2, positionMs: 10 });
    expect(store.getState().progress).toEqual({ index: 2, positionMs: 10, at: 42 });
    (listeners.get('onState') as LamplightEngineEvents['onState'])(playing);
    expect(store.getState().native.playing).toBe(true);
    stop();
    expect(removed).toBe(4);
  });

  it('keeps the reason narration failed until audio flows again', () => {
    const listeners = new Map<string, (e: never) => void>();
    const engine = {
      addListener<E extends keyof LamplightEngineEvents>(event: E, fn: LamplightEngineEvents[E]) {
        listeners.set(event, fn as (e: never) => void);
        return { remove: () => undefined };
      },
    };
    const store = createPlayerStore();
    connectEngine(store, engine, () => 1);
    const failure = { code: 'runtime-error', message: 'The voice engine stopped with an error while speaking.' };
    (listeners.get('onError') as LamplightEngineEvents['onError'])(failure);
    expect(store.getState().failure).toEqual(failure);
    // Still waiting for audio: the reason stays on screen.
    (listeners.get('onState') as LamplightEngineEvents['onState'])({ ...playing, buffering: true });
    expect(store.getState().failure).toEqual(failure);
    (listeners.get('onState') as LamplightEngineEvents['onState'])(playing);
    expect(store.getState().failure).toBeNull();
    // A failure the engine reports in its state wins.
    const error = { code: 'model-missing', message: 'The voice files are missing.', detail: 'x', at: 2 };
    (listeners.get('onState') as LamplightEngineEvents['onState'])({ ...playing, error });
    expect(store.getState().failure).toEqual({ code: 'model-missing', message: 'The voice files are missing.' });
  });
});
