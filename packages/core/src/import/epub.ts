import { parseDocument } from 'htmlparser2';
import { type Element, type Document, isTag } from 'domhandler';
import { getAttributeValue, getElementsByTagName, textContent, findOne } from 'domutils';
import { ImportError, type Block, type Chapter, type DocumentDraft } from '../model';
import { domToBlocks } from './html';
import { readZip, resolveHref, text } from './zip';

interface ManifestItem {
  id: string;
  path: string;
  mediaType: string;
  properties: string;
}

interface TocEntry {
  title: string;
  path: string;
  fragment?: string;
  level: number;
}

const xml = (s: string): Document => parseDocument(s, { xmlMode: true, decodeEntities: true });
const local = (name: string) => name.slice(name.indexOf(':') + 1).toLowerCase();
const byLocal = (doc: Document | Element, name: string) =>
  getElementsByTagName((n) => local(n) === name, doc.children, true);
const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Adobe ADEPT, Apple FairPlay and similar schemes. Font obfuscation alone is not DRM. */
function hasDrm(files: Map<string, Uint8Array>): boolean {
  if (files.has('META-INF/rights.xml') || files.has('META-INF/sinf.xml')) return true;
  const enc = files.get('META-INF/encryption.xml');
  if (!enc) return false;
  const doc = xml(text(enc));
  const FONT_OBFUSCATION = ['http://www.idpf.org/2008/embedding', 'http://ns.adobe.com/pdf/enc#RC'];
  return byLocal(doc, 'encrypteddata').some((ed) => {
    const method = byLocal(ed, 'encryptionmethod')[0];
    const algorithm = method ? getAttributeValue(method, 'Algorithm') : undefined;
    return !algorithm || !FONT_OBFUSCATION.includes(algorithm);
  });
}

function navEntries(doc: Document, base: string): TocEntry[] {
  const navs = byLocal(doc, 'nav');
  const toc =
    navs.find((n) =>
      /\btoc\b/.test(getAttributeValue(n, 'epub:type') ?? getAttributeValue(n, 'role') ?? ''),
    ) ?? navs[0];
  if (!toc) return [];
  const out: TocEntry[] = [];
  const walkList = (list: Element, level: number) => {
    for (const li of list.children) {
      if (!isTag(li) || local(li.name) !== 'li') continue;
      const a =
        findOne((n) => local(n.name) === 'a', li.children, false) ??
        findOne((n) => local(n.name) === 'a', li.children);
      const href = a ? getAttributeValue(a, 'href') : undefined;
      if (a && href) {
        const r = resolveHref(base, href);
        if (r.path)
          out.push({
            title: clean(textContent(a)),
            path: r.path,
            level,
            ...(r.fragment ? { fragment: r.fragment } : {}),
          });
      }
      const sub = li.children.find((c): c is Element => isTag(c) && local(c.name) === 'ol');
      if (sub) walkList(sub, level + 1);
    }
  };
  const ol = byLocal(toc, 'ol')[0];
  if (ol) walkList(ol, 1);
  return out;
}

function ncxEntries(doc: Document, base: string): TocEntry[] {
  const out: TocEntry[] = [];
  const walk = (parent: Element | Document, level: number) => {
    for (const np of parent.children) {
      if (!isTag(np) || local(np.name) !== 'navpoint') continue;
      const label = byLocal(np, 'text')[0];
      const content = byLocal(np, 'content')[0];
      const src = content ? getAttributeValue(content, 'src') : undefined;
      if (src) {
        const r = resolveHref(base, src);
        if (r.path)
          out.push({
            title: clean(label ? textContent(label) : ''),
            path: r.path,
            level,
            ...(r.fragment ? { fragment: r.fragment } : {}),
          });
      }
      walk(np, level + 1);
    }
  };
  const navMap = byLocal(doc, 'navmap')[0];
  if (navMap) walk(navMap, 1);
  return out;
}

