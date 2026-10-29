// Word meanings for the website's demo, from the on-device dictionary (lexicon.db) and the app's own
// explain(): each passage's words, with the sense picked for that passage. No voices needed.
import { DatabaseSync } from 'node:sqlite';
import { explain, lookupRequest, type LookupRows } from '../../../packages/core/src/index.ts';

const PASSAGES = [
  {
    lang: 'en',
    text: 'It is a truth universally acknowledged, that a single man in possession of a good fortune must be in want of a wife.',
    words: ['truth', 'universally', 'acknowledged', 'possession', 'fortune', 'want'],
  },
  {
    lang: 'hi',
    text: 'कितना मनोहर, कितना सुहावना प्रभात है। वृक्षों पर कुछ अजीब हरियाली है। आज का सूर्य कितना शीतल है।',
    words: ['मनोहर', 'प्रभात', 'हरियाली', 'सूर्य', 'शीतल'],
  },
];

export function renderMeanings(lexiconPath: string) {
  const db = new DatabaseSync(lexiconPath, { readOnly: true });
  const inList = (n: number) => Array.from({ length: n }, () => '?').join(',');
  function rowsFor(word: string): LookupRows {
    const req = lookupRequest(word);
    if (!req) return { en: [], hi: [], enHi: [] };
    const q = (sql: string, args: string[]) =>
      args.length ? (db.prepare(sql.replace('%s', inList(args.length))).all(...args) as never[]) : [];
    const en = q(
      'SELECT word, pos, rank, gloss, example, syn, tagged FROM en WHERE word IN (%s) ORDER BY word, pos, rank',
      req.en,
    );
    const hiForms = q('SELECT form, word FROM hi_form WHERE form IN (%s)', req.hi) as {
      form: string;
      word: string;
    }[];
    const hiWords = [...new Set([...req.hi, ...hiForms.map((f) => f.word)])];
    const hi = q(
      'SELECT word, pos, rank, gloss, roman, syn, example, example_en AS exampleEn FROM hi WHERE word IN (%s) ORDER BY word, rank',
      hiWords,
    );
    const synonyms = (en as { syn?: string | null }[]).flatMap((r) => (r.syn ?? '').split('|'));
    const lemmas = [...new Set([...req.en, ...synonyms].map((w) => w.toLowerCase()).filter(Boolean))].slice(
      0,
      50,
    );
    const enHi = q(
      'SELECT e.en, e.hi, e.rank, h.gloss FROM en_hi e JOIN hi h ON h.word = e.hi AND h.rank = 0 WHERE e.en IN (%s) ORDER BY e.rank LIMIT 60',
      lemmas,
    );
    return { en, hi, enHi, hiForms } as LookupRows;
  }
  const meanings = PASSAGES.map((p) => ({
    ...p,
    meanings: Object.fromEntries(
      p.words.map((w) => {
        const m = explain(w, p.text, rowsFor(w));
        return [
          w,
          m
            ? {
                lemma: m.lemma,
                pos: m.pos ?? null,
                definition: m.definition,
                hindi: m.hindi.slice(0, 3),
                roman: m.roman ?? null,
              }
            : null,
        ];
      }),
    ),
  }));
  db.close();
  for (const p of meanings)
    for (const [w, m] of Object.entries(p.meanings)) console.log(`meaning ${w}: ${m?.definition ?? '—'}`);
  return meanings;
}
