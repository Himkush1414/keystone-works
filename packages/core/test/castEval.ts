import { analyseCast, findDialogue, NAMED_VOICE_CONFIDENCE, type FixedSpeaker } from '../src';
import type { BookExcerpt } from './fixtures/castBooks';
import type { CastStory } from './fixtures/castCorpus';

export interface CastScore {
  id: string;
  quotes: number;
  /** Quotes given to the right named character. */
  named: number;
  /** Quotes heard in their speaker's voice: each detected speaker maps to the gold speaker most of its lines belong to. */
  consistent: number;
  /** Detected characters, by name. */
  characters: string[];
}

const norm = (s: string) => s.toLowerCase().replace(/[.’']/g, '').replace(/\s+/g, ' ').trim();

/** Runs Cast on a story and compares every quotation with the known speaker. */
export function scoreStory(story: CastStory): CastScore {
  const paragraphs = story.text.split('\n\n');
  const quotes = paragraphs.flatMap((p, block) =>
    findDialogue(p, story.lang).map((d) => ({ block, start: d.start })),
  );
  if (quotes.length !== story.gold.length) {
    throw new Error(`${story.id}: found ${quotes.length} quotes, gold has ${story.gold.length}`);
  }
  const { characters, attributions } = analyseCast(paragraphs, story.lang);
  const byId = new Map(characters.map((c) => [c.id, c]));
  const found = quotes.map((q) => attributions.find((a) => a.block === q.block && a.span.start === q.start));
  const predicted = found.map((a) => a?.speaker);
  // A line only gets its character's own voice above this confidence (voiceFor); below it, the listener hears
  // the generic dialogue voice, so for "voice" it counts as unattributed.
  const voiced = found.map((a) => (a && a.confidence >= NAMED_VOICE_CONFIDENCE ? a.speaker : undefined));

  let named = 0;
  predicted.forEach((p, k) => {
    const c = p ? byId.get(p) : undefined;
    const gold = story.speakers[story.gold[k] ?? ''];
    if (c && gold && c.aliases.concat(c.name).some((a) => gold.names.some((n) => norm(n) === norm(a))))
      named++;
  });

  const votes = new Map<string, Map<string, number>>();
  voiced.forEach((p, k) => {
    if (!p) return;
    const m = votes.get(p) ?? new Map<string, number>();
    m.set(story.gold[k] ?? '', (m.get(story.gold[k] ?? '') ?? 0) + 1);
    votes.set(p, m);
  });
  const mapsTo = new Map([...votes].map(([p, m]) => [p, [...m].sort((a, b) => b[1] - a[1])[0]?.[0]]));
  const consistent = voiced.filter((p, k) => p !== undefined && mapsTo.get(p) === story.gold[k]).length;

  return {
    id: story.id,
    quotes: quotes.length,
    named,
    consistent,
    characters: characters.map((c) => c.name),
  };
}

export interface BookScore {
  id: string;
  /** Gold lines scored (those that are someone's). */
  lines: number;
  /** Lines inside a dialogue span Cast found. */
  detected: number;
  /** Lines given to the right character. */
  named: number;
  /** Right character with confidence enough for their own voice. */
  voiced: number;
  /** Dialogue Cast found where no labelled line is: narration it would read as someone speaking. */
  spurious: number;
  /** Lines that are no one character's (a group, words not said), and how many Cast left without a speaker. */
  nobody: number;
  nobodyRight: number;
  /** Characters matched to a labelled speaker, and how many Cast gave the right gender (unknown counts wrong). */
  genders: number;
  gendersRight: number;
  /** Characters Cast invented: given lines but matching no labelled speaker (a stick, a sleeping dormouse's lines). */
  phantoms: string[];
}

/** Runs Cast on a book excerpt and checks the speaker of every gold line (found by its snippet, in order). */
export function scoreBook(book: BookExcerpt): BookScore {
  const paragraphs = book.text.split('\n\n');
  const starts: number[] = [];
  let at = 0;
  for (const p of paragraphs) {
    starts.push(at);
    at += p.length + 2;
  }
  const { characters, attributions } = analyseCast(paragraphs, book.lang);
  const byId = new Map(characters.map((c) => [c.id, c]));
  const score: BookScore = {
    id: book.id,
    lines: 0,
    detected: 0,
    named: 0,
    voiced: 0,
    spurious: 0,
    nobody: 0,
    nobodyRight: 0,
    genders: 0,
    gendersRight: 0,
    phantoms: [],
  };
  const anchors: number[] = [];
  let pos = 0;
  for (const [anchor, gold] of book.lines) {
    const i = book.text.indexOf(anchor, pos);
    if (i < 0) throw new Error(`${book.id}: snippet not found: ${anchor}`);
    pos = i + anchor.length;
    anchors.push(i);
    let block = starts.length - 1;
    while (block > 0 && (starts[block] ?? 0) > i) block--;
    const local = i - (starts[block] ?? 0);
    const a = attributions.find((x) => x.block === block && x.span.start <= local + 1 && local < x.span.end);
    if (!gold) {
      score.nobody++;
      if (!a?.speaker) score.nobodyRight++;
      continue;
    }
    score.lines++;
    if (!a) continue;
    score.detected++;
    const c = a.speaker ? byId.get(a.speaker) : undefined;
    const names = book.speakers[gold]?.names ?? [];
    if (c && c.aliases.concat(c.name).some((n) => names.some((g) => norm(g) === norm(n)))) {
      score.named++;
      if (a.confidence >= NAMED_VOICE_CONFIDENCE) score.voiced++;
    }
  }
  const goldOf = (c: { name: string; aliases: string[] }) =>
    Object.values(book.speakers).find((g) =>
      c.aliases.concat(c.name).some((n) => g.names.some((x) => norm(x) === norm(n))),
    );
  for (const c of characters) {
    const g = goldOf(c);
    if (!g) {
      if (attributions.some((a) => a.speaker === c.id)) score.phantoms.push(c.name);
      continue;
    }
    score.genders++;
    if (c.gender === g.gender) score.gendersRight++;
  }
  for (const a of attributions) {
    const from = (starts[a.block] ?? 0) + a.span.start - 1;
    const to = (starts[a.block] ?? 0) + a.span.end;
    if (!anchors.some((x) => x >= from && x < to)) score.spurious++;
  }
  return score;
}

/**
 * A listener reading the excerpt in order who taps every wrong speaker: how many lines were wrong, and how
 * many taps fix them all, when Cast runs again after each one with the corrected lines held fixed.
 */
export function tapsToFix(book: BookExcerpt): { wrong: number; taps: number } {
  const paragraphs = book.text.split('\n\n');
  const starts: number[] = [];
  let at = 0;
  for (const p of paragraphs) {
    starts.push(at);
    at += p.length + 2;
  }
  const where: { block: number; local: number; gold: string }[] = [];
  let pos = 0;
  for (const [anchor, who] of book.lines) {
    const i = book.text.indexOf(anchor, pos);
    pos = i + anchor.length;
    if (!who) continue;
    let block = starts.length - 1;
    while (block > 0 && (starts[block] ?? 0) > i) block--;
    where.push({ block, local: i - (starts[block] ?? 0), gold: who });
  }
  const fixed: FixedSpeaker[] = [];
  const run = () => {
    const { characters, attributions } = analyseCast(paragraphs, book.lang, fixed);
    const byId = new Map(characters.map((c) => [c.id, c]));
    return where.map((w) => {
      const a = attributions.find(
        (x) => x.block === w.block && x.span.start <= w.local + 1 && w.local < x.span.end,
      );
      const c = a?.speaker ? byId.get(a.speaker) : undefined;
      const names = book.speakers[w.gold]?.names ?? [];
      const right = !!c && c.aliases.concat(c.name).some((n) => names.some((g) => norm(g) === norm(n)));
      return { a, right };
    });
  };
  let state = run();
  const wrong = state.filter((x) => x.a && !x.right).length;
  let taps = 0;
  for (let k = 0; k < where.length; k++) {
    const x = state[k];
    const w = where[k];
    if (!x?.a || x.right || !w) continue;
    taps++;
    fixed.push({
      block: x.a.block,
      start: x.a.span.start,
      speaker: book.speakers[w.gold]?.names[0] ?? w.gold,
    });
    state = run();
  }
  return { wrong, taps };
}
