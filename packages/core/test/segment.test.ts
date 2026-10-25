import { describe, expect, it } from 'vitest';
import { segment, splitLong, splitSentences } from '../src/text/segment';

const sentences = (text: string, lang = 'en') =>
  splitSentences(text, lang).map((s) => text.slice(s.start, s.end));

describe('splitSentences', () => {
  it('splits plain sentences', () => {
    expect(sentences('It was late. The lamp was lit! Was anyone awake?')).toEqual([
      'It was late.',
      'The lamp was lit!',
      'Was anyone awake?',
    ]);
  });

  it('keeps titles and honorifics with the name', () => {
    expect(sentences('Mr. Darcy bowed. Mrs. Bennet did not.')).toEqual([
      'Mr. Darcy bowed.',
      'Mrs. Bennet did not.',
    ]);
    expect(sentences('Dr. Watson and St. Clair arrived.')).toEqual(['Dr. Watson and St. Clair arrived.']);
  });

  it('keeps run-together initials and number-taking abbreviations inside the sentence', () => {
    expect(sentences('The book was by J.R.R. Tolkien and it sold well.')).toEqual([
      'The book was by J.R.R. Tolkien and it sold well.',
    ]);
    expect(sentences('She moved to the U.S. In May she left.')).toEqual([
      'She moved to the U.S.',
      'In May she left.',
    ]);
    expect(sentences('Call me at ext. 42 tomorrow.')).toEqual(['Call me at ext. 42 tomorrow.']);
    expect(sentences('It cost $3.50 at the shop. Then it rose.')).toEqual([
      'It cost $3.50 at the shop.',
      'Then it rose.',
    ]);
    expect(sentences('Dr. A. K. Sharma arrived at 9 a.m. sharp.')).toEqual([
      'Dr. A. K. Sharma arrived at 9 a.m. sharp.',
    ]);
  });

  it('keeps Hindi titles, initials and a trailing-off ellipsis inside the sentence', () => {
    expect(sentences('डॉ. शर्मा कल आए। वे थके थे।', 'hi')).toEqual(['डॉ. शर्मा कल आए।', 'वे थके थे।']);
    expect(sentences('श्री ए. के. शर्मा ने कहा।', 'hi')).toEqual(['श्री ए. के. शर्मा ने कहा।']);
    expect(sentences('मैंने सोचा... पर कुछ नहीं कहा।', 'hi')).toEqual(['मैंने सोचा... पर कुछ नहीं कहा।']);
    expect(sentences('उसका वज़न 2.5 किलो था।', 'hi')).toEqual(['उसका वज़न 2.5 किलो था।']);
  });

  it('keeps initials together', () => {
    expect(sentences('J. R. R. Tolkien wrote it. Then he rested.')).toEqual([
      'J. R. R. Tolkien wrote it.',
      'Then he rested.',
    ]);
  });

  it('does not split on decimals, e.g., i.e. or numbered references', () => {
    expect(sentences('Pi is 3.14 roughly. See e.g. Euler, i.e. the master. Turn to p. 12 now.')).toEqual([
      'Pi is 3.14 roughly.',
      'See e.g. Euler, i.e. the master.',
      'Turn to p. 12 now.',
    ]);
  });

  it('treats general abbreviations as sentence ends only before a capital', () => {
    expect(sentences('We packed books, lamps, etc. and left.')).toEqual([
      'We packed books, lamps, etc. and left.',
    ]);
    expect(sentences('We packed books, lamps, etc. The car was full.')).toEqual([
      'We packed books, lamps, etc.',
      'The car was full.',
    ]);
  });

  it('attaches closing quotes and brackets to the sentence', () => {
    expect(sentences('“Come in.” She did. (It was cold.) Then silence.')).toEqual([
      '“Come in.”',
      'She did.',
      '(It was cold.)',
      'Then silence.',
    ]);
  });

  it('keeps dialogue tags after question and exclamation marks', () => {
    expect(sentences('“Who is there?” she asked. “Nobody!” he lied.')).toEqual([
      '“Who is there?” she asked.',
      '“Nobody!” he lied.',
    ]);
  });

  it('handles ellipses', () => {
    expect(sentences('Wait... then go. I waited… Nothing came.')).toEqual([
      'Wait... then go.',
      'I waited…',
      'Nothing came.',
    ]);
  });

  it('handles numbered list items at the start', () => {
    expect(sentences('1. Open the file. 2. Press play.')).toEqual(['1. Open the file.', '2. Press play.']);
  });

  it('ends a sentence after a year', () => {
    expect(sentences('It ended in 1999. Then came more.')).toEqual(['It ended in 1999.', 'Then came more.']);
  });

  it('handles Spanish inverted punctuation and abbreviations', () => {
    expect(sentences('¿Vienes? ¡Claro que sí! La Sra. García llegó.', 'es')).toEqual([
      '¿Vienes?',
      '¡Claro que sí!',
      'La Sra. García llegó.',
    ]);
  });

  it('handles German abbreviations', () => {
    expect(sentences('Das gilt z. B. für Bücher. Hr. Weber liest usw. und schläft.', 'de')).toEqual([
      'Das gilt z. B. für Bücher.',
      'Hr. Weber liest usw. und schläft.',
    ]);
  });

  it('handles French honorifics', () => {
    expect(sentences('M. Dupont est arrivé. Mme Martin aussi.', 'fr')).toEqual([
      'M. Dupont est arrivé.',
      'Mme Martin aussi.',
    ]);
  });

  it('splits CJK without spaces', () => {
    expect(sentences('今日は晴れです。明日は雨です。', 'ja')).toEqual(['今日は晴れです。', '明日は雨です。']);
  });

  it('splits caseless scripts after terminals', () => {
    expect(sentences('यह एक वाक्य है। यह दूसरा है।', 'hi')).toEqual(['यह एक वाक्य है।', 'यह दूसरा है।']);
  });

  it('trims whitespace and ignores empty input', () => {
    expect(sentences('   ')).toEqual([]);
    expect(sentences('  One.   Two.  ')).toEqual(['One.', 'Two.']);
    expect(sentences('No terminal punctuation')).toEqual(['No terminal punctuation']);
  });

  it('covers every non-space character exactly once', () => {
    const text = 'Dr. A said “Hi.” Then 3.5 apples, etc. Done! ¿Qué? OK… fine. Last';
    const spans = splitSentences(text);
    let covered = '';
    let prev = 0;
    for (const s of spans) {
      expect(s.start).toBeGreaterThanOrEqual(prev);
      covered += text.slice(s.start, s.end);
      prev = s.end;
    }
    expect(covered.replace(/\s/g, '')).toBe(text.replace(/\s/g, ''));
  });
});

describe('splitLong', () => {
  it('leaves short spans alone', () => {
    expect(splitLong('Short.', { start: 0, end: 6 })).toEqual([{ start: 0, end: 6 }]);
  });

  it('prefers semicolons, then commas, near the middle', () => {
    const text =
      'The rain fell on the old roofs of the town all night long without pause; by morning the streets were rivers and nobody went out at all.';
    const parts = splitLong(text, { start: 0, end: text.length }, 80, 20).map((s) =>
      text.slice(s.start, s.end),
    );
    expect(parts).toEqual([
      'The rain fell on the old roofs of the town all night long without pause;',
      'by morning the streets were rivers and nobody went out at all.',
    ]);
  });

  it('splits recursively until every part fits', () => {
    const text = Array.from({ length: 30 }, (_, i) => `clause number ${i}`).join(', ') + '.';
    const parts = segment(text, 'en', 100);
    expect(parts.length).toBeGreaterThan(4);
    for (const p of parts) expect(p.end - p.start).toBeLessThanOrEqual(100);
  });
});
