import { strToU8, zipSync, type Zippable } from 'fflate';

export interface EpubFixture {
  version?: 2 | 3;
  title?: string;
  author?: string;
  language?: string;
  chapters?: { file: string; html: string; title: string }[];
  extra?: Record<string, string | Uint8Array>;
  cover?: boolean;
  omitToc?: boolean;
}

const xhtml = (title: string, body: string) =>
  `<?xml version="1.0" encoding="utf-8"?>\n<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${title}</title></head><body>${body}</body></html>`;

export const defaultChapters = [
  {
    file: 'text/ch1.xhtml',
    title: 'Chapter One',
    html: '<h1>Chapter One</h1><p>The lamp was lit.</p><p>“Who is there?” she asked.</p>',
  },
  {
    file: 'text/ch2.xhtml',
    title: 'Chapter Two',
    html: '<h1>Chapter Two</h1><p>Morning came slowly.</p>',
  },
];

/** Builds a small, valid EPUB (2 or 3) in memory for tests. */
export function makeEpub(opts: EpubFixture = {}): Uint8Array {
  const version = opts.version ?? 3;
  const chapters = opts.chapters ?? defaultChapters;
  const files: Zippable = {
    mimetype: [strToU8('application/epub+zip'), { level: 0 }],
    'META-INF/container.xml': strToU8(
      '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    ),
  };
  const manifest: string[] = [];
  const spine: string[] = [];
  chapters.forEach((c, i) => {
    files[`OEBPS/${c.file}`] = strToU8(xhtml(c.title, c.html));
    manifest.push(`<item id="c${i}" href="${c.file}" media-type="application/xhtml+xml"/>`);
    spine.push(`<itemref idref="c${i}"/>`);
  });
  if (!opts.omitToc) {
    if (version === 3) {
      files['OEBPS/nav.xhtml'] = strToU8(
        xhtml(
          'Contents',
          `<nav epub:type="toc" xmlns:epub="http://www.idpf.org/2007/ops"><ol>${chapters
            .map((c) => `<li><a href="${c.file}">${c.title}</a></li>`)
            .join('')}</ol></nav>`,
        ),
      );
      manifest.push('<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>');
    } else {
      files['OEBPS/toc.ncx'] = strToU8(
        `<?xml version="1.0"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><navMap>${chapters
          .map(
            (c, i) =>
              `<navPoint id="n${i}" playOrder="${i + 1}"><navLabel><text>${c.title}</text></navLabel><content src="${c.file}"/></navPoint>`,
          )
          .join('')}</navMap></ncx>`,
      );
      manifest.push('<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>');
    }
  }
  if (opts.cover) {
    files['OEBPS/images/cover.jpg'] = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    manifest.push(
      version === 3
        ? '<item id="cover" href="images/cover.jpg" media-type="image/jpeg" properties="cover-image"/>'
        : '<item id="cover" href="images/cover.jpg" media-type="image/jpeg"/>',
    );
  }
  const meta = [
    `<dc:title>${opts.title ?? 'The Quiet Lamp'}</dc:title>`,
    opts.author === '' ? '' : `<dc:creator>${opts.author ?? 'Ada Reed'}</dc:creator>`,
    `<dc:language>${opts.language ?? 'en'}</dc:language>`,
    opts.cover && version === 2 ? '<meta name="cover" content="cover"/>' : '',
  ].join('');
  files['OEBPS/content.opf'] = strToU8(
    `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="${version}.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/">${meta}</metadata><manifest>${manifest.join('')}</manifest><spine${version === 2 && !opts.omitToc ? ' toc="ncx"' : ''}>${spine.join('')}</spine></package>`,
  );
  for (const [k, v] of Object.entries(opts.extra ?? {})) files[k] = typeof v === 'string' ? strToU8(v) : v;
  return zipSync(files);
}
