import type { Block, DocumentDraft, Skip, SkipReason } from '../model';

/**
 * Clean Read: finds text that shouldn't be narrated. Detection runs once at import and records every
 * candidate as a skip with its reason; which reasons are active is a per-document setting, so turning a
 * detector off or on never needs a re-import.
 */

export interface CleanSettings {
  header: boolean;
  footer: boolean;
  pageNumber: boolean;
  citation: boolean;
  footnoteMarker: boolean;
  /** Skip links entirely; when false they're spoken as the word "link". */
  url: boolean;
  caption: boolean;
  references: boolean;
  code: boolean;
}

export const defaultCleanSettings = (
  kind: DocumentDraft['meta']['kind'],
  fromPdf: boolean,
): CleanSettings => ({
  header: true,
  footer: true,
  pageNumber: true,
  citation: fromPdf || kind === 'article' || kind === 'document',
  footnoteMarker: true,
  url: false,
  caption: false,
  references: false,
  code: true,
});

const NUMERIC_CITATION = /\[\d{1,4}(?:\s*[,–-]\s*\d{1,4})*\]/gu;
const AUTHOR_YEAR =
  /\((?:see\s+|cf\.\s+)?(?:\p{Lu}[\p{L}'’-]+(?:\s+et al\.)?(?:,?\s+(?:and|&)\s+\p{Lu}[\p{L}'’-]+)?,?\s+(?:\d{4}[a-z]?|n\.d\.)(?:,\s*(?:p|pp)\.\s*\d+(?:[–-]\d+)?)?(?:;\s*)?)+\)/gu;
const SUPERSCRIPT_MARKER = /(?<=[\p{L}.,;:!?”’"')\]])[⁰¹²³⁴⁵⁶⁷⁸⁹]+/gu;
/** "end of a sentence.12 Next" — footnote numbers glued to punctuation, typical of PDF text layers. */
const GLUED_MARKER = /(?<=\p{Ll}[.,;:])\d{1,3}(?=\s|$)/gu;
const URL = /\b(?:https?:\/\/|www\.)[^\s<>"]+[^\s<>".,;:!?)\]]|\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/giu;
const CAPTION =
  /^(?:Figure|Fig\.|Table|Chart|Plate|Abbildung|Abb\.|Tabelle|Figura|Tabla|Cuadro|Tableau|Tabela|Tabella)\s+\d+(?:\.\d+)?[.:—–-]/u;
const REFERENCES =
  /^(?:\d+\.?\s+)?(?:references|bibliography|works cited|literature cited|sources|notes and references|literatur|literaturverzeichnis|quellen|bibliografía|referencias|références|bibliographie|referências|bibliografia|riferimenti bibliografici)$/iu;

function spans(text: string, re: RegExp, reason: SkipReason): Skip[] {
  return [...text.matchAll(re)].map((m) => ({ start: m.index, end: m.index + m[0].length, reason }));
}

/** Text-level candidates for one block. */
export function detectInBlock(block: Block, fromPdf: boolean): Skip[] {
  if (block.kind === 'code') return [{ start: 0, end: block.text.length, reason: 'code' }];
  if (block.kind === 'caption' || (block.kind === 'paragraph' && CAPTION.test(block.text))) {
    return [{ start: 0, end: block.text.length, reason: 'caption' }];
  }
  const t = block.text;
  return [
    ...spans(t, NUMERIC_CITATION, 'citation'),
    ...spans(t, AUTHOR_YEAR, 'citation'),
    ...spans(t, SUPERSCRIPT_MARKER, 'footnoteMarker'),
    ...(fromPdf ? spans(t, GLUED_MARKER, 'footnoteMarker') : []),
    ...spans(t, URL, 'url'),
  ];
}

/** Marks the references/bibliography section when it sits in the last 40% of the document. */
function referencesRange(blocks: readonly Block[]): [number, number] | null {
  const from = Math.floor(blocks.length * 0.6);
  for (let i = from; i < blocks.length; i++) {
    const b = blocks[i];
    if (!b || b.kind !== 'heading' || !REFERENCES.test(b.text.trim())) continue;
    const level = b.level ?? 1;
    let end = blocks.length;
    for (let j = i + 1; j < blocks.length; j++) {
      const n = blocks[j];
      if (n?.kind === 'heading' && (n.level ?? 1) <= level) {
        end = j;
        break;
      }
    }
    return [i, end];
  }
  return null;
}

function mergeSkips(skips: Skip[]): Skip[] {
  const sorted = [...skips].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Skip[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.start < last.end) {
      if (s.end > last.end && s.reason === last.reason) last.end = s.end;
      else if (s.end > last.end) out.push({ ...s, start: last.end });
      continue;
    }
    out.push({ ...s });
  }
  return out;
}

/**
 * Adds every Clean Read candidate to the draft's blocks (keeping skips the importer already set, such as
 * PDF headers and page numbers). Returns a new draft.
 */
export function detectSkips(draft: DocumentDraft, fromPdf = false): DocumentDraft {
  const refs = referencesRange(draft.blocks);
  const blocks = draft.blocks.map((b, i) => {
    const found =
      refs && i >= refs[0] && i < refs[1] && b.text.length > 0
        ? [{ start: 0, end: b.text.length, reason: 'references' as const }]
        : detectInBlock(b, fromPdf);
    return { ...b, skips: mergeSkips([...b.skips, ...found]) };
  });
  return { ...draft, blocks };
}

/** The skips that apply under `settings`, plus any custom phrases the user wants left out. */
export function effectiveSkips(
  block: Block,
  settings: CleanSettings,
  customPhrases: readonly string[] = [],
): Skip[] {
  const active = block.skips.filter(
    (s) => s.reason === 'custom' || settings[s.reason as keyof CleanSettings],
  );
  const custom: Skip[] = [];
  const lower = block.text.toLowerCase();
  for (const phrase of customPhrases) {
    const p = phrase.trim().toLowerCase();
    if (!p) continue;
    for (let at = lower.indexOf(p); at >= 0; at = lower.indexOf(p, at + p.length)) {
      custom.push({ start: at, end: at + p.length, reason: 'custom' });
    }
  }
  return mergeSkips([...active, ...custom]);
}

export interface CleanReport {
  reason: SkipReason;
  count: number;
  examples: string[];
}

/** Counts and examples per reason across the document, for the Clean Read review sheet. */
export function cleanReport(draft: DocumentDraft): CleanReport[] {
  const by = new Map<SkipReason, CleanReport>();
  for (const b of draft.blocks) {
    for (const s of b.skips) {
      const r = by.get(s.reason) ?? { reason: s.reason, count: 0, examples: [] };
      r.count++;
      const sample = b.text.slice(s.start, s.end).trim().replace(/\s+/g, ' ');
      const clipped = sample.length > 60 ? `${sample.slice(0, 57)}…` : sample;
      if (r.examples.length < 2 && clipped && !r.examples.includes(clipped)) r.examples.push(clipped);
      by.set(s.reason, r);
    }
  }
  return [...by.values()].sort((a, b) => b.count - a.count);
}
