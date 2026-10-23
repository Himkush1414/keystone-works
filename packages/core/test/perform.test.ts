import { describe, expect, it } from 'vitest';
import { findDialogue } from '../src/cast/dialogue';
import { cueIn, cueInLine, type Emotion } from '../src/perform/cues';
import {
  BEAT,
  BREATH_MS,
  deliveryOf,
  perform,
  prosodyFor,
  SCENE_BREAK_MS,
  type PlannedLine,
} from '../src/perform/plan';
import { buildQueue, prepareDocument } from '../src/pipeline';
import { parsePlainText } from '../src/import/text';
import { assignVoices } from '../src/cast/voices';
import { VOICE_CATALOG } from '../src/cast/catalog';
import { defaultCleanSettings } from '../src/clean/detect';

/** Lines with the delivery a reader would give them; the first quotation in each is scored. */
const LABELLED: [lang: string, text: string, emotion: Emotion][] = [
  ['en', '“Don’t move,” she whispered.', 'whisper'],
  ['en', '“Get out of my house!” he shouted.', 'shout'],
  ['en', '“You lied to me,” Mara snapped.', 'angry'],
  ['en', '“We won!” Leo laughed.', 'excited'],
  ['en', '“He’s gone,” she said sadly.', 'sad'],
  ['en', '“W-what was that?” Tim stammered.', 'fear'],
  ['en', '“Sleep now, little one,” Mother said softly.', 'tender'],
  ['en', '“Sit down,” said the captain calmly.', 'calm'],
  ['en', '“The train leaves at six,” said Ana.', 'neutral'],
  ['en', '“STOP!” cried Jo.', 'shout'],
  ['hi', '“चुप रहो,” वह फुसफुसाई।', 'whisper'],
  ['hi', '“बाहर निकलो!” पिताजी चिल्लाए।', 'shout'],
  ['hi', '“यह क्या किया तुमने?” माँ ने गुस्से से पूछा।', 'angry'],
  ['hi', '“हम जीत गए!” अनु हँसकर बोली।', 'excited'],
  ['hi', '“वह चला गया,” सीमा रोते हुए बोली।', 'sad'],
  ['hi', '“सो जाओ बेटा,” दादी ने प्यार से कहा।', 'tender'],
  ['hi', '“कल स्कूल है,” रोहन ने कहा।', 'neutral'],
  ['hi', '“मुझे डर लग रहा है,” वह काँपते हुए बोली।', 'fear'],
  ['hi', '“OK, chalo,” Neha ne kaha.', 'neutral'],
  ['hi', '"Chup raho," woh phusphusayi.', 'whisper'],
  ['hi', '"Bahar niklo!" Papa chillaye.', 'shout'],
  ['hi', '"Yeh kya kiya?" Mummy ne gusse se poocha.', 'angry'],
  ['hi', '"Hum jeet gaye!" Priya hanste hue boli.', 'excited'],
  ['hi', '"So jao beta," Dadi ne pyaar se kaha.', 'tender'],
];

/** Written after the cues were final and measured once (2026-10-23); never tuned on. */
const FRESH_LABELLED: [lang: string, text: string, emotion: Emotion][] = [
  ['en', '“Keep your voice down,” Ellen murmured.', 'whisper'],
  ['en', '“Run!” yelled the boy.', 'shout'],
  ['en', '“That is enough,” Father growled.', 'angry'],
  ['en', '“I got the job!” Priya said happily.', 'excited'],
  ['en', '“I miss her,” he sighed.', 'sad'],
  ['en', '“Is somebody in here?” she asked nervously.', 'fear'],
  ['en', '“There, there,” Gran said gently.', 'tender'],
  ['en', '“Pass the salt,” said Oliver.', 'neutral'],
  ['hi', '“धीरे बोलो,” वह फुसफुसाया।', 'whisper'],
  ['hi', '“निकल जाओ यहाँ से!” दादा गरजे।', 'angry'],
  ['hi', '“मैं पास हो गई!” नेहा खुशी से बोली।', 'excited'],
  ['hi', '“वह अब नहीं आएगा,” माँ उदास होकर बोलीं।', 'sad'],
  ['hi', '"Darwaza band karo," Rahul ne kaha.', 'neutral'],
  ['hi', '"Mujhe chhod do!" woh cheekhi.', 'shout'],
  ['hi', '"Ro mat," Nani ne pyar se kaha.', 'tender'],
  ['hi', '"Kaun hai wahan?" usne darte hue poocha.', 'fear'],
];

const deliveryOfFirstQuote = (text: string, lang: string) => {
  const quotes = findDialogue(text, lang);
  const q = quotes[0];
  return q ? deliveryOf(text, { ...q, kind: 'dialogue' }, quotes) : undefined;
};

