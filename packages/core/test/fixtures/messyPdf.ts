import type { PdfLine, PdfPage } from '../../src/import/pdf';

/**
 * Messy PDF books with every line labelled, for scoring Clean Read: running headers that alternate between the
 * book's title and the chapter's, page numbers in Latin and Devanagari digits, a watermark stamped on every page,
 * a copyright page, footnotes, scan noise, margin line numbers, hyphenated words, and sentences and paragraphs
 * that run over page breaks. The prose is original.
 */

export type LineLabel =
  | 'body'
  | 'title'
  | 'header'
  | 'footer'
  | 'pageNumber'
  | 'watermark'
  | 'copyright'
  | 'footnote'
  | 'scanNoise'
  | 'strayNumber';

export interface MessyBook {
  id: string;
  pages: PdfPage[];
  /** Labels parallel to `pages[i].lines`. */
  labels: LineLabel[][];
  /** Every body paragraph as written, before wrapping, hyphenation and footnote markers. */
  paragraphs: string[];
  /** Every body sentence as written. */
  sentences: string[];
}

const EN = [
  'The ferry left the ghat an hour before sunrise, when the river was still the colour of slate.',
  'Asha kept the lamp between her knees so that the wind could not reach it.',
  'Nobody on board spoke much; the boatman hummed a song his grandfather had taught him.',
  'On the far bank, the lights of the market went out one by one.',
  'She had read the letter so many times that the folds had begun to tear.',
  'It said only that her brother was well, that the rains had come early, and that he would write again.',
  'The boatman asked whether she had family in the city, and she said that she did not know any more.',
  'A heron rose from the reeds and flew low across the water, unhurried and enormous.',
  'By the time they reached the middle of the river, the sky had turned a pale and uncertain blue.',
  'She thought of the house on Station Road, of the neem tree, of her mother counting coins at the window.',
  'Somewhere behind them a temple bell rang, and then another, further away.',
  'The lamp flickered, steadied, and burned on as though nothing had happened.',
  'When the ferry bumped against the jetty, she was the last to stand.',
  'The porters were already shouting, and the smell of frying dough drifted down from the stalls.',
  'She paid the boatman twice what he asked, and he looked at her for a long moment before taking it.',
  'Then she walked up the steps into the town, carrying the lamp, which was no longer needed.',
];

const HI = [
  'सुबह होने से पहले ही नाव घाट से चल पड़ी।',
  'आशा ने लालटेन को घुटनों के बीच रखा ताकि हवा उस तक न पहुँचे।',
  'नाविक धीरे-धीरे वह गीत गुनगुना रहा था जो उसके दादा ने उसे सिखाया था।',
  'दूसरे किनारे पर बाज़ार की बत्तियाँ एक-एक करके बुझ गईं।',
  'उसने वह चिट्ठी इतनी बार पढ़ी थी कि उसकी तहें फटने लगी थीं।',
  'उसमें बस इतना लिखा था कि भाई ठीक है और बारिश जल्दी आ गई है।',
  'नदी के बीच पहुँचते-पहुँचते आसमान हल्का नीला हो गया।',
  'पीछे कहीं मंदिर की घंटी बजी, फिर एक और, कुछ और दूर।',
  'लालटेन टिमटिमाई, सँभली, और फिर ऐसे जलती रही जैसे कुछ हुआ ही न हो।',
  'वह सबसे आख़िर में नाव से उतरी और सीढ़ियाँ चढ़कर शहर की ओर चल दी।',
];

const EN_CHAPTERS = [
  'The Ferry',
  'The Letter',
  'Station Road',
  'The Market',
  'Rain',
  'The Bell',
  'The Jetty',
  'Home',
  'The Steps',
  'Morning',
];
const HI_CHAPTERS = ['नाव', 'चिट्ठी', 'बाज़ार', 'बारिश', 'घंटी', 'घर'];
const HI_DIGITS = '०१२३४५६७८९';
const hiNum = (n: number) => String(n).replace(/\d/g, (d) => HI_DIGITS[Number(d)] ?? d);
/** Scan debris. Not `* * *` or `~ ~ ~`: those are scene breaks, which the narration pauses for. */
const NOISE = ['· ˙ ,', '■', '|', "' . , '", '¦ ¸', '▪'];

