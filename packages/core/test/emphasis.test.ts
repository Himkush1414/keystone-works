import { describe, expect, it } from 'vitest';
import { parsePlainText, takeEmphasis } from '../src/import/text';
import { prepareDocument } from '../src/pipeline';

describe('takeEmphasis', () => {
  it('removes Project Gutenberg italics markers and records where they were', () => {
    const r = takeEmphasis('“You _want_ to tell me,” and he _may_ fall in love.');
    expect(r.text).toBe('“You want to tell me,” and he may fall in love.');
    expect(r.emphasis.map(([a, b]) => r.text.slice(a, b))).toEqual(['want', 'may']);
  });

  it('handles phrases, asterisks and punctuation around the markers', () => {
    const r = takeEmphasis('_Her_ mind; *quite* so. (_Not now_), she said.');
    expect(r.text).toBe('Her mind; quite so. (Not now), she said.');
    expect(r.emphasis.map(([a, b]) => r.text.slice(a, b))).toEqual(['Her', 'quite', 'Not now']);
  });

  it('leaves underscores inside words, lone markers and separators alone', () => {
    for (const s of ['snake_case_name here', 'a lone _ marker', 'see file_name_ and _x', '* * *', '5*3*2'])
      expect(takeEmphasis(s)).toEqual({ text: s, emphasis: [] });
  });
});

describe('plain text import', () => {
  it('keeps emphasis on the block and never puts the markers in a sentence', () => {
    const draft = parsePlainText(
      '“But it is very likely that he _may_ fall in love with one of them.”',
      'T',
      'book',
    );
    const block = draft.blocks[0];
    expect(block?.text).not.toContain('_');
    expect(block?.emphasis?.map(([a, b]) => block.text.slice(a, b))).toEqual(['may']);
    const doc = prepareDocument(draft);
    for (const s of doc.sentences) expect(block?.text.slice(s.start, s.end)).not.toContain('_');
  });
});