describe('delivery cues', () => {
  it('reads how a line is said in English, Hindi and Hinglish (labelled set)', () => {
    const misses: string[] = [];
    for (const [lang, text, emotion] of LABELLED) {
      const got = deliveryOfFirstQuote(text, lang)?.emotion;
      if (got !== emotion) misses.push(`${text} → ${got} (want ${emotion})`);
    }
    const accuracy = 1 - misses.length / LABELLED.length;
    process.stdout.write(`delivery: ${Math.round(accuracy * 100)}% of ${LABELLED.length} labelled lines\n`);
    // A few misses are tolerated (the set is small); each one is printed.
    for (const m of misses) process.stdout.write(`  miss: ${m}\n`);
    expect(accuracy).toBeGreaterThanOrEqual(0.9);
  });

  it('scores a fresh set it was never tuned on (honest number)', () => {
    const misses = FRESH_LABELLED.filter(
      ([lang, text, e]) => deliveryOfFirstQuote(text, lang)?.emotion !== e,
    );
    const accuracy = 1 - misses.length / FRESH_LABELLED.length;
    process.stdout.write(
      `delivery (fresh): ${Math.round(accuracy * 100)}% of ${FRESH_LABELLED.length} lines\n`,
    );
    for (const [lang, text] of misses)
      process.stdout.write(`  miss: ${text} → ${deliveryOfFirstQuote(text, lang)?.emotion}\n`);
    // Measured once: 100% of 16. Lines with an explicit cue only; a line with no cue word stays neutral.
    expect(accuracy).toBeGreaterThanOrEqual(0.9);
  });

  it('finds cues in multi-word manners', () => {
    expect(cueIn('she said under her breath').emotion).toBe('whisper');
    expect(cueIn('Dadi ne dheere se kaha').emotion).toBe('tender');
    expect(cueIn('Arjun ne hanste hue kaha').emotion).toBe('excited');
  });

  it('hears shouting, stammering and excitement in the words themselves', () => {
    expect(cueInLine('“STOP right there!”').emotion).toBe('shout');
    expect(cueInLine('“I-I don’t know.”').emotion).toBe('fear');
    expect(cueInLine('“Wait!!”').emotion).toBe('excited');
    expect(cueInLine('“NASA called.”').emotion).toBe('neutral');
    expect(cueInLine('“Fine.”').emotion).toBe('neutral');
  });

  it('keeps the narrator composed', () => {
    const text = 'The door burst open!';
    const d = deliveryOf(text, { start: 0, end: text.length, kind: 'narration' }, []);
    expect(d.emotion).toBe('excited');
    expect(d.intensity).toBeLessThan(0.3);
  });
});

describe('prosody', () => {
  it('whispers quieter and slower, shouts louder, and leaves neutral alone', () => {
    const whisper = prosodyFor({ emotion: 'whisper', intensity: 0.7 });
    const shout = prosodyFor({ emotion: 'shout', intensity: 0.8 });
    expect(whisper.gainDb).toBeLessThan(-4);
    expect(whisper.rate).toBeLessThan(1);
    expect(shout.gainDb).toBeGreaterThan(1);
    expect(prosodyFor({ emotion: 'neutral', intensity: 0 })).toEqual({ rate: 1, gainDb: 0 });
  });

  it('stays in a natural range at full intensity', () => {
    for (const e of ['calm', 'tender', 'whisper', 'sad', 'fear', 'excited', 'angry', 'shout'] as const) {
      const p = prosodyFor({ emotion: e, intensity: 1 });
      expect(p.rate).toBeGreaterThanOrEqual(0.88);
      expect(p.rate).toBeLessThanOrEqual(1.1);
      expect(p.gainDb).toBeGreaterThanOrEqual(-8);
      expect(p.gainDb).toBeLessThanOrEqual(3);
    }
  });
});

const line = (raw: string, extra: Partial<PlannedLine> = {}): PlannedLine => ({
  text: raw.replace(/[“”]/g, ''),
  raw,
  kind: 'narration',
  pauseMs: 140,
  block: 0,
  lastInBlock: false,
  blockText: raw,
  delivery: { emotion: 'neutral', intensity: 0 },
  ...extra,
});