/** A small deterministic PRNG, so the books are the same on every run. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

interface Options {
  id: string;
  hindi: boolean;
  pages: number;
  pagesPerChapter: number;
  seed: number;
  /**
   * Report style: paragraphs set apart by space instead of an indent, the running header at body size,
   * "Page N" numbers, a big stamped publisher name with no watermark words, and footnotes marked with *.
   */
  block?: boolean;
}

const W = 612;
const H = 792;
const BODY = 10.5;
const GAP = 14;
const LEFT = 72;
const COLUMN = 460;
const MAX_CHARS = 80;
const TOP = 80;
const BOTTOM = 650;

export function messyBook(o: Options): MessyBook {
  const rand = rng(o.seed);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)] as T;
  const pool = o.hindi ? HI : EN;
  const chapters = o.hindi ? HI_CHAPTERS : EN_CHAPTERS;
  const pages: PdfPage[] = [];
  const labels: LineLabel[][] = [];
  const paragraphs: string[] = [];
  const sentences: string[] = [];

  let page: PdfLine[] = [];
  let pageLabels: LineLabel[] = [];
  let y = TOP;
  let footnotes: string[] = [];
  let footnoteNo = 1;

  const add = (line: PdfLine, label: LineLabel) => {
    page.push(line);
    pageLabels.push(label);
  };
  const sorted = () => {
    const order = page
      .map((l, i) => ({ l, label: pageLabels[i] as LineLabel }))
      .sort((a, b) => a.l.y - b.l.y || a.l.x - b.l.x);
    return { lines: order.map((e) => e.l), labels: order.map((e) => e.label) };
  };

  const pageNo = () => pages.length + 1;
  const chapterOf = (n: number) => Math.min(chapters.length - 1, Math.floor((n - 3) / o.pagesPerChapter));

  const finishPage = (opening: boolean) => {
    const n = pageNo();
    const num = o.hindi ? hiNum(n) : String(n);
    if (!opening && n > 2) {
      const text = o.block
        ? (chapters[chapterOf(n)] ?? '')
        : n % 2
          ? `${chapters[chapterOf(n)]}      ${num}`
          : `${num}      ${o.hindi ? 'नदी और लालटेन' : 'THE LAMP AND THE RIVER'}`;
      add({ text, x: LEFT, y: 40, width: 300, size: o.block ? BODY : 8 }, 'header');
    }
    if (n > 2) {
      add(
        { text: o.block ? `Page ${num}` : o.hindi ? num : `– ${num} –`, x: 280, y: 760, width: 40, size: 8 },
        'pageNumber',
      );
      const mark = o.block
        ? 'LANTERN HOUSE'
        : o.hindi
          ? 'www.hindipustak.example से डाउनलोड किया गया'
          : 'Downloaded from www.freebooks-archive.example';
      add({ text: mark, x: 150, y: 405, width: 260, size: o.block ? 40 : 7 }, 'watermark');
    }
    footnotes.forEach((f, k) => add({ text: f, x: LEFT, y: 690 + k * 10, width: 300, size: 8 }, 'footnote'));
    footnotes = [];
    if (n > 2 && rand() < 0.15)
      add(
        { text: pick(NOISE), x: 100 + rand() * 300, y: 300 + rand() * 200 + 0.5, width: 20, size: 9 },
        'scanNoise',
      );
    const s = sorted();
    pages.push({ width: W, height: H, lines: s.lines });
    labels.push(s.labels);
    page = [];
    pageLabels = [];
    y = TOP;
  };

  // Title page and copyright page.
  add(
    { text: o.hindi ? 'नदी और लालटेन' : 'The Lamp and the River', x: 150, y: 250, width: 320, size: 26 },
    'title',
  );
  add({ text: o.hindi ? 'आशा वर्मा' : 'Asha Verma', x: 250, y: 320, width: 120, size: 14 }, 'title');
  finishPage(true);
  const copyright = o.hindi
    ? [
        '© २०२१ आशा वर्मा',
        'सर्वाधिकार सुरक्षित',
        'प्रथम संस्करण: २०२१',
        'प्रकाशक: लालटेन हाउस, पटना',
        'ISBN 978-93-00000-01-7',
      ]
    : [
        'Copyright © 2021 Asha Verma',
        'All rights reserved. No part of this book may be reproduced without permission.',
        'First published in 2021 by Lantern House, Patna',
        'ISBN 978-93-00000-00-0',
        'Printed in India',
      ];
  copyright.forEach((t, k) => add({ text: t, x: LEFT, y: 520 + k * 12, width: 360, size: 9 }, 'copyright'));
  finishPage(true);

  let chapter = -1;
  while (pages.length < o.pages) {
    const n = pageNo();
    if (chapterOf(n) !== chapter && y === TOP) {
      chapter = chapterOf(n);
      const heading = o.hindi
        ? `अध्याय ${hiNum(chapter + 1)}: ${chapters[chapter]}`
        : `Chapter ${chapter + 1}: ${chapters[chapter]}`;
      add({ text: heading, x: LEFT, y: 120, width: 260, size: 18 }, 'title');
      y = 180;
    }
    // One paragraph of 3 to 6 sentences, maybe with a footnote marker after one of them.
    const chosen = Array.from({ length: 3 + Math.floor(rand() * 4) }, () => pick(pool));
    const marked = !o.hindi && rand() < 0.25 ? Math.floor(rand() * chosen.length) : -1;
    sentences.push(...chosen);
    paragraphs.push(chosen.join(' '));
    const words = chosen
      .map((s, k) => (k === marked ? `${s}${o.block ? '*' : footnoteNo}` : s))
      .join(' ')
      .split(' ');
    if (marked >= 0) {
      footnotes.push(
        `${o.block ? '*' : footnoteNo} The ghat at Mahendru was rebuilt after the flood of 1962.`,
      );
      footnoteNo++;
    }

    const lines: string[] = [];
    let current = '';
    for (const w of words) {
      const room = MAX_CHARS - (lines.length === 0 && !o.block ? 4 : 0);
      if (!current) current = w;
      else if (current.length + 1 + w.length <= room) current += ` ${w}`;
      else if (!o.hindi && /^\p{Ll}{8,}$/u.test(w) && current.length + 6 <= room && rand() < 0.6) {
        const cut = Math.min(w.length - 3, room - current.length - 2);
        lines.push(`${current} ${w.slice(0, cut)}-`);
        current = w.slice(cut);
      } else {
        lines.push(current);
        current = w;
      }
    }
    lines.push(current);

    lines.forEach((text, k) => {
      if (y > BOTTOM) finishPage(false);
      const first = k === 0;
      const last = k === lines.length - 1;
      // Margin line numbers on a few pages, beside the fifth and tenth lines.
      const row = Math.round((y - TOP) / GAP);
      if (row > 0 && row % 5 === 0 && pageNo() % 9 === 0)
        add({ text: String(row), x: 40, y, width: 10, size: 8 }, 'strayNumber');
      add(
        {
          text,
          x: first && !o.block ? LEFT + 20 : LEFT,
          y,
          width: last ? (text.length / MAX_CHARS) * COLUMN : first && !o.block ? COLUMN - 20 : COLUMN,
          size: BODY,
        },
        'body',
      );
      y += GAP;
    });
    if (o.block) y += GAP;
    if (rand() < 0.08 && y < BOTTOM - 100) y = BOTTOM + 1; // the chapter's last page often ends early
  }
  if (page.length) finishPage(false);
  return { id: o.id, pages, labels, paragraphs, sentences };
}

export const messyBooks = (): MessyBook[] => [
  messyBook({ id: 'english novel, 100 pages', hindi: false, pages: 100, pagesPerChapter: 10, seed: 7 }),
  messyBook({ id: 'hindi novel, 60 pages', hindi: true, pages: 60, pagesPerChapter: 10, seed: 11 }),
  messyBook({
    id: 'english report, block paragraphs, 40 pages',
    hindi: false,
    pages: 40,
    pagesPerChapter: 8,
    seed: 3,
    block: true,
  }),
  messyBook({ id: 'english article, 8 pages', hindi: false, pages: 8, pagesPerChapter: 8, seed: 5 }),
];
