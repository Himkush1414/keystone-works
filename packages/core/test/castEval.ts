import { analyseCast, findDialogue, NAMED_VOICE_CONFIDENCE } from '../src';
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
