import alice from '../samples/alice-tea-party.json';
import idgah from '../samples/idgah.json';
import panch from '../samples/panch-parmeshwar.json';
import pride from '../samples/pride-and-prejudice.json';

/** One sentence of a sample, with when it is spoken in the sample's audio (ms). */
export interface SampleSentence {
  text: string;
  /** What follows the sentence in its paragraph (usually a space). */
  gap: string;
  start: number;
  end: number;
  voice: string;
  dialogue?: boolean;
  speaker?: string;
}

export interface SampleBlock {
  kind: string;
  sentences: SampleSentence[];
}

export interface Sample {
  id: string;
  lang: 'en' | 'hi';
  title: string;
  part: string;
  author: string;
  year: number;
  source: string;
  /** A speaker or voice was corrected by hand, as a listener would in the app. */
  corrected?: boolean;
  narrator: string;
  durationMs: number;
  audio: string;
  blocks: SampleBlock[];
}

export const SAMPLES = [pride, alice, idgah, panch] as Sample[];

export const sampleById = (id: string): Sample | undefined => SAMPLES.find((s) => s.id === id);

export const LANGUAGE_NAMES: Record<Sample['lang'], string> = { en: 'English', hi: 'हिन्दी' };

/** "1:28" */
export function clock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
