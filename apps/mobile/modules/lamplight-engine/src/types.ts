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
  /** notLoaded | loading | ready | failed */
  engineStatus?: string;
  /** Why narration isn't producing sound, until it renders again. */
  error?: EngineFailure | null;
}

/** A failure the engine reports: a stable code for support and a message written for the listener. */
export interface EngineFailure {
  code: string;
  message: string;
  detail: string;
  at: number;
}

/** What the Diagnostics screen shows; each part is a string when it couldn't be read. */
export interface Diagnostics {
  engine:
    | {
        status: string;
        error: EngineFailure | null;
        runtimeVersion: string;
        threads: number;
        loadTimings: Record<string, number>;
        modelVersion: string;
        modelLocation: string;
        modelFiles: { name: string; bytes: number; present: boolean; stored: boolean }[];
      }
    | string;
  player: (PlayerState & Record<string, unknown>) | string;
  volume: { media: number; max: number; muted: boolean } | string;
  device: Record<string, unknown> | string;
  app: Record<string, unknown> | string;
  log: string[];
}

export interface VoiceTest {
  ok: boolean;
  loadMs?: number;
  renderMs?: number;
  audioMs?: number;
  stages?: Record<string, number>;
  error?: EngineFailure;
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
  /** Sentences in the whole document; segments not built yet are sent later (fillSegments). */
  count?: number;
  /** Hash of everything the queue was built from; set once it is complete, so it can be reused. */
  key?: string;
  title: string;
  author?: string;
  artworkUri?: string;
  chapterStarts: number[];
  chapterTitles: string[];
  segments: {
    i: number;
    text: string;
    lang: string;
    voice: string;
    pauseMs: number;
    kind: string;
    /** Pace relative to the listener's speed (a character's own pace); 1 when absent. */
    rate?: number;
    /** Loudness change in dB (a whisper is quieter); 0 when absent. */
    gainDb?: number;
    /** A soft breath before the line. */
    breath?: boolean;
    /** The line split by voice language when it mixes them; each run is rendered in its own language. */
    runs?: { text: string; lang: string }[];
    /** Not built yet: a placeholder in the app's copy, never sent to the player. */
    pending?: true;
  }[];
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
