/**
 * Web stand-in for the native engine: no audio, but the same API and events, advancing through the queue on
 * timers so the whole interface can be developed, tested and screenshotted in a browser.
 */
import { NativeModule, registerWebModule } from 'expo';
import type {
  Calibration,
  EngineInfo,
  LamplightEngineEvents,
  PlayerState,
  QueueFile,
  Quality,
} from './types';

const queues = new Map<string, QueueFile>();

class LamplightEngineWeb extends NativeModule<LamplightEngineEvents> {
  private queue: QueueFile | null = null;
  private state: PlayerState = {
    docId: null,
    playing: false,
    buffering: false,
    index: 0,
    positionMs: 0,
    speed: 1,
    quality: 'auto',
    sleepAt: null,
    sleepAtIndex: null,
    engineLoaded: true,
  };
  private timer: ReturnType<typeof setInterval> | null = null;

  /** The web app registers queue contents here instead of writing files. */
  registerQueue(path: string, q: QueueFile) {
    queues.set(path, q);
  }

  async initialize(): Promise<EngineInfo> {
    return {
      voices: ['F1', 'F2', 'F3', 'F4', 'F5', 'M1', 'M2', 'M3', 'M4', 'M5'],
      sampleRate: 44100,
      threads: 2,
      liveSteps: 4,
      studioSteps: 8,
      modelVersion: 'web-simulation',
    };
  }

  async calibrate(): Promise<Calibration> {
    return { rtf4: 0.3, rtf8: 0.55, liveSteps: 4, studioSteps: 8, threads: 2 };
  }

  async loadQueue(path: string, startIndex: number, startMs: number, speed: number, quality: Quality) {
    this.queue = queues.get(path) ?? null;
    this.state = {
      ...this.state,
      docId: this.queue?.docId ?? null,
      index: startIndex,
      positionMs: startMs,
      speed,
      quality,
    };
    this.emit('onState', { ...this.state });
  }

  async updateSegments() {}

  private durationOf(i: number) {
    const text = this.queue?.segments[i]?.text ?? '';
    return Math.max(400, (text.length / 15) * 1000);
  }

  async play() {
    if (!this.queue) return;
    this.state = { ...this.state, playing: true };
    this.emit('onState', { ...this.state });
    this.timer ??= setInterval(() => this.tick(), 100);
  }

  private tick() {
    if (!this.queue || !this.state.playing) return;
    let { index, positionMs } = this.state;
    positionMs += 100 * this.state.speed;
    if (positionMs >= this.durationOf(index)) {
      index += 1;
      positionMs = 0;
      if (index >= this.queue.segments.length) {
        this.state = { ...this.state, playing: false };
        this.emit('onState', { ...this.state });
        return;
      }
      this.emit('onSentence', { index, durationMs: this.durationOf(index) });
    }
    this.state = { ...this.state, index, positionMs };
    this.emit('onProgress', { index, positionMs });
  }

  async pause() {
    this.state = { ...this.state, playing: false };
    this.emit('onState', { ...this.state });
  }

  async stop() {
    await this.pause();
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.queue = null;
  }

  async seekTo(index: number) {
    this.state = { ...this.state, index, positionMs: 0 };
    this.emit('onProgress', { index, positionMs: 0 });
    this.emit('onState', { ...this.state });
  }

  async skip(delta: number) {
    await this.seekTo(Math.max(0, this.state.index + delta));
  }

  async skipChapter(delta: number) {
    const starts = this.queue?.chapterStarts ?? [0];
    const current = starts.filter((s) => s <= this.state.index).length - 1;
    await this.seekTo(starts[Math.min(starts.length - 1, Math.max(0, current + delta))] ?? 0);
  }

  async setSpeed(speed: number) {
    this.state = { ...this.state, speed };
    this.emit('onState', { ...this.state });
  }

  async setQuality(quality: Quality) {
    this.state = { ...this.state, quality };
    this.emit('onState', { ...this.state });
  }

  async setSleepTimer(minutes: number | null) {
    this.state = { ...this.state, sleepAt: minutes === null ? null : Date.now() + minutes * 60_000 };
    this.emit('onState', { ...this.state });
  }

  async prepareOffline() {}
  async cancelPrepare() {}
  async getState() {
    return { ...this.state };
  }
  async lastPosition() {
    return null;
  }
  async cacheBytes() {
    return 0;
  }
  async clearCache() {}
  async previewVoice(text: string) {
    return Math.max(400, (text.length / 15) * 1000);
  }
  async stopPreview() {}
  async synthesizeToFile(): Promise<number> {
    throw new Error('Audio export is not available on the web');
  }
  async extractPdf(): Promise<string> {
    throw new Error('PDF import is not available on the web');
  }
}

export default registerWebModule(LamplightEngineWeb, 'LamplightEngine');
