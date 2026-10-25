import { NativeModule, requireNativeModule } from 'expo';
import type {
  AbKind,
  AbSample,
  Calibration,
  Diagnostics,
  EngineInfo,
  LamplightEngineEvents,
  PlayerState,
  Quality,
  VoiceTest,
} from './types';

declare class LamplightEngineModule extends NativeModule<LamplightEngineEvents> {
  initialize(): Promise<EngineInfo>;
  calibrate(): Promise<Calibration>;
  loadQueue(
    path: string,
    startIndex: number,
    startMs: number,
    speed: number,
    quality: Quality,
  ): Promise<void>;
  updateSegments(json: string): Promise<void>;
  /** Fills sentences queued as pending, without dropping audio already made. */
  fillSegments(json: string): Promise<void>;
  /** Rejects with a code and a plain-words message when narration can't start. */
  play(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  seekTo(index: number): Promise<void>;
  /** Moves to sentence `index` and plays from it, paused or not; rejects like play(). */
  playFrom(index: number): Promise<void>;
  skip(delta: number): Promise<void>;
  skipChapter(delta: number): Promise<void>;
  setSpeed(speed: number): Promise<void>;
  setQuality(quality: Quality): Promise<void>;
  setSleepTimer(minutes: number | null, endOfChapter: boolean): Promise<void>;
  prepareOffline(path: string, quality: Quality, chargingOnly: boolean): Promise<void>;
  cancelPrepare(docId: string): Promise<void>;
  getState(): Promise<PlayerState>;
  getDiagnostics(): Promise<Diagnostics>;
  /** System bar icons for a dark (true) or light background, and the window colour behind the app. */
  setSystemBars(dark: boolean, background: string | null): Promise<void>;
  /** Speaks a short test sentence through the engine and the speaker. */
  runVoiceTest(): Promise<VoiceTest>;
  /** Diagnostics A/B: one sample sentence, raw from the model or through the player; played and saved. */
  abSample(kind: AbKind, lang: 'en' | 'hi'): Promise<AbSample>;
  lastPosition(): Promise<string | null>;
  cacheBytes(): Promise<number>;
  clearCache(): Promise<void>;
  previewVoice(text: string, lang: string, voice: string, steps: number): Promise<number>;
  stopPreview(): Promise<void>;
  /** Dictionary rows for a word (packages/core `lookupRequest` in, `LookupRows` JSON out). */
  lookupWord(request: string): Promise<string>;
  /** Unpacks the dictionary ahead of the first question. */
  warmDictionary(): Promise<void>;
  synthesizeToFile(text: string, lang: string, voice: string, steps: number, path: string): Promise<number>;
  /** Opens a PDF; returns JSON (PdfOpened). Rejects with code "password" or "corrupt". */
  openPdf(path: string, password: string | null): Promise<string>;
  /** Pages `from`..`to` (1-based, inclusive) of an open PDF, as JSON (PdfPageLines[]). */
  pdfPages(handle: number, from: number, to: number): Promise<string>;
  closePdf(handle: number): Promise<void>;
}

export default requireNativeModule<LamplightEngineModule>('LamplightEngine');
