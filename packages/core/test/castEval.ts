import { analyseCast, findDialogue, NAMED_VOICE_CONFIDENCE } from '../src';
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
  const score: BookScore = { id: book.id, lines: 0, detected: 0, named: 0, voiced: 0, spurious: 0 };
  const anchors: number[] = [];
  let pos = 0;
  for (const [anchor, gold] of book.lines) {
    const i = book.text.indexOf(anchor, pos);
    if (i < 0) throw new Error(`${book.id}: snippet not found: ${anchor}`);
    pos = i + anchor.length;
    anchors.push(i);
    if (!gold) continue;
    score.lines++;
    let block = starts.length - 1;
    while (block > 0 && (starts[block] ?? 0) > i) block--;
    const local = i - (starts[block] ?? 0);
    const a = attributions.find((x) => x.block === block && x.span.start <= local + 1 && local < x.span.end);
    if (!a) continue;
    score.detected++;
    const c = a.speaker ? byId.get(a.speaker) : undefined;
    const names = book.speakers[gold]?.names ?? [];
    if (c && c.aliases.concat(c.name).some((n) => names.some((g) => norm(g) === norm(n)))) {
      score.named++;
      if (a.confidence >= NAMED_VOICE_CONFIDENCE) score.voiced++;
    }
  }
  for (const a of attributions) {
    const from = (starts[a.block] ?? 0) + a.span.start - 1;
    const to = (starts[a.block] ?? 0) + a.span.end;
    if (!anchors.some((x) => x >= from && x < to)) score.spurious++;
  }
  return score;
}
