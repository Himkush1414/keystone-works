import { NativeModule, requireNativeModule } from 'expo';
import type { Calibration, EngineInfo, LamplightEngineEvents, PlayerState, Quality } from './types';

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
  play(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  seekTo(index: number): Promise<void>;
  skip(delta: number): Promise<void>;
  skipChapter(delta: number): Promise<void>;
  setSpeed(speed: number): Promise<void>;
  setQuality(quality: Quality): Promise<void>;
  setSleepTimer(minutes: number | null, endOfChapter: boolean): Promise<void>;
  prepareOffline(path: string, quality: Quality, chargingOnly: boolean): Promise<void>;
  cancelPrepare(docId: string): Promise<void>;
  getState(): Promise<PlayerState>;
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
  /** Returns JSON (see PdfExtraction). Rejects with code "password" or "corrupt". */
  extractPdf(path: string, password: string | null): Promise<string>;
}

export default requireNativeModule<LamplightEngineModule>('LamplightEngine');
