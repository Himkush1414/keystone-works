import { describe, expect, it } from 'vitest';
import { languageRuns } from '../src/text/runs';

describe('languageRuns', () => {
  it('leaves a one-language line alone', () => {
    expect(languageRuns('It is a truth universally acknowledged.', 'en')).toBeUndefined();
    expect(languageRuns('रात गहरी हो चुकी थी।', 'hi')).toBeUndefined();
  });

  it('keeps loanwords and names inside a Hindi sentence with the Hindi voice', () => {
    expect(languageRuns('उसने अपना phone उठाया और कहा।', 'hi')).toBeUndefined();
    expect(languageRuns('Aarav ने record किया।', 'hi')).toBeUndefined();
  });

  it('gives an English phrase in a Hindi line to the English voice, cutting after the comma', () => {
    const runs = languageRuns('"मैं इसे record कर लेता हूँ, so that I never forget a single word."', 'hi');
    expect(runs?.map((r) => r.lang)).toEqual(['hi', 'en']);
    expect(runs?.[0]?.text).toBe('"मैं इसे record कर लेता हूँ, ');
    expect(runs?.[1]?.text).toBe('so that I never forget a single word."');
    expect(runs?.map((r) => r.text).join('')).toBe(
      '"मैं इसे record कर लेता हूँ, so that I never forget a single word."',
    );
  });

  it('gives Devanagari in an English line to the Hindi voice', () => {
    const runs = languageRuns('She smiled and said नमस्ते दादी, then sat down.', 'en');
    expect(runs).toEqual([
      { text: 'She smiled and said ', lang: 'en' },
      { text: 'नमस्ते दादी, ', lang: 'hi' },
      { text: 'then sat down.', lang: 'en' },
    ]);
  });

  it('never treats romanised Hindi as English', () => {
    expect(languageRuns('दादी ने कहा kya tum aaoge kal?', 'hi')).toBeUndefined();
  });
});
