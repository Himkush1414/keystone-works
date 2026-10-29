import { parseDocument } from 'htmlparser2';
import { type ChildNode, type Document, type Element, isTag, isText } from 'domhandler';
import { textContent, getElementsByTagName, getAttributeValue } from 'domutils';
import { ImportError, type Block, type BlockKind, type Chapter, type DocumentDraft } from '../model';

const SKIP_TAGS = new Set([
  'script',
  'style',
  'noscript',
  'template',
  'svg',
  'math',
  'iframe',
  'object',
  'embed',
  'canvas',
  'form',
  'button',
  'input',
  'select',
  'textarea',
  'nav',
  'audio',
  'video',
  'map',
  'head',
]);
const BOILERPLATE_TAGS = new Set(['header', 'footer', 'aside']);
const BLOCK_TAGS: Record<string, BlockKind> = {
  p: 'paragraph',
  div: 'paragraph',
  section: 'paragraph',
  article: 'paragraph',
  main: 'paragraph',
  h1: 'heading',
  h2: 'heading',
  h3: 'heading',
  h4: 'heading',
  h5: 'heading',
  h6: 'heading',
  blockquote: 'quote',
  li: 'list',
  dt: 'paragraph',
  dd: 'paragraph',
  pre: 'code',
  figcaption: 'caption',
  caption: 'caption',
  td: 'paragraph',
  th: 'paragraph',
  tr: 'paragraph',
  table: 'paragraph',
  ul: 'paragraph',
  ol: 'paragraph',
  dl: 'paragraph',
  figure: 'paragraph',
  address: 'paragraph',
  hr: 'pagebreak',
};
const NEGATIVE =
  /comment|meta|footer|footnote|related|share|sharing|social|sidebar|sponsor|advert|\bad[s-]|promo|nav|menu|breadcrumb|subscribe|newsletter|signup|cookie|banner|popup|modal|recommend|outbrain|taboola|byline-|author-bio/i;
const POSITIVE = /article|body|content|entry|main|page|post|text|blog|story|chapter|prose/i;

const MAX_NODES = 200_000;

export interface HtmlOptions {
  /** Pick the main content (articles). When false the whole body is converted (EPUB chapters). */
  extractMain: boolean;
  /** Keep header/footer/aside elements (EPUB chapters may legitimately use them). */
  keepBoilerplate?: boolean;
}

const classAndId = (el: Element) =>
  `${getAttributeValue(el, 'class') ?? ''} ${getAttributeValue(el, 'id') ?? ''}`;
const cleanText = (s: string) => s.replace(/[\s\u00a0]+/g, ' ').trim();

function linkDensity(el: Element): number {
  const total = textContent(el).length || 1;
  const links = getElementsByTagName('a', el, true).reduce((n, a) => n + textContent(a).length, 0);
  return links / total;
}

/** Readability-style scoring: the element whose paragraphs carry the most prose. */
export function findMainContent(doc: Document): Element | Document {
  const article = getElementsByTagName('article', doc, true).sort(
    (a, b) => textContent(b).length - textContent(a).length,
  )[0];
  const scores = new Map<Element, number>();
  for (const p of getElementsByTagName((n) => n === 'p' || n === 'pre' || n === 'blockquote', doc, true)) {
    const text = cleanText(textContent(p));
    if (text.length < 25) continue;
    const score = 1 + (text.match(/[,，、]/g)?.length ?? 0) + Math.min(3, Math.floor(text.length / 100));
    const parent = p.parent && isTag(p.parent) ? p.parent : null;
    const grand = parent?.parent && isTag(parent.parent) ? parent.parent : null;
    if (parent) scores.set(parent, (scores.get(parent) ?? 0) + score);
    if (grand) scores.set(grand, (scores.get(grand) ?? 0) + score / 2);
  }
  let best: Element | null = null;
  let bestScore = 0;
  for (const [el, raw] of scores) {
    const hint = classAndId(el);
    const adjusted =
      raw * (1 - linkDensity(el)) + (POSITIVE.test(hint) ? 25 : 0) - (NEGATIVE.test(hint) ? 25 : 0);
    if (adjusted > bestScore) {
      best = el;
      bestScore = adjusted;
    }
  }
  if (article && (!best || textContent(article).length >= textContent(best).length * 0.8)) return article;
  return best ?? getElementsByTagName('body', doc, true)[0] ?? doc;
}

