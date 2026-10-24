import { describe, expect, it } from 'vitest';
import * as core from '../src';
import { formatScore, scoreBook, type CleanCore } from './cleanEval';
import { messyBooks } from './fixtures/messyPdf';

describe('Clean Read on messy PDFs', () => {
  for (const book of messyBooks()) {
    it(`leaves out the page furniture and keeps the story whole: ${book.id}`, () => {
      const s = scoreBook(core as unknown as CleanCore, book);
      expect(s.bodyLinesSkipped, formatScore(s)).toBe(0);
      expect(s.furnitureRecall, formatScore(s)).toBeGreaterThanOrEqual(0.98);
      expect(s.sentencesIntact, formatScore(s)).toBe(s.sentences);
      // Block paragraphs that end a page with a full line can't be told from one that carries on; the cost is a
      // sentence pause where a paragraph pause belonged (report style: 94%).
      expect(s.paragraphsIntact / s.paragraphs, formatScore(s)).toBeGreaterThanOrEqual(0.9);
    });
  }
});
