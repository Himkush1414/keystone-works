import type { Diagnostics } from '../../modules/lamplight-engine/src/types';

export interface DiagnosticsSection {
  key: 'engine' | 'player' | 'volume' | 'device' | 'app';
  rows: [label: string, value: string][];
}

const MB = 1024 * 1024;

function show(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(3);
  if (typeof value === 'string' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(show).join(', ') || '—';
  return Object.entries(value as Record<string, unknown>)
    .map(([k, v]) => `${k} ${show(v)}`)
    .join(' · ');
}

/** Flattens one part into label/value rows; a part that couldn't be read is one row saying why. */
function rows(part: unknown, skip: readonly string[] = []): [string, string][] {
  if (typeof part === 'string') return [['error', part]];
  return Object.entries((part ?? {}) as Record<string, unknown>)
    .filter(([k]) => !skip.includes(k))
    .map(([k, v]) => [k, show(v)]);
}

/** The Diagnostics screen's sections, in the order a support reply would read them. */
export function diagnosticsSections(d: Diagnostics): DiagnosticsSection[] {
  const engine: [string, string][] =
    typeof d.engine === 'string'
      ? [['error', d.engine]]
      : [
          ...rows(d.engine, ['modelFiles', 'error']),
          [
            'error',
            d.engine.error
              ? `${d.engine.error.code}: ${d.engine.error.message} (${d.engine.error.detail})`
              : '—',
          ],
          ...d.engine.modelFiles.map((f): [string, string] => [
            f.name,
            f.present
              ? `${(f.bytes / MB).toFixed(1)} MB${f.stored ? '' : ' (compressed: loaded into memory)'}`
              : 'MISSING',
          ]),
        ];
  return [
    { key: 'engine', rows: engine },
    { key: 'player', rows: rows(d.player) },
    { key: 'volume', rows: rows(d.volume) },
    { key: 'device', rows: rows(d.device) },
    { key: 'app', rows: rows(d.app) },
  ];
}

/** True when the phone's media volume would make narration silent. */
export function isSilenced(d: Diagnostics): boolean {
  return typeof d.volume !== 'string' && (d.volume.muted || d.volume.media === 0);
}

/** Plain text of everything on the screen, to paste into a message. */
export function diagnosticsReport(d: Diagnostics, at: Date): string {
  const parts = diagnosticsSections(d).map(
    (s) => `[${s.key}]\n${s.rows.map(([k, v]) => `${k}: ${v}`).join('\n')}`,
  );
  return [`Lamplight diagnostics ${at.toISOString()}`, ...parts, `[log]\n${d.log.join('\n')}`].join('\n\n');
}
