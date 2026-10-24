/** The document model shared by importers, the pipeline, the database layer and the player. */

export type DocumentKind = 'book' | 'document' | 'article' | 'note';

export type BlockKind = 'heading' | 'paragraph' | 'quote' | 'list' | 'caption' | 'code' | 'pagebreak';

/** Why a span of text is left out of the narration. Skipped text stays visible in the reader. */
export type SkipReason =
  | 'header'
  | 'footer'
  | 'pageNumber'
  | 'watermark'
  | 'copyright'
  | 'footnote'
  | 'scanNoise'
  | 'strayNumber'
  | 'citation'
  | 'footnoteMarker'
  | 'url'
  | 'caption'
  | 'references'
  | 'code'
  | 'custom';

export interface Skip {
  start: number;
  end: number;
  reason: SkipReason;
}

export interface Block {
  kind: BlockKind;
  text: string;
  /** Heading level 1–6 for headings. */
  level?: number;
  skips: Skip[];
  /** Source page for PDFs (1-based). */
  page?: number;
}

export interface Chapter {
  title: string;
  level: number;
  /** Index of the first block of this chapter. Chapters are contiguous and ordered. */
  blockStart: number;
  language?: string;
}

export interface DocumentMeta {
  title: string;
  author?: string;
  kind: DocumentKind;
  language?: string;
  siteName?: string;
  publishedAt?: number;
  sourceUri?: string;
  /** Cover image bytes (EPUB). */
  cover?: { mime: string; data: Uint8Array };
}

export interface DocumentDraft {
  meta: DocumentMeta;
  chapters: Chapter[];
  blocks: Block[];
}

export type SentenceKind = 'narration' | 'dialogue' | 'heading';

export interface Sentence {
  /** Index of the block this sentence belongs to. */
  block: number;
  /** Character offsets into the block text (end exclusive). */
  start: number;
  end: number;
  kind: SentenceKind;
  /** Character id for dialogue when Cast attributed a speaker. */
  speaker?: string;
  /** Silence after this sentence, in milliseconds at 1× speed. */
  pauseMs: number;
}

/** Error raised by importers and the pipeline with a stable code the UI maps to copy. */
export class ImportError extends Error {
  constructor(
    readonly code:
      | 'drm'
      | 'scanned'
      | 'password'
      | 'corrupt'
      | 'empty'
      | 'unsupported'
      | 'tooLarge'
      | 'network'
      | 'partialArticle',
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'ImportError';
  }
}