describe('pauses and breaths', () => {
  it('lingers after an ellipsis and a dash, and a little after a question', () => {
    const p = perform([
      line('And then…'),
      line('She stopped —', { block: 1 }),
      line('Why?', { block: 2 }),
      line('Fine.', { block: 3 }),
    ]);
    expect(p[0]?.pauseMs).toBe(140 + BEAT.ellipsis);
    expect(p[1]?.pauseMs).toBe(140 + BEAT.dash);
    expect(p[2]?.pauseMs).toBe(140 + BEAT.question);
    expect(p[3]?.pauseMs).toBe(140);
  });

  it('leaves a beat between different speakers but not within one speaker', () => {
    const p = perform([
      line('“Hello.”', { kind: 'dialogue', speaker: 'anna', block: 0, lastInBlock: true, pauseMs: 450 }),
      line('“Hi.”', { kind: 'dialogue', speaker: 'tom', block: 1, pauseMs: 140 }),
      line('“How are you?”', { kind: 'dialogue', speaker: 'tom', block: 1, lastInBlock: true, pauseMs: 450 }),
    ]);
    expect(p[0]?.pauseMs).toBe(450 + BEAT.speakerChange);
    expect(p[1]?.pauseMs).toBe(140);
  });

  it('holds a long silence at a scene break', () => {
    const p = perform([
      line('The end of the day.', { lastInBlock: true, pauseMs: 450 }),
      line('* * *', { text: '', block: 1, lastInBlock: true, pauseMs: 450 }),
      line('Morning came.', { block: 2 }),
    ]);
    expect(p[1]?.pauseMs).toBe(SCENE_BREAK_MS);
  });

  it('waits before a short sentence that ends a paragraph', () => {
    const p = perform([
      line('She opened the box slowly, hands shaking.'),
      line('It was empty.', { lastInBlock: true, pauseMs: 450 }),
    ]);
    expect(p[0]?.pauseMs).toBe(140 + BEAT.reveal);
  });

  it('breathes before a long sentence after a paragraph break, not twice in a row', () => {
    const long = 'A'.repeat(20) + ' ' + 'word '.repeat(30);
    const p = perform([
      line('Short.', { lastInBlock: true, pauseMs: 450 }),
      line(long, { block: 1, lastInBlock: true, pauseMs: 450 }),
      line(long, { block: 2, lastInBlock: true, pauseMs: 450 }),
    ]);
    expect(p.map((x) => x.breath)).toEqual([false, true, false]);
    // The breath takes its time from the pause before it.
    expect(p[0]?.pauseMs).toBe(450 - BREATH_MS);
  });

  it('breathes before an emotional beat, and never when breaths are off', () => {
    const scared = { emotion: 'fear' as const, intensity: 0.7 };
    const lines = [
      line('Night.', { lastInBlock: true, pauseMs: 450 }),
      line('“Who’s there?”', { kind: 'dialogue', speaker: 'a', block: 1, delivery: scared }),
    ];
    expect(perform(lines)[1]?.breath).toBe(true);
    expect(perform(lines, { breaths: false }).some((x) => x.breath)).toBe(false);
  });

  it('keeps only the planned pauses when expressive reading is off', () => {
    const p = perform([line('And then…'), line('“Why?”', { kind: 'dialogue', speaker: 'b' })], {
      expressive: false,
      breaths: false,
    });
    expect(p.map((x) => x.pauseMs)).toEqual([140, 140]);
    expect(p.every((x) => x.rate === 1 && x.gainDb === 0)).toBe(true);
  });
});

describe('buildQueue performs the text', () => {
  const STORY = [
    'Chapter One',
    'The house was dark and very quiet.',
    '“Is anyone there?” she whispered.',
    '“GET OUT!” roared Mr. Black.',
    '* * *',
    'Morning came at last.',
  ].join('\n\n');

  const build = (opts: { expressive?: boolean; breaths?: boolean } = {}) => {
    const doc = prepareDocument(parsePlainText(STORY, 'Dark', 'book'));
    return buildQueue(
      { ...doc, blocks: doc.draft.blocks, chapters: doc.draft.chapters, language: doc.language },
      {
        clean: defaultCleanSettings('book', false),
        assignment: assignVoices(doc.characters, 'F1', VOICE_CATALOG),
        castMode: 'full',
        ...opts,
      },
    );
  };

  it('whispers the whisper and raises the shout', () => {
    const q = build();
    const whisper = q.find((s) => s.text.includes('anyone'));
    const shout = q.find((s) => /get out/i.test(s.text));
    expect(whisper?.gainDb).toBeLessThan(0);
    expect(whisper?.rate).toBeLessThan(1);
    expect(shout?.gainDb).toBeGreaterThan(0);
  });

  it('pauses long at the scene break and leaves everything plain when expressive is off', () => {
    const q = build();
    expect(q.find((s) => s.text === '')?.pauseMs).toBe(SCENE_BREAK_MS);
    const plain = build({ expressive: false, breaths: false });
    expect(plain.some((s) => s.gainDb !== undefined || s.breath)).toBe(false);
  });
});
