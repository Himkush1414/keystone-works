import { describe, expect, it } from 'vitest';
import { lookUpWord, sentenceTokens } from '../src/player/meaning';

describe('word meaning', () => {
  it('asks the engine for the word and its base forms, then explains it in context', async () => {
    const requests: string[] = [];
    const engine = {
      async lookupWord(request: string) {
        requests.push(request);
        return JSON.stringify({
          en: [
            {
              word: 'fortune',
              pos: 'n',
              rank: 0,
              gloss: 'a large amount of wealth or prosperity',
              tagged: 4,
            },
          ],
          hi: [],
          enHi: [{ en: 'fortune', hi: 'धन', rank: 0, gloss: 'wealth, fortune' }],
        });
      },
    };
    const m = await lookUpWord(engine, 'fortunes,', 'A man of large fortunes.');
    expect(JSON.parse(requests[0] ?? '{}').en).toContain('fortune');
    expect(m).toMatchObject({
      lemma: 'fortune',
      definition: 'a large amount of wealth or prosperity',
      hindi: ['धन'],
    });
  });

  it('does not ask about punctuation', async () => {
    const engine = { lookupWord: () => Promise.reject(new Error('should not be called')) };
    expect(await lookUpWord(engine, '—', 'x')).toBeNull();
  });

  it('cuts a sentence into words and what lies between them', () => {
    const tokens = sentenceTokens('"Bingley." उसने कहा, well-known!');
    expect(tokens.filter((t) => t.word).map((t) => t.text)).toEqual(['Bingley', 'उसने', 'कहा', 'well-known']);
    expect(tokens.map((t) => t.text).join('')).toBe('"Bingley." उसने कहा, well-known!');
  });
});
