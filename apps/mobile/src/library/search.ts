/** A search snippet cut into plain and matched parts (SQLite marks matches with \u0002 … \u0003). */
export function snippetParts(snippet: string): { text: string; match: boolean }[] {
  const OPEN = '\u0002';
  const CLOSE = '\u0003';
  const parts: { text: string; match: boolean }[] = [];
  let at = 0;
  while (at < snippet.length) {
    const open = snippet.indexOf(OPEN, at);
    if (open < 0) break;
    const close = snippet.indexOf(CLOSE, open + 1);
    if (close < 0) break;
    if (open > at) parts.push({ text: snippet.slice(at, open), match: false });
    if (close > open + 1) parts.push({ text: snippet.slice(open + 1, close), match: true });
    at = close + 1;
  }
  if (at < snippet.length) parts.push({ text: snippet.slice(at), match: false });
  return parts;
}

export const MAX_RECENT_SEARCHES = 5;

/** Puts `query` first among recent searches, without repeats, keeping the last five. */
export function rememberSearch(recent: readonly string[], query: string): string[] {
  const q = query.trim();
  if (!q) return [...recent];
  const key = q.toLocaleLowerCase();
  return [q, ...recent.filter((r) => r.toLocaleLowerCase() !== key)].slice(0, MAX_RECENT_SEARCHES);
}
