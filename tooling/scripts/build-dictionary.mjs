#!/usr/bin/env node
// Builds the on-device dictionary behind "What does this word mean here?" as one SQLite file:
//   en      English senses from WordNet 3.1 (Princeton WordNet licence), most frequent first
//   hi      Hindi entries with English glosses from English Wiktionary via kaikki.org (CC BY-SA 4.0)
//   hi_form inflected Hindi forms → headword
//   en_hi   English word → Hindi equivalents, from the Hindi glosses
// Usage: node tooling/scripts/build-dictionary.mjs --wordnet <dict dir> --hindi <kaikki Hindi .jsonl> --out <file.db>
import { readFileSync, rmSync, statSync, createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { DatabaseSync } from 'node:sqlite';

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0 || !process.argv[i + 1]) throw new Error(`missing --${name}`);
  return process.argv[i + 1];
};
const wordnetDir = arg('wordnet');
const hindiPath = arg('hindi');
const out = arg('out');

const MAX_SENSES = 4;
const MAX_SYNONYMS = 4;

rmSync(out, { force: true });
const db = new DatabaseSync(out);
db.exec(`
  PRAGMA journal_mode = OFF;
  PRAGMA page_size = 4096;
  CREATE TABLE en (word TEXT NOT NULL, pos TEXT NOT NULL, rank INTEGER NOT NULL, gloss TEXT NOT NULL, example TEXT, syn TEXT, tagged INTEGER NOT NULL);
  CREATE TABLE hi (word TEXT NOT NULL, pos TEXT NOT NULL, rank INTEGER NOT NULL, gloss TEXT NOT NULL, roman TEXT, syn TEXT, example TEXT, example_en TEXT);
  CREATE TABLE hi_form (form TEXT NOT NULL, word TEXT NOT NULL);
  CREATE TABLE en_hi (en TEXT NOT NULL, hi TEXT NOT NULL, rank INTEGER NOT NULL);
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);

// ── English: WordNet ──
const POS = { noun: 'n', verb: 'v', adj: 'a', adv: 'r' };
let enRows = 0;
const insertEn = db.prepare('INSERT INTO en VALUES (?, ?, ?, ?, ?, ?, ?)');
db.exec('BEGIN');
for (const [file, pos] of Object.entries(POS)) {
  // data.<pos>: offset → [words, gloss]
  const synsets = new Map();
  for (const line of readFileSync(`${wordnetDir}/data.${file}`, 'utf8').split('\n')) {
    if (!line || line.startsWith(' ')) continue;
    const [head, gloss = ''] = line.split(' | ');
    const parts = head.split(' ');
    const count = parseInt(parts[3] ?? '0', 16);
    const words = [];
    for (let k = 0; k < count; k++)
      words.push((parts[4 + k * 2] ?? '').replace(/\(.*\)$/, '').replace(/_/g, ' '));
    synsets.set(parts[0], { words, gloss: gloss.trim() });
  }
  // index.<pos>: lemma → synset offsets, most frequent sense first
  for (const line of readFileSync(`${wordnetDir}/index.${file}`, 'utf8').split('\n')) {
    if (!line || line.startsWith(' ')) continue;
    const parts = line.trim().split(/\s+/);
    const lemma = parts[0] ?? '';
    if (lemma.includes('_')) continue; // single words only; collocations are rarely what a listener asks about
    // lemma pos synset_cnt p_cnt [ptr…] sense_cnt tagsense_cnt offsets…: tagsense_cnt says how often this
    // part of speech was seen in real text (let: verb 10s of times, noun never).
    const pointers = parseInt(parts[3] ?? '0', 10);
    const tagged = parseInt(parts[5 + pointers] ?? '0', 10) || 0;
    const offsets = parts
      .slice(6 + pointers)
      .filter((p) => /^\d{8}$/.test(p))
      .slice(0, MAX_SENSES);
    offsets.forEach((offset, rank) => {
      const s = synsets.get(offset);
      if (!s) return;
      const definition = s.gloss.split(/;\s*"/)[0]?.replace(/;\s*$/, '').trim() ?? '';
      const example = s.gloss.match(/"([^"]+)"/)?.[1] ?? null;
      const syn =
        s.words
          .filter((w) => w.toLowerCase() !== lemma)
          .slice(0, MAX_SYNONYMS)
          .join('|') || null;
      if (!definition) return;
      insertEn.run(lemma, pos, rank, definition, example, syn, tagged);
      enRows++;
    });
  }
}
db.exec('COMMIT');

// ── Hindi: Wiktionary via kaikki.org ──
const KEEP_POS = new Set([
  'noun',
  'verb',
  'adj',
  'adv',
  'pron',
  'postp',
  'conj',
  'intj',
  'num',
  'particle',
  'det',
  'name',
]);
const SKIP_FORM_TAGS = new Set(['romanization', 'table-tags', 'inflection-template', 'class', 'Urdu']);
const insertHi = db.prepare('INSERT INTO hi VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
const insertForm = db.prepare('INSERT INTO hi_form VALUES (?, ?)');
const insertEnHi = db.prepare('INSERT INTO en_hi VALUES (?, ?, ?)');
const seenForm = new Set();
const seenEnHi = new Set();
let hiRows = 0;
db.exec('BEGIN');
const lines = createInterface({ input: createReadStream(hindiPath, 'utf8'), crlfDelay: Infinity });
for await (const line of lines) {
  if (!line) continue;
  const e = JSON.parse(line);
  const word = e.word;
  // Single words only: a listener asks about one word, and phrases would multiply the forms table.
  if (
    typeof word !== 'string' ||
    word.includes(' ') ||
    !/\p{Script=Devanagari}/u.test(word) ||
    !KEEP_POS.has(e.pos)
  )
    continue;
  const roman = e.forms?.find((f) => f.tags?.includes('romanization'))?.form ?? null;
  const syn =
    [...(e.synonyms ?? []), ...(e.senses ?? []).flatMap((s) => s.synonyms ?? [])]
      .map((s) => s.word)
      .filter((w, k, all) => w && w !== word && all.indexOf(w) === k)
      .slice(0, MAX_SYNONYMS)
      .join('|') || null;
  let rank = 0;
  for (const sense of e.senses ?? []) {
    const gloss = sense.glosses?.at(-1);
    if (!gloss || sense.tags?.includes('form-of') || rank >= MAX_SENSES) continue;
    const ex = sense.examples?.find((x) => x.text && (x.translation || x.english));
    insertHi.run(
      word,
      e.pos,
      rank,
      gloss,
      roman,
      syn,
      ex?.text ?? null,
      ex?.translation ?? ex?.english ?? null,
    );
    hiRows++;
    // Short glosses ("fortune", "luck, fate") give the Hindi for an English word.
    const plain = gloss.replace(/\([^)]*\)/g, '').trim();
    const alts = plain.split(/[,;]\s*/);
    alts.forEach((alt, k) => {
      const en = alt
        .trim()
        .toLowerCase()
        .replace(/^(to|a|an|the) /, '');
      if (!en || en.split(' ').length > 2 || !/^[a-z][a-z' -]*$/.test(en)) return;
      const key = `${en}|${word}`;
      if (seenEnHi.has(key)) return;
      seenEnHi.add(key);
      // A gloss that is exactly the English word ranks first; the first sense before later ones.
      insertEnHi.run(en, word, rank * 10 + k + alts.length - 1);
    });
    rank++;
  }
  if (rank === 0) continue;
  for (const f of e.forms ?? []) {
    if (!f.form || f.form === word || f.form.includes(' ') || f.tags?.some((t) => SKIP_FORM_TAGS.has(t)))
      continue;
    if (!/\p{Script=Devanagari}/u.test(f.form)) continue;
    const key = `${f.form}|${word}`;
    if (seenForm.has(key)) continue;
    seenForm.add(key);
    insertForm.run(f.form, word);
  }
}
db.exec('COMMIT');

const meta = db.prepare('INSERT INTO meta VALUES (?, ?)');
meta.run('version', '1');
meta.run('sources', 'WordNet 3.1 (Princeton University); English Wiktionary via kaikki.org (CC BY-SA 4.0)');
db.exec(`
  CREATE INDEX en_word ON en (word);
  CREATE INDEX hi_word ON hi (word);
  CREATE INDEX hi_form_form ON hi_form (form);
  CREATE INDEX en_hi_en ON en_hi (en);
  VACUUM;
`);
db.close();
console.log(
  `dictionary: ${enRows} English senses, ${hiRows} Hindi senses, ${seenForm.size} Hindi forms, ${seenEnHi.size} en→hi; ` +
    `${(statSync(out).size / 1e6).toFixed(1)} MB → ${out}`,
);
