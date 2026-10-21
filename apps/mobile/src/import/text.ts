import type { Db } from '../data/db';
import { importFile, type ImportDeps, type ImportResult } from './run';

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
  input: { text: string; title?: string },
  deps: ImportDeps,
): Promise<ImportResult> {
  if (!input.text.trim()) return Promise.resolve({ status: 'failed', id: null, code: 'empty' });
  return importFile(
    db,
    {
      name: 'pasted.txt',
      mime: 'text/plain',
      bytes: new TextEncoder().encode(input.text),
      source: 'paste',
      title: input.title?.trim() || pastedTitle(input.text),
    },
    deps,
  );
}
