import { parseDocument } from 'htmlparser2';
import { type Element, isTag } from 'domhandler';
import { getAttributeValue, getElementsByTagName, textContent } from 'domutils';
import { ImportError, type Block, type Chapter, type DocumentDraft } from '../model';
import { readZip, text } from './zip';

const xml = (s: string) => parseDocument(s, { xmlMode: true, decodeEntities: true });
const attr = (el: Element | undefined, name: string) => (el ? getAttributeValue(el, name) : undefined);
const first = (el: Element, name: string) => getElementsByTagName(name, el.children, true, 1)[0];

interface StyleInfo {
  name: string;
  outline?: number;
}

function readStyles(data: Uint8Array | undefined): Map<string, StyleInfo> {
  const styles = new Map<string, StyleInfo>();
  if (!data) return styles;
  for (const s of getElementsByTagName('w:style', xml(text(data)).children, true)) {
    const id = attr(s, 'w:styleId');
    if (!id) continue;
    const name = attr(first(s, 'w:name'), 'w:val') ?? id;
    const lvl = attr(first(s, 'w:outlineLvl'), 'w:val');
    styles.set(id, lvl !== undefined ? { name, outline: Number(lvl) } : { name });
  }
  return styles;
}

/** Text of a paragraph: runs, tabs and breaks; footnote references and deleted text are left out. */
function paragraphText(p: Element): string {
  let out = '';
  const walk = (el: Element) => {
    for (const c of el.children) {
      if (!isTag(c)) continue;
      switch (c.name) {
        case 'w:t':
          out += textContent(c);
          break;
        case 'w:tab':
          out += ' ';
          break;
        case 'w:br':
        case 'w:cr':
          out += ' ';
          break;
        case 'w:del':
        case 'w:footnoteReference':
        case 'w:endnoteReference':
        case 'w:instrText':
          break;
        default:
          walk(c);
      }
    }
  };
  walk(p);
  return out.replace(/\s+/g, ' ').trim();
}

export function parseDocx(bytes: Uint8Array, fallbackTitle = 'Untitled document'): DocumentDraft {
  const files = readZip(bytes);
  const main = files.get('word/document.xml');
  if (!main) throw new ImportError('corrupt');
  const styles = readStyles(files.get('word/styles.xml'));
  const doc = xml(text(main));
  const body = getElementsByTagName('w:body', doc.children, true, 1)[0];
  if (!body) throw new ImportError('corrupt');

  const blocks: Block[] = [];
  const pushParagraph = (p: Element) => {
    const t = paragraphText(p);
    if (!t) return;
    const styleId = attr(first(p, 'w:pStyle'), 'w:val') ?? '';
    const style = styles.get(styleId);
    const name = (style?.name ?? styleId).toLowerCase();
    const directOutline = attr(first(p, 'w:outlineLvl'), 'w:val');
    const outline = directOutline !== undefined ? Number(directOutline) : style?.outline;
    const headingMatch = /^(?:heading|überschrift|titre|título|titolo|kop)\s*(\d)$/.exec(name);
    if (name === 'title') blocks.push({ kind: 'heading', text: t, level: 1, skips: [] });
    else if (outline !== undefined && outline < 9)
      blocks.push({ kind: 'heading', text: t, level: Math.min(6, outline + 1), skips: [] });
    else if (headingMatch)
      blocks.push({ kind: 'heading', text: t, level: Math.min(6, Number(headingMatch[1])), skips: [] });
    else if (/quote|zitat|cita|citation/.test(name)) blocks.push({ kind: 'quote', text: t, skips: [] });
    else if (/caption|beschriftung|légende|epígrafe|didascalia/.test(name))
      blocks.push({ kind: 'caption', text: t, skips: [] });
    else if (first(p, 'w:numPr') || /list/.test(name)) blocks.push({ kind: 'list', text: t, skips: [] });
    else blocks.push({ kind: 'paragraph', text: t, skips: [] });
  };

  for (const child of body.children) {
    if (!isTag(child)) continue;
    if (child.name === 'w:p') pushParagraph(child);
    else if (child.name === 'w:tbl') {
      for (const row of getElementsByTagName('w:tr', child.children, true)) {
        const cells = getElementsByTagName('w:tc', row.children, true)
          .map((tc) =>
            getElementsByTagName('w:p', tc.children, true).map(paragraphText).filter(Boolean).join(' '),
          )
          .filter(Boolean);
        if (cells.length) blocks.push({ kind: 'paragraph', text: cells.join(', '), skips: [] });
      }
    } else if (child.name === 'w:sdt') {
      for (const p of getElementsByTagName('w:p', child.children, true)) pushParagraph(p);
    }
  }
  if (!blocks.length) throw new ImportError('empty');

  const core = files.get('docProps/core.xml');
  const coreDoc = core ? xml(text(core)) : null;
  const coreText = (tag: string) => {
    const el = coreDoc ? getElementsByTagName(tag, coreDoc.children, true, 1)[0] : undefined;
    return el ? textContent(el).trim() : '';
  };
  const title = coreText('dc:title') || blocks.find((b) => b.kind === 'heading')?.text || fallbackTitle;
  const author = coreText('dc:creator');
  const language = coreText('dc:language').toLowerCase();

  const top = Math.min(...blocks.filter((b) => b.kind === 'heading').map((b) => b.level ?? 1));
  const heads = blocks.map((b, i) => ({ b, i })).filter(({ b }) => b.kind === 'heading' && b.level === top);
  const chapters: Chapter[] =
    heads.length >= 2
      ? heads.map(({ b, i }, k) => ({ title: b.text, level: 1, blockStart: k === 0 ? 0 : i }))
      : [{ title: '', level: 1, blockStart: 0 }];

  return {
    meta: { title, kind: 'document', ...(author ? { author } : {}), ...(language ? { language } : {}) },
    chapters,
    blocks,
  };
}
