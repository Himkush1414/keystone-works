import { CAST_VERSION, recastSpeakers, speakerSpanOf } from '@lamplight/core';
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
import { getItem, updateSettings, type DocumentSettings } from './library';

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
      emphasis_json: string | null;
    }>(
      'SELECT kind, level, page, text, skips_json, emphasis_json FROM blocks WHERE document_id = ? ORDER BY ord',
      [documentId],
    )
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
      if (r.emphasis_json) b.emphasis = JSON.parse(r.emphasis_json) as [number, number][];
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

/**
 * The listener says who speaks sentence `ord` (a character's id, or null for no one in particular). The
 * correction is kept with the document, Cast runs again with every correction held fixed so the turns after
 * it follow, and the sentences and characters are updated; each character keeps the voice chosen for it.
 * Returns false when the sentence isn't in a quotation Cast can pin.
 */
export function correctSpeaker(db: Db, documentId: string, ord: number, characterId: string | null): boolean {
  const item = getItem(db, documentId);
  if (!item) return false;
  const content = loadContent(db, documentId);
  const sentence = content.sentences[ord];
  const pin = sentence ? speakerSpanOf(content.blocks, sentence, item.language) : undefined;
  if (!pin) return false;
  const name =
    characterId === null ? null : (content.characters.find((c) => c.id === characterId)?.name ?? null);
  if (characterId !== null && name === null) return false;
  const fixes = (item.settings.speakerFixes ?? []).filter(
    (f) => f.block !== pin.block || f.start !== pin.start,
  );
  fixes.push({ ...pin, speaker: name });
  applyRecast(db, documentId, item.language, content, fixes);
  return true;
}

/**
 * Runs Cast again over a stored document with `fixes` held fixed and saves the result: each sentence's
 * speaker and confidence, and the characters (each keeps the voice chosen for it; one who no longer speaks
 * keeps its row with no lines). Records the fixes and the Cast version that made the result.
 */
function applyRecast(
  db: Db,
  documentId: string,
  language: string,
  content: DocumentContent,
  fixes: NonNullable<DocumentSettings['speakerFixes']>,
): void {
  const recast = recastSpeakers(content.blocks, content.sentences, language, fixes);
  db.transaction(() => {
    recast.speakers.forEach((speaker, i) => {
      const s = content.sentences[i];
      if (!s || s.kind !== 'dialogue') return;
      db.run('UPDATE sentences SET speaker_id = ?, confidence = ? WHERE document_id = ? AND ord = ?', [
        speaker ?? null,
        recast.confidence[i] ?? 0,
        documentId,
        i,
      ]);
    });
    const known = new Set(content.characters.map((c) => c.id));
    for (const c of recast.characters) {
      if (known.has(c.id)) {
        db.run(
          'UPDATE characters SET name = ?, aliases_json = ?, gender = ?, line_count = ?, age = ?, temperament = ? WHERE document_id = ? AND id = ?',
          [
            c.name,
            JSON.stringify(c.aliases),
            c.gender ?? null,
            c.lines,
            c.age ?? null,
            c.temperament ?? null,
            documentId,
            c.id,
          ],
        );
      } else {
        db.run(
          'INSERT INTO characters (document_id, id, name, aliases_json, gender, line_count, age, temperament) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [
            documentId,
            c.id,
            c.name,
            JSON.stringify(c.aliases),
            c.gender ?? null,
            c.lines,
            c.age ?? null,
            c.temperament ?? null,
          ],
        );
      }
    }
    // Characters who no longer speak keep their row (and any voice chosen for them) with no lines.
    const speaking = new Set(recast.characters.map((c) => c.id));
    for (const id of known) {
      if (!speaking.has(id))
        db.run('UPDATE characters SET line_count = 0 WHERE document_id = ? AND id = ?', [documentId, id]);
    }
    updateSettings(db, documentId, { speakerFixes: fixes, castVersion: CAST_VERSION });
  });
}

/**
 * A document Cast analysed with an older version is analysed again, the listener's corrections held fixed.
 * Returns true when it was.
 */
export function refreshCast(db: Db, documentId: string): boolean {
  const item = getItem(db, documentId);
  if (!item || item.status !== 'ready') return false;
  if ((item.settings.castVersion ?? 0) >= CAST_VERSION) return false;
  applyRecast(db, documentId, item.language, loadContent(db, documentId), item.settings.speakerFixes ?? []);
  return true;
}

/** Who speaks each sentence, in order (undefined for narration and dialogue nobody was given). */
export function loadSpeakers(db: Db, documentId: string): (string | undefined)[] {
  return db
    .all<{ speaker_id: string | null }>(
      'SELECT speaker_id FROM sentences WHERE document_id = ? ORDER BY ord',
      [documentId],
    )
    .map((r) => r.speaker_id ?? undefined);
}
