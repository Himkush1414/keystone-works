#!/usr/bin/env -S node --import tsx
// Renders the website's feature demonstrations, each from the app's own pipeline and voices: one sentence
// in all 31 languages, the three quality levels, Clean Read on and off, the pronunciation dictionary, Cast
// off / on / with the listener's own voices, one line in each possible speaker's voice, Natural against
// emotion processing (from SceneRenderTest's WAVs), and word meanings from the on-device dictionary.
//
// Usage: node --import tsx tooling/scripts/web-demos.mts <engine-dir> <lexicon.db> <scenes-wav-dir>
// Writes apps/web/public/demos/*.mp3 and apps/web/demos/demos.json. Deterministic, like web-samples.mts.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assignVoices,
  buildPdfDocument,
  buildQueue,
  defaultCleanSettings,
  parsePlainText,
  prepareDocument,
  VOICE_CATALOG,
  type CastMode,
  type CleanSettings,
  type DictionaryRule,
  type DocumentDraft,
  type PdfPage,
} from '../../packages/core/src/index.ts';
import { renderMeanings } from './lib/meanings.mts';
import { encodeMp3, loadEngine, readWav, splitLong, trim, type Engine, type Voices } from './lib/render.mts';

const [engineDir, lexiconPath, scenesDir] = process.argv.slice(2);
if (!engineDir || !lexiconPath || !scenesDir) {
  console.error('usage: web-demos.mts <engine-dir> <lexicon.db> <scenes-wav-dir>');
  process.exit(2);
}
const root = new URL('../../', import.meta.url).pathname;
const audioDir = join(root, 'apps/web/public/demos');
mkdirSync(audioDir, { recursive: true });
mkdirSync(join(root, 'apps/web/demos'), { recursive: true });

const STEPS = { live: 6, studio: 8, studioPlus: 16 } as const;
const BASE_RATE = 1.05;
const { engine, voices } = await loadEngine(engineDir);

const voiceOf = (vs: Voices, id: string) => {
  const v = vs.find((x) => x.id === id);
  if (!v) throw new Error(`no voice ${id}`);
  return v;
};

function save(name: string, samples: Float32Array, rate: number): string {
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const k = peak > 0 ? 10 ** (-1 / 20) / peak : 1;
  const out = samples.map((s) => s * k);
  writeFileSync(join(audioDir, `${name}.mp3`), encodeMp3(out, rate));
  return `/demos/${name}.mp3`;
}

/** One sentence straight through the engine (for languages and quality). */
async function line(e: Engine, text: string, lang: string, voice: string, steps: number) {
  const r = await e.synthesize({ text, lang, voice: voiceOf(voices, voice), steps, rate: BASE_RATE });
  return { samples: trim(r.samples, r.sampleRate, true), rate: r.sampleRate };
}

interface Timed {
  text: string;
  start: number;
  end: number;
  speaker?: string;
  voice: string;
}

