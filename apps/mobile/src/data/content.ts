import type {
  Age,
  Block,
  BlockKind,
  Chapter,
  Sentence,
  SentenceKind,
  Skip,
  SkipReason,
  Temperament,
} from '@lamplight/core';
import type { Db } from './db';

/** Everything the reader and the queue builder need for one document. */
export interface DocumentContent {
  blocks: Block[];
  sentences: Sentence[];
  confidence: number[];
  chapters: (Chapter & { firstSentence: number })[];
  characters: CastCharacter[];
}

export interface CastCharacter {
  id: string;
  name: string;
  aliases: string[];
  gender: 'f' | 'm' | null;
  lineCount: number;
  /** The listener's choice; null for automatic. */
  voiceId: string | null;
  age: Age | null;
  temperament: Temperament | null;
  /** The voice Cast chose the first time the document played, kept so it never shifts. */
  autoVoiceId: string | null;
}

/** The characters Cast found in a document, most lines first. */
export function listCharacters(db: Db, documentId: string): CastCharacter[] {
  return db
    .all<{
      id: string;
      name: string;
      aliases_json: string;
      gender: 'f' | 'm' | null;
      line_count: number;
      voice_id: string | null;
      age: Age | null;
      temperament: Temperament | null;
      auto_voice_id: string | null;
    }>(
      'SELECT id, name, aliases_json, gender, line_count, voice_id, age, temperament, auto_voice_id FROM characters WHERE document_id = ? ORDER BY line_count DESC, id',
      [documentId],
    )
    .map((r) => ({
      id: r.id,
      name: r.name,
      aliases: JSON.parse(r.aliases_json) as string[],
      gender: r.gender,
      lineCount: r.line_count,
      voiceId: r.voice_id,
      age: r.age,
      temperament: r.temperament,
      autoVoiceId: r.auto_voice_id,
    }));
}

export function loadContent(db: Db, documentId: string): DocumentContent {
  const blocks = db
    .all<{
      kind: BlockKind;
      level: number | null;
      page: number | null;
      text: string;
      skips_json: string | null;
    }>('SELECT kind, level, page, text, skips_json FROM blocks WHERE document_id = ? ORDER BY ord', [
      documentId,
    ])
    .map((r): Block => {
      const skips: Skip[] = r.skips_json
        ? (JSON.parse(r.skips_json) as [number, number, SkipReason][]).map(([start, end, reason]) => ({
            start,
            end,
            reason,
          }))
        : [];
      const b: Block = { kind: r.kind, text: r.text, skips };
      if (r.level !== null) b.level = r.level;
      if (r.page !== null) b.page = r.page;
      return b;
    });
  const rows = db.all<{
    block_ord: number;
    start: number;
    end: number;
    kind: SentenceKind;
    speaker_id: string | null;
    confidence: number;
    pause_ms: number;
  }>(
    'SELECT block_ord, start, end, kind, speaker_id, confidence, pause_ms FROM sentences WHERE document_id = ? ORDER BY ord',
    [documentId],
  );
  const sentences = rows.map((r): Sentence => {
    const s: Sentence = { block: r.block_ord, start: r.start, end: r.end, kind: r.kind, pauseMs: r.pause_ms };
    if (r.speaker_id) s.speaker = r.speaker_id;
    return s;
  });
  const chapters = db
    .all<{
      title: string;
      level: number;
      language: string | null;
      block_start: number;
      first_sentence: number;
    }>(
      'SELECT title, level, language, block_start, first_sentence FROM chapters WHERE document_id = ? ORDER BY ord',
      [documentId],
    )
    .map((r) => {
      const c: Chapter & { firstSentence: number } = {
        title: r.title,
        level: r.level,
        blockStart: r.block_start,
        firstSentence: r.first_sentence,
      };
      if (r.language) c.language = r.language;
      return c;
    });
  const characters = listCharacters(db, documentId);
  return { blocks, sentences, confidence: rows.map((r) => r.confidence), chapters, characters };
}

export function setCharacterVoice(
  db: Db,
  documentId: string,
  characterId: string,
  voiceId: string | null,
): void {
  db.run('UPDATE characters SET voice_id = ? WHERE document_id = ? AND id = ?', [
    voiceId,
    documentId,
    characterId,
  ]);
}

/** Remembers Cast's automatic choices (character id → voice) so they stay put for the rest of the book. */
export function saveAutoVoices(db: Db, documentId: string, voices: Readonly<Record<string, string>>): void {
  db.transaction(() => {
    for (const [id, voice] of Object.entries(voices)) {
      db.run('UPDATE characters SET auto_voice_id = ? WHERE document_id = ? AND id = ?', [
        voice,
        documentId,
        id,
      ]);
    }
  });
}

/** Merges `from` into `into` (e.g. "Lizzy" → "Elizabeth"): lines move, aliases combine. */
export function mergeCharacters(db: Db, documentId: string, from: string, into: string): void {
  if (from === into) return;
  db.transaction(() => {
    const a = db.get<{ aliases_json: string; line_count: number }>(
      'SELECT aliases_json, line_count FROM characters WHERE document_id = ? AND id = ?',
      [documentId, from],
    );
    const b = db.get<{ aliases_json: string; line_count: number }>(
      'SELECT aliases_json, line_count FROM characters WHERE document_id = ? AND id = ?',
      [documentId, into],
    );
    if (!a || !b) return;
    const aliases = [
      ...new Set([...(JSON.parse(b.aliases_json) as string[]), ...(JSON.parse(a.aliases_json) as string[])]),
    ];
    db.run('UPDATE characters SET aliases_json = ?, line_count = ? WHERE document_id = ? AND id = ?', [
      JSON.stringify(aliases),
      a.line_count + b.line_count,
      documentId,
      into,
    ]);
    db.run('UPDATE sentences SET speaker_id = ? WHERE document_id = ? AND speaker_id = ?', [
      into,
      documentId,
      from,
    ]);
    db.run('DELETE FROM characters WHERE document_id = ? AND id = ?', [documentId, from]);
  });
}

/** The first sentence at or after block `blockOrd` (a search hit in a heading or caption lands on what follows). */
export function sentenceAtBlock(db: Db, documentId: string, blockOrd: number): number | undefined {
  return db.get<{ ord: number }>(
    'SELECT ord FROM sentences WHERE document_id = ? AND block_ord >= ? ORDER BY ord LIMIT 1',
    [documentId, blockOrd],
  )?.ord;
}