/** Converts a DOM subtree to blocks. Inline markup is flattened; block elements start new blocks. */
export function domToBlocks(
  root: ChildNode | Document,
  opts: { keepBoilerplate: boolean; dropNegative: boolean },
): Block[] {
  const blocks: Block[] = [];
  let buffer = '';
  let kind: BlockKind = 'paragraph';
  let level: number | undefined;
  let visited = 0;

  const flush = () => {
    const text = kind === 'code' ? buffer.replace(/^\n+|\s+$/g, '') : cleanText(buffer);
    if (text) blocks.push(level ? { kind, text, level, skips: [] } : { kind, text, skips: [] });
    buffer = '';
    kind = 'paragraph';
    level = undefined;
  };

  const walk = (node: ChildNode, inPre: boolean) => {
    if (++visited > MAX_NODES) throw new ImportError('tooLarge');
    if (isText(node)) {
      buffer += inPre ? node.data : node.data.replace(/\s+/g, ' ');
      return;
    }
    if (!isTag(node)) return;
    const tag = node.name.toLowerCase();
    if (SKIP_TAGS.has(tag)) return;
    if (!opts.keepBoilerplate && BOILERPLATE_TAGS.has(tag)) return;
    if (opts.dropNegative && tag !== 'body' && NEGATIVE.test(classAndId(node)) && linkDensity(node) > 0.25)
      return;
    if (getAttributeValue(node, 'hidden') !== undefined || getAttributeValue(node, 'aria-hidden') === 'true')
      return;
    if (tag === 'br') {
      buffer += inPre ? '\n' : ' ';
      return;
    }
    if (tag === 'img') {
      return; // images carry no narration; alt text is usually decorative or duplicated in captions
    }
    const blockKind = BLOCK_TAGS[tag];
    if (blockKind) {
      flush();
      if (blockKind === 'pagebreak') return;
      kind = blockKind;
      if (blockKind === 'heading') level = Number(tag.slice(1));
      for (const c of node.children) walk(c, inPre || tag === 'pre');
      flush();
      return;
    }
    for (const c of node.children) walk(c, inPre);
  };

  const children = 'children' in root ? root.children : [];
  for (const c of children) walk(c, false);
  flush();
  return blocks;
}

function meta(doc: Document, ...names: string[]): string | undefined {
  for (const m of getElementsByTagName('meta', doc, true)) {
    const key = (getAttributeValue(m, 'property') ?? getAttributeValue(m, 'name') ?? '').toLowerCase();
    if (names.includes(key)) {
      const v = cleanText(getAttributeValue(m, 'content') ?? '');
      if (v) return v;
    }
  }
  return undefined;
}

export interface HtmlDocumentInfo {
  title?: string;
  author?: string;
  siteName?: string;
  publishedAt?: number;
  language?: string;
}

/**
 * A <title> without the site's name after it ("ईदगाह - विकिस्रोत" → "ईदगाह"): dropped when the page's heading or
 * its site name says where the title ends, so a dash that belongs to the title ("Spider-Man – A Life") stays.
 */
function withoutSite(title: string, h1: string, site: string | undefined): string {
  const m = title.match(/^(.+?)\s+[-–—|·:]\s+([^-–—|·:]+)$/u);
  if (!m?.[1] || !m[2]) return title;
  const same = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' }) === 0;
  return (h1 && same(m[1], h1)) || (site && same(m[2], site)) ? m[1] : title;
}

export function htmlInfo(doc: Document): HtmlDocumentInfo {
  const titleTag = cleanText(textContent(getElementsByTagName('title', doc, true)[0] ?? []));
  const h1 = cleanText(textContent(getElementsByTagName('h1', doc, true)[0] ?? []));
  const published =
    meta(doc, 'article:published_time', 'date', 'dc.date', 'pubdate') ??
    getAttributeValue(getElementsByTagName('time', doc, true)[0] ?? ({} as Element), 'datetime');
  const time = published ? Date.parse(published) : NaN;
  const lang = getAttributeValue(getElementsByTagName('html', doc, true)[0] ?? ({} as Element), 'lang');
  const info: HtmlDocumentInfo = {};
  const site = meta(doc, 'og:site_name', 'application-name');
  const title = meta(doc, 'og:title', 'twitter:title') ?? (withoutSite(titleTag, h1, site) || h1);
  if (title) info.title = title;
  const author = meta(doc, 'author', 'article:author', 'dc.creator', 'parsely-author');
  if (author && !/^https?:/i.test(author)) info.author = author;
  if (site) info.siteName = site;
  if (!Number.isNaN(time)) info.publishedAt = time;
  if (lang) info.language = lang.toLowerCase();
  return info;
}

export function parseHtml(html: string): Document {
  return parseDocument(html, { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true });
}

/** Builds an article document from a web page. Throws ImportError('partialArticle') when little prose survives. */
export function buildArticle(html: string, sourceUri?: string): DocumentDraft {
  const doc = parseHtml(html);
  const info = htmlInfo(doc);
  const main = findMainContent(doc);
  let blocks = domToBlocks(main, { keepBoilerplate: false, dropNegative: true });

  // The page title often repeats as the first heading; keep a single copy.
  const first = blocks[0];
  if (first?.kind === 'heading' && info.title && first.text.toLowerCase() === info.title.toLowerCase()) {
    blocks = blocks.slice(1);
  }
  const title = info.title ?? blocks.find((b) => b.kind === 'heading')?.text ?? 'Untitled article';
  const words = blocks.reduce((n, b) => n + b.text.split(/\s+/).length, 0);
  if (words === 0) throw new ImportError('empty');
  if (words < 80) throw new ImportError('partialArticle');

  const chapters: Chapter[] = [{ title, level: 1, blockStart: 0 }];
  const draft: DocumentDraft = {
    meta: { title, kind: 'article', ...info, ...(sourceUri ? { sourceUri } : {}) },
    chapters,
    blocks: [{ kind: 'heading', text: title, level: 1, skips: [] }, ...blocks],
  };
  return draft;
}