/** A document through the app's whole pipeline, rendered as the player would; returns audio and timings. */
async function document(
  draft: DocumentDraft,
  lang: string,
  opts: {
    narrator?: string;
    castMode?: CastMode;
    clean?: CleanSettings;
    dictionary?: DictionaryRule[];
    overrides?: Record<string, string>;
    fromPdf?: boolean;
  } = {},
) {
  const doc = prepareDocument(
    { ...draft, meta: { ...draft.meta, language: lang } },
    { fromPdf: !!opts.fromPdf },
  );
  const idOf = (name: string) => doc.characters.find((c) => c.name === name)?.id ?? name;
  const overrides = Object.fromEntries(Object.entries(opts.overrides ?? {}).map(([n, v]) => [idOf(n), v]));
  const assignment = assignVoices(doc.characters, opts.narrator ?? 'F1', VOICE_CATALOG, overrides);
  const queue = buildQueue(
    { ...doc, blocks: doc.draft.blocks, chapters: doc.draft.chapters, language: doc.language },
    {
      clean: opts.clean ?? defaultCleanSettings(draft.meta.kind, !!opts.fromPdf),
      assignment,
      castMode: opts.castMode ?? 'full',
      voiceProcessing: false,
      ...(opts.dictionary ? { dictionary: opts.dictionary } : {}),
    },
  );
  let rate = 44100;
  const chunks: Float32Array[] = [];
  let length = 0;
  const push = (a: Float32Array) => {
    chunks.push(a);
    length += a.length;
  };
  const names = new Map(doc.characters.map((c) => [c.id, c.name]));
  const timed: Timed[] = [];
  for (const seg of queue) {
    const start = (length / rate) * 1000;
    if (seg.text.trim()) {
      const pieces = splitLong(seg.text);
      for (const [k, piece] of pieces.entries()) {
        const r = await engine.synthesize({
          text: piece.text,
          lang: seg.lang,
          voice: voiceOf(voices, seg.voice),
          steps: STEPS.studioPlus,
          rate: BASE_RATE * (seg.rate ?? 1),
        });
        rate = r.sampleRate;
        const audio = trim(r.samples, rate, !!seg.release && k === pieces.length - 1);
        const gain = 10 ** ((seg.gainDb ?? 0) / 20);
        if (gain !== 1) for (let i = 0; i < audio.length; i++) audio[i] = (audio[i] ?? 0) * gain;
        push(audio);
        if (piece.gapMs) push(new Float32Array(Math.round((rate * piece.gapMs) / 1000)));
      }
      const s = doc.sentences[seg.i];
      const block = s ? doc.draft.blocks[s.block] : undefined;
      const speaker = s?.speaker ? names.get(s.speaker) : undefined;
      timed.push({
        text: s && block ? block.text.slice(s.start, s.end) : seg.text,
        start: Math.round(start),
        end: Math.round((length / rate) * 1000),
        voice: seg.voice,
        ...(s?.kind === 'dialogue' && speaker ? { speaker } : {}),
      });
    }
    push(new Float32Array(Math.round((rate * seg.pauseMs) / 1000)));
  }
  const all = new Float32Array(length);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.length;
  }
  return { samples: all, rate, timed, spoken: queue.map((q) => q.text).filter(Boolean) };
}

// ── 31 languages: one sentence each, in the voices taking turns ─────────────────────────────────────────
// prettier-ignore
const LANGUAGES: [code: string, name: string, text: string][] = [
  ['en', 'English', 'Good evening. Shall I read you a story?'],
  ['hi', 'हिन्दी', 'शुभ संध्या। क्या मैं आपको एक कहानी सुनाऊँ?'],
  ['es', 'Español', 'Buenas noches. ¿Te leo un cuento?'],
  ['fr', 'Français', 'Bonsoir. Je vous lis une histoire ?'],
  ['de', 'Deutsch', 'Guten Abend. Soll ich dir eine Geschichte vorlesen?'],
  ['pt', 'Português', 'Boa noite. Quer que eu leia uma história?'],
  ['it', 'Italiano', 'Buonasera. Ti leggo una storia?'],
  ['nl', 'Nederlands', 'Goedenavond. Zal ik je een verhaal voorlezen?'],
  ['pl', 'Polski', 'Dobry wieczór. Czy przeczytać ci opowieść?'],
  ['ru', 'Русский', 'Добрый вечер. Прочитать вам историю?'],
  ['uk', 'Українська', 'Добрий вечір. Прочитати вам історію?'],
  ['tr', 'Türkçe', 'İyi akşamlar. Size bir hikâye okuyayım mı?'],
  ['ar', 'العربية', 'مساء الخير. هل أقرأ لك قصة؟'],
  ['ja', '日本語', 'こんばんは。お話をひとつ読みましょうか？'],
  ['ko', '한국어', '좋은 저녁이에요. 이야기 하나 읽어 드릴까요?'],
  ['vi', 'Tiếng Việt', 'Chào buổi tối. Tôi đọc cho bạn một câu chuyện nhé?'],
  ['id', 'Bahasa Indonesia', 'Selamat malam. Mau saya bacakan sebuah cerita?'],
  ['sv', 'Svenska', 'God kväll. Ska jag läsa en berättelse för dig?'],
  ['da', 'Dansk', 'God aften. Skal jeg læse en historie for dig?'],
  ['fi', 'Suomi', 'Hyvää iltaa. Luenko sinulle tarinan?'],
  ['cs', 'Čeština', 'Dobrý večer. Mám vám přečíst příběh?'],
  ['sk', 'Slovenčina', 'Dobrý večer. Mám vám prečítať príbeh?'],
  ['sl', 'Slovenščina', 'Dober večer. Vam preberem zgodbo?'],
  ['hr', 'Hrvatski', 'Dobra večer. Da vam pročitam priču?'],
  ['hu', 'Magyar', 'Jó estét. Felolvassak egy történetet?'],
  ['ro', 'Română', 'Bună seara. Să vă citesc o poveste?'],
  ['bg', 'Български', 'Добър вечер. Да ви прочета ли една история?'],
  ['el', 'Ελληνικά', 'Καλησπέρα. Να σου διαβάσω μια ιστορία;'],
  ['et', 'Eesti', 'Tere õhtust. Kas ma loen sulle ühe loo ette?'],
  ['lv', 'Latviešu', 'Labvakar. Vai lai es jums izlasu stāstu?'],
  ['lt', 'Lietuvių', 'Labas vakaras. Ar paskaityti jums istoriją?'],
];
const TURN_VOICES = ['F1', 'M2', 'F5', 'M1', 'F2', 'M3', 'F3', 'M4', 'F4', 'M5'];
const languages = [];
for (const [i, [code, name, text]] of LANGUAGES.entries()) {
  const voice = TURN_VOICES[i % TURN_VOICES.length] ?? 'F1';
  const r = await line(engine, text, code, voice, STEPS.studioPlus);
  languages.push({ code, name, text, voice, audio: save(`lang-${code}`, r.samples, r.rate) });
}
console.log(`languages: ${languages.length}`);

