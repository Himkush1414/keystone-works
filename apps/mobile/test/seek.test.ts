import { parsePlainText, prepareDocument } from '@lamplight/core';
import { describe, expect, it } from 'vitest';
import { createDocument, getItem, saveContent, updateSettings } from '../src/data/library';
import { loadContent } from '../src/data/content';
import { readAlongBlocks } from '../src/player/readAlong';
import { cleanSettingsFor, planSession, startDocument, type SessionSettings } from '../src/player/session';
import { createPlayerStore } from '../src/player/store';
import { testDb } from './nodeDb';

const SETTINGS: SessionSettings = {
  castMode: 'full',
  quality: 'auto',
  defaultSpeed: 1,
  voices: {},
  speakUrls: false,
  rewindOnResume: true,
  expressive: true,
  breaths: true,
};

const ENGLISH = [
  'Chapter One',
  'The lamp was lit [12]. She read aloud, see https://example.com/notes for more. Then she stopped.',
  'Chapter Two',
  '“Who is there?” asked Anna (Smith 2019). Nobody answered. The house was quiet.',
].join('\n\n');

const HINDI = [
  'पहला अध्याय',
  'रमज़ान के पूरे तीस रोज़ के बाद आज ईद आई है। कितना मनोहर प्रभात है। गाँव में कितनी हलचल है।',
  'दूसरा अध्याय',
  'हामिद ने कहा, "This is my favourite story." फिर वह हँसा। अमीना घर पर थी।',
].join('\n\n');

function seed(text: string, language?: string) {
  const db = testDb();
  const id = createDocument(db, { kind: 'book', title: 'Seek', source: 'file' });
  saveContent(db, id, prepareDocument(parsePlainText(text, 'Seek', 'book'), language ? { language } : {}));
  return { db, id };
}

/** Every sentence a listener can tap, with the text shown for it. */
function tappable(db: ReturnType<typeof testDb>, id: string) {
  const item = getItem(db, id);
  if (!item) throw new Error('missing item');
  const content = loadContent(db, id);
  const clean = cleanSettingsFor(item, content, SETTINGS.speakUrls);
  return readAlongBlocks(content.blocks, content.sentences, clean).flatMap((b) =>
    b.runs
      .filter((r) => r.sentence !== null && !r.skipped)
      .map((r) => ({ sentence: r.sentence as number, shown: b.text.slice(r.start, r.end) })),
  );
}

const words = (s: string) => s.toLocaleLowerCase().match(/[\p{L}\p{M}]+/gu) ?? [];

describe('tapping a sentence', () => {
  it.each([
    ['English with Clean Read skipping citations and links', ENGLISH, undefined],
    ['Hindi with an English line inside', HINDI, 'hi'],
  ])('%s: every tap lands on the queue segment the engine plays for it', (_, text, language) => {
    const { db, id } = seed(text, language);
    const { queue } = planSession(db, id, SETTINGS);
    const taps = tappable(db, id);
    expect(taps.length).toBeGreaterThan(4);
    for (const { sentence, shown } of taps) {
      const segment = queue.segments[sentence];
      expect(segment?.i, shown).toBe(sentence);
      // The spoken text of that segment is the tapped sentence: its first shown word is said.
      const first = words(shown)[0];
      if (first) expect(words(segment?.text ?? ''), shown).toContain(first);
    }
  });

  it('never offers the skipped part of a sentence as its own tap target', () => {
    const { db, id } = seed(ENGLISH);
    const shown = tappable(db, id).map((t) => t.shown).join(' ');
    expect(shown).not.toContain('https://');
  });

  it('starts a book that is not loaded at the tapped sentence and plays it', async () => {
    const { db, id } = seed(ENGLISH);
    updateSettings(db, id, { castMode: 'off' });
    const calls: string[] = [];
    const plan = await startDocument(
      {
        db,
        store: createPlayerStore(),
        engine: {
          loadQueue: async (_path, start) => void calls.push(`load@${start}`),
          play: async () => void calls.push('play'),
        },
        writeQueue: async () => '/queue.json',
      },
      id,
      SETTINGS,
      { autoplay: true, at: 3 },
    );
    expect(plan.startIndex).toBe(3);
    expect(calls).toEqual(['load@3', 'play']);
  });
});