export function parseEpub(bytes: Uint8Array, fallbackTitle = 'Untitled book'): DocumentDraft {
  const files = readZip(bytes);
  if (hasDrm(files)) throw new ImportError('drm');

  const container = files.get('META-INF/container.xml');
  if (!container) throw new ImportError('corrupt');
  const rootfile = byLocal(xml(text(container)), 'rootfile')[0];
  const opfPath = rootfile ? resolveHref('', getAttributeValue(rootfile, 'full-path') ?? '').path : null;
  const opfData = opfPath ? files.get(opfPath) : undefined;
  if (!opfPath || !opfData) throw new ImportError('corrupt');
  const opf = xml(text(opfData));

  const metaText = (name: string) => {
    const el = byLocal(opf, name)[0];
    return el ? clean(textContent(el)) : '';
  };
  const title = metaText('title') || fallbackTitle;
  const author = byLocal(opf, 'creator')
    .map((c) => clean(textContent(c)))
    .filter(Boolean)
    .join(', ');
  const language = metaText('language').toLowerCase();

  const manifest = new Map<string, ManifestItem>();
  for (const item of byLocal(opf, 'item')) {
    const id = getAttributeValue(item, 'id');
    const href = getAttributeValue(item, 'href');
    const path = href ? resolveHref(opfPath, href).path : null;
    if (id && path) {
      manifest.set(id, {
        id,
        path,
        mediaType: getAttributeValue(item, 'media-type') ?? '',
        properties: getAttributeValue(item, 'properties') ?? '',
      });
    }
  }

  const spine = byLocal(opf, 'itemref')
    .filter((r) => getAttributeValue(r, 'linear') !== 'no')
    .map((r) => manifest.get(getAttributeValue(r, 'idref') ?? ''))
    .filter((m): m is ManifestItem => !!m && /html|xml/.test(m.mediaType));
  if (!spine.length) throw new ImportError('empty');

  // Table of contents: EPUB 3 nav, else EPUB 2 NCX.
  const navItem = [...manifest.values()].find((m) => m.properties.split(/\s+/).includes('nav'));
  const spineEl = byLocal(opf, 'spine')[0];
  const ncxItem =
    manifest.get(spineEl ? (getAttributeValue(spineEl, 'toc') ?? '') : '') ??
    [...manifest.values()].find((m) => m.mediaType === 'application/x-dtbncx+xml');
  let toc: TocEntry[] = [];
  const navData = navItem ? files.get(navItem.path) : undefined;
  if (navItem && navData) toc = navEntries(parseDocument(text(navData), { xmlMode: false }), navItem.path);
  const ncxData = ncxItem ? files.get(ncxItem.path) : undefined;
  if (!toc.length && ncxItem && ncxData) toc = ncxEntries(xml(text(ncxData)), ncxItem.path);

  // Blocks per spine file.
  const blocks: Block[] = [];
  const fileStart = new Map<string, number>();
  for (const item of spine) {
    const data = files.get(item.path);
    if (!data || item.path === navItem?.path) continue;
    const doc = parseDocument(text(data), { decodeEntities: true, lowerCaseTags: true });
    const body = byLocal(doc, 'body')[0] ?? doc;
    const fileBlocks = domToBlocks(body, { keepBoilerplate: true, dropNegative: false });
    if (!fileBlocks.length) continue;
    fileStart.set(item.path, blocks.length);
    blocks.push(...fileBlocks);
  }
  if (!blocks.length) throw new ImportError('empty');

  const chapters = buildChapters(
    toc,
    fileStart,
    blocks,
    spine.map((s) => s.path),
  );

  // Cover image.
  const coverId = byLocal(opf, 'meta').find((m) => getAttributeValue(m, 'name') === 'cover');
  const coverItem =
    [...manifest.values()].find((m) => m.properties.split(/\s+/).includes('cover-image')) ??
    (coverId ? manifest.get(getAttributeValue(coverId, 'content') ?? '') : undefined);
  const coverData =
    coverItem && coverItem.mediaType.startsWith('image/') ? files.get(coverItem.path) : undefined;

  return {
    meta: {
      title,
      kind: 'book',
      ...(author ? { author } : {}),
      ...(language ? { language } : {}),
      ...(coverItem && coverData ? { cover: { mime: coverItem.mediaType, data: coverData } } : {}),
    },
    chapters,
    blocks,
  };
}

function buildChapters(
  toc: readonly TocEntry[],
  fileStart: ReadonlyMap<string, number>,
  blocks: readonly Block[],
  spineOrder: readonly string[],
): Chapter[] {
  const fileEnd = (path: string) => {
    const idx = spineOrder.indexOf(path);
    for (let i = idx + 1; i < spineOrder.length; i++) {
      const s = fileStart.get(spineOrder[i] ?? '');
      if (s !== undefined) return s;
    }
    return blocks.length;
  };
  const chapters: Chapter[] = [];
  const topLevel = Math.min(...toc.map((t) => t.level), Infinity);
  for (const entry of toc.filter((t) => t.level <= topLevel + 1)) {
    const start = fileStart.get(entry.path);
    if (start === undefined) continue;
    let blockStart = start;
    if (entry.fragment && chapters.some((c) => c.blockStart === start)) {
      // Several entries in one file: find the heading that matches the entry title.
      const end = fileEnd(entry.path);
      const want = entry.title.toLowerCase();
      for (let i = start; i < end; i++) {
        const b = blocks[i];
        if (b?.kind === 'heading' && b.text.toLowerCase().includes(want)) {
          blockStart = i;
          break;
        }
      }
    }
    if (chapters.some((c) => c.blockStart === blockStart)) continue;
    chapters.push({ title: entry.title, level: entry.level - topLevel + 1, blockStart });
  }
  chapters.sort((a, b) => a.blockStart - b.blockStart);
  if (!chapters.length) {
    for (const path of spineOrder) {
      const start = fileStart.get(path);
      if (start === undefined) continue;
      const heading = blocks.slice(start, fileEnd(path)).find((b) => b.kind === 'heading');
      chapters.push({ title: heading?.text ?? '', level: 1, blockStart: start });
    }
  }
  const first = chapters[0];
  if (first && first.blockStart > 0) chapters.unshift({ title: '', level: 1, blockStart: 0 });
  return chapters;
}
