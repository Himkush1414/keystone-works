import type { DocumentKind } from '@lamplight/core';
import type { Db } from '../data/db';
import { IMPORT_VERSION, listItems, type DocumentSource } from '../data/library';
import { importFile, type ImportDeps, type ImportResult } from './run';
import { SAMPLES, type Sample } from './samples';

const MAX_TITLE = 60;

/** A title for pasted text: its first line, cut at a word boundary. */
export function pastedTitle(text: string): string {
  const line =
    text
      .split('\n')
      .map((l) => l.replace(/\s+/g, ' ').trim())
      .find(Boolean) ?? '';
  if (line.length <= MAX_TITLE) return line || 'Untitled';
  const cut = line.slice(0, MAX_TITLE);
  const space = cut.lastIndexOf(' ');
  return `${(space > MAX_TITLE / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:.–—-]+$/u, '')}…`;
}

/** Adds pasted or typed text to the library, like a file: same pipeline, same duplicate check. */
export function importText(
  db: Db,
  input: { text: string; title?: string; kind?: DocumentKind; author?: string; source?: DocumentSource },
  deps: ImportDeps,
): Promise<ImportResult> {
  if (!input.text.trim()) return Promise.resolve({ status: 'failed', id: null, code: 'empty' });
  return importFile(
    db,
    {
      name: 'pasted.txt',
      mime: 'text/plain',
      bytes: new TextEncoder().encode(input.text),
      source: input.source ?? 'paste',
      title: input.title?.trim() || pastedTitle(input.text),
      ...(input.kind ? { kind: input.kind } : {}),
      ...(input.author ? { author: input.author } : {}),
    },
    deps,
  );
}

/** Adds a bundled sample; opening the same sample again finds the copy already in the library. */
export function importSample(db: Db, sample: Sample, deps: ImportDeps): Promise<ImportResult> {
  return importText(
    db,
    { text: sample.text, title: sample.title, kind: sample.kind, author: sample.author, source: 'sample' },
    deps,
  );
}

/**
 * Bundled samples whose stored text an older importer made are imported again in place: the app has their
 * text, so the listener needn't do anything (files have a notice instead). Matched by the bundled title; the
 * same item, place and settings are kept. Returns the ids refreshed.
 */
export async function refreshStaleSamples(
  db: Db,
  deps: ImportDeps,
  samples: readonly Sample[] = SAMPLES,
): Promise<string[]> {
  const refreshed: string[] = [];
  for (const item of listItems(db)) {
    if (item.source !== 'sample' || item.status !== 'ready' || item.importVersion >= IMPORT_VERSION) continue;
    const sample = samples.find((s) => s.title === item.title);
    if (!sample) continue;
    const r = await importSample(db, sample, deps);
    if (r.status === 'ready' && r.id === item.id) refreshed.push(item.id);
  }
  return refreshed;
}
