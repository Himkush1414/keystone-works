import { describe, expect, it } from 'vitest';
import { buildArticle, domToBlocks, findMainContent, htmlInfo, parseHtml } from '../src/import/html';
import { ImportError } from '../src/model';

const prose = (n: number, seed: string) =>
  Array.from(
    { length: n },
    (_, i) =>
      `${seed} sentence ${i + 1} explains, with some care and a few commas, how evening light changes the way people read.`,
  ).join(' ');

const page = `<!doctype html>
<html lang="en-GB">
<head>
  <title>The Lamp Hour | Night Paper</title>
  <meta property="og:title" content="The Lamp Hour">
  <meta property="og:site_name" content="Night Paper">
  <meta name="author" content="Ada Reed">
  <meta property="article:published_time" content="2026-03-04T08:00:00Z">
  <style>p{color:red}</style>
</head>
<body>
  <header><nav><a href="/">Home</a> <a href="/news">News</a> <a href="/opinion">Opinion</a></nav></header>
  <div class="sidebar promo"><a href="/x">Subscribe now</a> <a href="/y">Top stories</a></div>
  <article class="post-content">
    <h1>The Lamp Hour</h1>
    <p>${prose(3, 'Opening')}</p>
    <h2>Why it matters</h2>
    <p>${prose(3, 'Middle')} <a href="/ref">a link</a> stays inline.</p>
    <blockquote>A quoted line that deserves its own block.</blockquote>
    <ul><li>First point</li><li>Second point</li></ul>
    <figure><img src="a.jpg" alt="decorative"><figcaption>Figure 1: A lamp.</figcaption></figure>
    <pre>code   keeps
  spacing</pre>
    <script>tracking()</script>
  </article>
  <section class="comments"><p>${prose(1, 'Comment')}</p><a href="/c1">reply</a> <a href="/c2">report</a></section>
  <footer>© Night Paper</footer>
</body>
</html>`;

describe('htmlInfo', () => {
  it('reads metadata', () => {
    expect(htmlInfo(parseHtml(page))).toEqual({
      title: 'The Lamp Hour',
      author: 'Ada Reed',
      siteName: 'Night Paper',
      publishedAt: Date.parse('2026-03-04T08:00:00Z'),
      language: 'en-gb',
    });
  });

  it("drops the site's name from a page title (#111)", () => {
    const title = (head: string, body = '') =>
      htmlInfo(parseHtml(`<html><head>${head}</head><body>${body}</body></html>`)).title;
    expect(title('<title>ईदगाह - विकिस्रोत</title>', '<h1>ईदगाह</h1>')).toBe('ईदगाह');
    expect(
      title('<title>The Lamp Hour | Night Paper</title><meta property="og:site_name" content="Night Paper">'),
    ).toBe('The Lamp Hour');
    // A dash or bar that belongs to the title stays.
    expect(title('<title>Spider-Man – A Life</title>', '<h1>Spider-Man – A Life</h1>')).toBe(
      'Spider-Man – A Life',
    );
    expect(title('<title>Night | Day</title>')).toBe('Night | Day');
  });
});

describe('findMainContent', () => {
  it('picks the article over navigation, promos and comments', () => {
    const main = findMainContent(parseHtml(page));
    expect('name' in main && main.name).toBe('article');
  });

  it('falls back to the densest container when there is no <article>', () => {
    const html = `<body><div id="menu"><a href="#">a</a></div><div class="entry-content"><p>${prose(4, 'Body')}</p><p>${prose(2, 'More')}</p></div></body>`;
    const main = findMainContent(parseHtml(html));
    expect('attribs' in main && main.attribs.class).toBe('entry-content');
  });
});

describe('domToBlocks', () => {
  it('maps elements to block kinds and flattens inline markup', () => {
    const doc = parseHtml(
      '<body><h2>Title <em>here</em></h2><p>One <b>bold</b>&nbsp;word.<br>Next line.</p><blockquote>Q</blockquote><li>Item</li><pre>a\n  b</pre><hr><p>  </p></body>',
    );
    expect(domToBlocks(doc, { keepBoilerplate: true, dropNegative: false })).toEqual([
      { kind: 'heading', text: 'Title here', level: 2, skips: [] },
      { kind: 'paragraph', text: 'One bold word. Next line.', skips: [] },
      { kind: 'quote', text: 'Q', skips: [] },
      { kind: 'list', text: 'Item', skips: [] },
      { kind: 'code', text: 'a\n  b', skips: [] },
    ]);
  });

  it('drops scripts, hidden content and (optionally) boilerplate', () => {
    const doc = parseHtml(
      '<body><header>Site</header><p>Keep</p><p hidden>Hidden</p><p aria-hidden="true">Also</p><script>x()</script></body>',
    );
    expect(domToBlocks(doc, { keepBoilerplate: false, dropNegative: false }).map((b) => b.text)).toEqual([
      'Keep',
    ]);
    expect(domToBlocks(doc, { keepBoilerplate: true, dropNegative: false }).map((b) => b.text)).toEqual([
      'Site',
      'Keep',
    ]);
  });
});

describe('buildArticle', () => {
  it('builds a clean article document', () => {
    const d = buildArticle(page, 'https://night.example/lamp');
    expect(d.meta).toMatchObject({
      title: 'The Lamp Hour',
      kind: 'article',
      author: 'Ada Reed',
      siteName: 'Night Paper',
      sourceUri: 'https://night.example/lamp',
    });
    const texts = d.blocks.map((b) => b.text);
    expect(texts[0]).toBe('The Lamp Hour');
    expect(texts.filter((t) => t === 'The Lamp Hour')).toHaveLength(1);
    expect(texts).toContain('Why it matters');
    expect(texts).toContain('A quoted line that deserves its own block.');
    expect(texts).toContain('Figure 1: A lamp.');
    expect(texts.some((t) => t.includes('Subscribe'))).toBe(false);
    expect(texts.some((t) => t.includes('Comment sentence'))).toBe(false);
    expect(texts.some((t) => t.includes('tracking'))).toBe(false);
    expect(d.blocks.find((b) => b.kind === 'code')?.text).toBe('code   keeps\n  spacing');
  });

  it('reports a paywall stub as a partial article', () => {
    const stub =
      '<html><head><title>Locked</title></head><body><article><p>Subscribe to keep reading this story about lamps.</p></article></body></html>';
    expect(() => buildArticle(stub)).toThrow(ImportError);
    try {
      buildArticle(stub);
    } catch (e) {
      expect((e as ImportError).code).toBe('partialArticle');
    }
  });

  it('reports an empty page', () => {
    expect(() => buildArticle('<html><body><script>1</script></body></html>')).toThrow(/empty/);
  });
});