// ── Quality levels: the same sentence at Live, Studio and Studio+ ───────────────────────────────────────
const QUALITY_TEXT = 'The lamp was still burning when she turned the last page, and the rain had stopped.';
const quality = [];
for (const [level, steps] of Object.entries(STEPS)) {
  const r = await line(engine, QUALITY_TEXT, 'en', 'F1', steps);
  quality.push({ level, steps, audio: save(`quality-${level}`, r.samples, r.rate) });
}

// ── Clean Read: a journal page as a PDF, read with Clean Read on and off ────────────────────────────────
const pdfLine = (text: string, y: number, size = 11) => ({ text, x: 72, y, width: 460, size });
const journal = (n: number): PdfPage => ({
  width: 612,
  height: 792,
  lines: [
    pdfLine('JOURNAL OF EVERYDAY READING · VOL. 12', 36, 8),
    pdfLine(
      n === 1
        ? 'Reading aloud changes how we remember a text.14 Listeners in the study recalled more of what they'
        : n === 2
          ? 'Most of them said they would listen again (Ortiz and Rao, 2019).'
          : 'The effect was strongest for long and difficult texts.',
      200,
    ),
    ...(n === 1
      ? [
          pdfLine('heard when the voice paused at the ends of sen-', 214),
          pdfLine('tences (Ortiz and Rao, 2019).', 228),
        ]
      : []),
    pdfLine(String(36 + n), 760, 9),
  ],
});
const pages = [1, 2, 3].map(journal);
const pdf = buildPdfDocument(pages, { title: 'Journal' });
const off: CleanSettings = Object.fromEntries(
  Object.keys(defaultCleanSettings('document', true)).map((k) => [k, false]),
) as unknown as CleanSettings;
const cleanOn = await document(pdf, 'en', { fromPdf: true });
const cleanOff = await document(pdf, 'en', { fromPdf: true, clean: off });
const cleanRead = {
  on: { audio: save('clean-on', cleanOn.samples, cleanOn.rate), spoken: cleanOn.spoken },
  off: { audio: save('clean-off', cleanOff.samples, cleanOff.rate), spoken: cleanOff.spoken },
  page: pages[0]?.lines.map((l) => l.text) ?? [],
};
console.log(`clean read: on "${cleanOn.spoken.join(' ')}"\n            off "${cleanOff.spoken.join(' ')}"`);

