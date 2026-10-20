export type Quality = 'live' | 'studio' | 'studioPlus' | 'auto';

export interface EngineInfo {
  voices: string[];
  sampleRate: number;
  threads: number;
  liveSteps: number;
  studioSteps: number;
  modelVersion: string;
}

export interface Calibration {
  rtf4: number;
  rtf8: number;
  liveSteps: number;
  studioSteps: number;
  threads: number;
}

export interface PlayerState {
  docId: string | null;
  playing: boolean;
  buffering: boolean;
  index: number;
  positionMs: number;
  speed: number;
  quality: Quality;
  sleepAt: number | null;
  sleepAtIndex: number | null;
  engineLoaded: boolean;
}

export interface ProgressEvent {
  index: number;
  positionMs: number;
}

export interface SentenceEvent {
  index: number;
  durationMs: number;
}

export interface RenderEvent {
  docId: string;
  done: number;
  total: number;
}

export interface EngineErrorEvent {
  code: string;
  message: string;
}

export type LamplightEngineEvents = {
  onState: (e: PlayerState) => void;
  onProgress: (e: ProgressEvent) => void;
  onSentence: (e: SentenceEvent) => void;
  onRender: (e: RenderEvent) => void;
  onError: (e: EngineErrorEvent) => void;
};

/** The queue file the player reads (written by apps/mobile/src/player/queue.ts). */
export interface QueueFile {
  docId: string;
  title: string;
  author?: string;
  artworkUri?: string;
  chapterStarts: number[];
  chapterTitles: string[];
  segments: { i: number; text: string; lang: string; voice: string; pauseMs: number; kind: string }[];
}

export interface PdfExtraction {
  pages: {
    width: number;
    height: number;
    lines: { text: string; x: number; y: number; width: number; size: number }[];
  }[];
  outline: { title: string; page: number; level: number }[];
  title: string | null;
  author: string | null;
}
