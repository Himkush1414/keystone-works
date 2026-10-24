import { createStore, type StoreApi } from 'zustand/vanilla';
import type {
  EngineErrorEvent,
  LamplightEngineEvents,
  PlayerState,
  ProgressEvent,
  QueueFile,
  SentenceEvent,
} from '../../modules/lamplight-engine/src/types';
import { Timeline } from './timeline';

export const IDLE: PlayerState = {
  docId: null,
  playing: false,
  buffering: false,
  index: 0,
  positionMs: 0,
  speed: 1,
  quality: 'auto',
  sleepAt: null,
  sleepAtIndex: null,
  engineLoaded: false,
};

/** The app's mirror of the native player. Native owns playback; this only reflects it for the UI. */
export interface PlayerMirror {
  native: PlayerState;
  queue: QueueFile | null;
  timeline: Timeline | null;
  /** Last progress event and when it arrived (ms, monotonic clock), for smooth interpolation. */
  progress: { index: number; positionMs: number; at: number };
  /** Bumped when the timeline learns a measured length, so selectors recompute. */
  timelineVersion: number;
  /** Why narration isn't playing, in plain words; cleared once it plays again. */
  failure: EngineErrorEvent | null;
  setFailure(failure: EngineErrorEvent | null): void;
  setQueue(queue: QueueFile | null): void;
  onState(state: PlayerState, now: number): void;
  onProgress(e: ProgressEvent, now: number): void;
  onSentence(e: SentenceEvent, now: number): void;
}

export function createPlayerStore(): StoreApi<PlayerMirror> {
  return createStore<PlayerMirror>()((set, get) => ({
    native: IDLE,
    queue: null,
    timeline: null,
    progress: { index: 0, positionMs: 0, at: 0 },
    timelineVersion: 0,
    failure: null,
    setFailure(failure) {
      set({ failure });
    },
    setQueue(queue) {
      set({ queue, timeline: queue ? new Timeline(queue) : null, timelineVersion: 0 });
    },
    onState(state, now) {
      const prev = get();
      // Playing or pausing re-anchors interpolation so the clock doesn't jump.
      const anchor =
        state.playing !== prev.native.playing || state.index !== prev.progress.index
          ? { index: state.index, positionMs: state.positionMs, at: now }
          : prev.progress;
      const failure = state.error
        ? { code: state.error.code, message: state.error.message }
        : state.playing && !state.buffering
          ? null
          : prev.failure;
      set({ native: state, progress: anchor, failure });
    },
    onProgress(e, now) {
      set({ progress: { index: e.index, positionMs: e.positionMs, at: now } });
    },
    onSentence(e, now) {
      const { timeline, timelineVersion } = get();
      timeline?.setMeasured(e.index, e.durationMs);
      set({
        progress: { index: e.index, positionMs: 0, at: now },
        timelineVersion: timeline ? timelineVersion + 1 : timelineVersion,
      });
    },
  }));
}

/**
 * Position within the current sentence at `now`, moving smoothly between the 10 Hz progress events. Never
 * runs more than one event interval ahead, so a stalled stream (buffering) doesn't drift.
 */
export function livePosition(m: PlayerMirror, now: number): { index: number; positionMs: number } {
  const { index, positionMs, at } = m.progress;
  if (!m.native.playing || m.native.buffering) return { index, positionMs };
  const elapsed = Math.min(Math.max(0, now - at), MAX_INTERPOLATION_MS);
  return { index, positionMs: positionMs + elapsed * m.native.speed };
}

const MAX_INTERPOLATION_MS = 250;

/** Subscribes the store to the engine's events; returns an unsubscribe function. */
export function connectEngine(
  store: StoreApi<PlayerMirror>,
  engine: {
    addListener<E extends keyof LamplightEngineEvents>(
      event: E,
      listener: LamplightEngineEvents[E],
    ): { remove(): void };
  },
  clock: () => number = () => performance.now(),
): () => void {
  const s = store.getState();
  const subs = [
    engine.addListener('onState', (e) => s.onState(e, clock())),
    engine.addListener('onProgress', (e) => s.onProgress(e, clock())),
    engine.addListener('onSentence', (e) => s.onSentence(e, clock())),
    engine.addListener('onError', (e) => s.setFailure(e)),
  ];
  return () => subs.forEach((sub) => sub.remove());
}