// ── Pronunciation dictionary ────────────────────────────────────────────────────────────────────────────
const PRON_TEXT = 'Hermione waited for Siobhan at the station in Leicester.';
const RULES: DictionaryRule[] = [
  { match: 'Hermione', sayAs: 'Her-my-oh-nee', wholeWord: true, caseSensitive: false },
  { match: 'Siobhan', sayAs: 'Shi-vawn', wholeWord: true, caseSensitive: false },
  { match: 'Leicester', sayAs: 'Lester', wholeWord: true, caseSensitive: false },
];
const pronDraft = parsePlainText(PRON_TEXT, 'Names', 'document');
const pronBefore = await document(pronDraft, 'en');
const pronAfter = await document(pronDraft, 'en', { dictionary: RULES });
const pronunciation = {
  text: PRON_TEXT,
  rules: RULES.map((r) => ({ match: r.match, sayAs: r.sayAs })),
  before: save('pron-before', pronBefore.samples, pronBefore.rate),
  after: save('pron-after', pronAfter.samples, pronAfter.rate),
};

// ── Cast: off, on, and with the listener's own voices ───────────────────────────────────────────────────
const CAST_TEXT = [
  '“My dear Mr. Bennet,” said his lady to him one day, “have you heard that Netherfield Park is let at last?”',
  'Mr. Bennet replied that he had not.',
  '“But it is,” returned she; “for Mrs. Long has just been here, and she told me all about it.”',
  'Mr. Bennet made no answer.',
  '“Do you not want to know who has taken it?” cried his wife impatiently.',
  '“You want to tell me, and I have no objection to hearing it.”',
].join('\n\n');
const castDraft = parsePlainText(CAST_TEXT, 'Pride and Prejudice', 'book');
const castRuns = {
  off: await document(castDraft, 'en', { castMode: 'off' }),
  on: await document(castDraft, 'en'),
  yours: await document(castDraft, 'en', { overrides: { 'Mrs. Bennet': 'F3', 'Mr. Bennet': 'M4' } }),
};
const cast = Object.fromEntries(
  Object.entries(castRuns).map(([k, r]) => [
    k,
    { audio: save(`cast-${k}`, r.samples, r.rate), lines: r.timed },
  ]),
);

// ── Tap to fix: one line in each possible speaker's voice ───────────────────────────────────────────────
const FIX_LINE = 'Your hair wants cutting.';
const fix = [];
for (const [speaker, voice] of [
  ['Alice', 'F5'],
  ['the Hatter', 'M3'],
  ['the March Hare', 'M2'],
] as const) {
  const r = await line(engine, FIX_LINE, 'en', voice, STEPS.studioPlus);
  fix.push({ speaker, voice, audio: save(`fix-${voice}`, r.samples, r.rate) });
}

// ── Emotion processing: SceneRenderTest's argument scene, Natural against processed ─────────────────────
const natural = readWav(join(scenesDir, 'en-argument~natural.wav'));
const processed = readWav(join(scenesDir, 'en-argument.wav'));
const emotion = {
  text: [
    '“You promised me you would be there,” said Maya.',
    '“I said I would try,” Ravi said. “That is not the same thing, and you know—”',
    '“It is exactly the same thing!” Maya shouted.',
    '“Both of you, stop it,” said Grandmother quietly. “Sit down, both of you.”',
  ],
  natural: save('emotion-natural', natural.samples, natural.rate),
  processed: save('emotion-processed', processed.samples, processed.rate),
};

// ── Word meanings, from the on-device dictionary, chosen for their passage ──────────────────────────────
const meanings = renderMeanings(lexiconPath);

const demos = {
  languages,
  quality,
  qualityText: QUALITY_TEXT,
  cleanRead,
  pronunciation,
  cast,
  fixLine: FIX_LINE,
  fix,
  emotion,
  meanings,
};
writeFileSync(join(root, 'apps/web/demos/demos.json'), `${JSON.stringify(demos, null, 2)}\n`);
console.log('demos written');
