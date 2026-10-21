import type { QueueFile } from '../../modules/lamplight-engine/src/types';

type TimelineSource = Pick<QueueFile, 'segments' | 'chapterStarts'>;

/**
 * Length of a sentence before it has been rendered. Same estimate as PlaybackController.estimateMs, so the
 * app and the media notification agree on positions.
 */
export function estimateSpeechMs(text: string): number {
  return text.trim() ? Math.max(400, Math.floor((text.length * 1000) / 15)) : 0;
}

/**
 * Where the listener is in a document, in time: progress, time left in the chapter and in the whole item.
 * Durations start as estimates and are replaced by the real length of each sentence as it is rendered.
 * Sentence pauses count as listening time. Times are at 1× unless a speed is given.
 */
export class Timeline {
  private readonly ms: Float64Array;
  /** prefix[i] = time before sentence i; prefix[n] = total. */
  private readonly prefix: Float64Array;
  private dirtyFrom = 0;

  constructor(private readonly source: TimelineSource) {
    const n = source.segments.length;
    this.ms = new Float64Array(n);
    this.prefix = new Float64Array(n + 1);
    source.segments.forEach((s, i) => {
      this.ms[i] = estimateSpeechMs(s.text) + s.pauseMs;
    });
  }

  get length(): number {
    return this.ms.length;
  }

  /** Records the rendered length of sentence `index` (speech only; its pause is added here). */
  setMeasured(index: number, speechMs: number): void {
    const seg = this.source.segments[index];
    if (!seg || !(speechMs >= 0)) return;
    this.ms[index] = speechMs + seg.pauseMs;
    this.dirtyFrom = Math.min(this.dirtyFrom, index);
  }

  /** Time from the start of the document to `index` plus `offsetMs` into it. */
  positionMs(index: number, offsetMs = 0): number {
    const i = Math.min(Math.max(0, index), this.length);
    return this.before(i) + (i < this.length ? Math.min(Math.max(0, offsetMs), this.ms[i] ?? 0) : 0);
  }

  totalMs(): number {
    return this.before(this.length);
  }

  /** 0..1 through the document. */
  progress(index: number, offsetMs = 0): number {
    const total = this.totalMs();
    return total > 0 ? Math.min(1, this.positionMs(index, offsetMs) / total) : 0;
  }

  /** Chapter number (0-based) containing sentence `index`. */
  chapterOf(index: number): number {
    const starts = this.source.chapterStarts;
    let c = 0;
    for (let k = 0; k < starts.length; k++) if ((starts[k] ?? 0) <= index) c = k;
    return c;
  }

  /** Time left until the end of the chapter and of the document, at `speed`. */
  remaining(index: number, offsetMs: number, speed = 1): { chapterMs: number; totalMs: number } {
    const here = this.positionMs(index, offsetMs);
    const nextStart = this.source.chapterStarts[this.chapterOf(index) + 1];
    const chapterEnd = nextStart === undefined ? this.totalMs() : this.before(nextStart);
    const rate = speed > 0 ? speed : 1;
    return {
      chapterMs: Math.max(0, chapterEnd - here) / rate,
      totalMs: Math.max(0, this.totalMs() - here) / rate,
    };
  }

  private before(i: number): number {
    if (this.dirtyFrom < this.length + 1) {
      for (let k = this.dirtyFrom; k < this.length; k++)
        this.prefix[k + 1] = (this.prefix[k] ?? 0) + (this.ms[k] ?? 0);
      this.dirtyFrom = this.length + 1;
    }
    return this.prefix[i] ?? 0;
  }
}
