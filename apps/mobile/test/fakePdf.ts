import type { PdfPage } from '@lamplight/core';
import type { PdfInfo, PdfReader } from '../src/import/parse';

export interface FakePdf {
  pages: PdfPage[];
  outline?: PdfInfo['outline'];
  title?: string | null;
  author?: string | null;
  /** When set, open() rejects with code "password" unless given this. */
  password?: string;
}

/** A PdfReader over pages in memory, recording each call ("open /a.pdf pw", "pages 1-12", "close"). */
export function fakePdfReader(pdf: FakePdf): PdfReader & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    open: (path, password) => {
      calls.push(`open ${path} ${password ?? ''}`.trim());
      if (pdf.password !== undefined && password !== pdf.password)
        return Promise.reject(Object.assign(new Error('locked'), { code: 'password' }));
      return Promise.resolve({
        handle: 7,
        pageCount: pdf.pages.length,
        outline: pdf.outline ?? [],
        title: pdf.title ?? null,
        author: pdf.author ?? null,
      });
    },
    pages: (handle, from, to) => {
      calls.push(`pages ${from}-${to}`);
      return Promise.resolve(pdf.pages.slice(from - 1, to));
    },
    close: () => {
      calls.push('close');
      return Promise.resolve();
    },
  };
}

/** A reader whose open() always rejects with `code`. */
export const failingPdfReader = (code: string): PdfReader => ({
  open: () => Promise.reject(Object.assign(new Error(code), { code })),
  pages: () => Promise.resolve([]),
  close: () => Promise.resolve(),
});
