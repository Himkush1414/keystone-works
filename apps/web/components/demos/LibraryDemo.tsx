'use client';

import Link from 'next/link';
import { useState } from 'react';
import d from './demos.module.css';
import s from './LibraryDemo.module.css';

export interface Shelved {
  id: string;
  title: string;
  author: string;
  kind: 'Book' | 'Document' | 'Article';
  cover: [bg: string, ink: string, rule: string];
  lang: string;
}

const FILES = [
  { type: 'EPUB', name: 'Middlemarch.epub', title: 'Middlemarch', kind: 'Book' },
  { type: 'PDF', name: 'Quarterly report.pdf', title: 'Quarterly report', kind: 'Document' },
  { type: 'DOCX', name: 'Thesis, chapter 2.docx', title: 'Thesis, chapter 2', kind: 'Document' },
  { type: 'WEB', name: 'An article you shared', title: 'The quiet of libraries', kind: 'Article' },
  { type: 'TXT', name: 'Grandma’s letters.txt', title: 'Grandma’s letters', kind: 'Document' },
] as const;

/**
 * Import and the library: drop in a book, a PDF, a Word file, a shared article or plain text, and it lands
 * on the shelf. Here the shelf holds the four samples (they play); what you "import" shows where it would go.
 */
export function LibraryDemo({ samples }: { samples: Shelved[] }) {
  const [imported, setImported] = useState<(typeof FILES)[number][]>([]);
  const [tab, setTab] = useState<'All' | 'Book' | 'Document' | 'Article'>('All');
  const shelf = [
    ...imported.map((f) => ({ ...f, imported: true as const })),
    ...samples.map((x) => ({ ...x, imported: false as const })),
  ].filter((x) => tab === 'All' || x.kind === tab);
  return (
    <div className={s.wrap}>
      <div className={s.desk} aria-label="Files to open">
        {FILES.map((f) => {
          const done = imported.some((x) => x.name === f.name);
          return (
            <button
              key={f.name}
              type="button"
              className={s.file}
              data-type={f.type}
              disabled={done}
              onClick={() => setImported((xs) => [f, ...xs])}
            >
              <span className={s.type}>{f.type}</span>
              <span className={s.fname}>{f.name}</span>
              <span className={d.faint}>{done ? 'On the shelf' : 'Open'}</span>
            </button>
          );
        })}
      </div>
      <div className={d.phone}>
        <div className={d.screen}>
          <div className={d.bar}>
            <span className={s.libTitle}>Library</span>
            <span className={d.faint}>{shelf.length} items</span>
          </div>
          <div className={s.tabs} role="tablist" aria-label="Shelf">
            {(['All', 'Book', 'Document', 'Article'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                className={s.tab}
                onClick={() => setTab(t)}
              >
                {t === 'All' ? 'All' : `${t}s`}
              </button>
            ))}
          </div>
          <ul className={s.shelf}>
            {shelf.map((x) =>
              x.imported ? (
                <li key={x.name} className={s.item} data-new="true">
                  <span className={s.cover} style={{ background: '#E9DFCB', color: '#2A241C' }}>
                    <span className={s.coverRule} style={{ background: '#9A5B1E' }} />
                    <span className={s.coverTitle}>{x.title}</span>
                  </span>
                  <span className={s.meta}>
                    <span className={s.title}>{x.title}</span>
                    <span className={`${d.small} ${d.faint}`}>In the app: ready to play, offline</span>
                  </span>
                </li>
              ) : (
                <li key={x.id} className={s.item}>
                  <Link href={`/listen/${x.id}`} className={s.link}>
                    <span
                      className={s.cover}
                      style={{ background: x.cover[0], color: x.cover[1] }}
                      lang={x.lang}
                    >
                      <span className={s.coverRule} style={{ background: x.cover[2] }} />
                      <span className={s.coverTitle}>{x.title}</span>
                    </span>
                    <span className={s.meta}>
                      <span className={s.title} lang={x.lang}>
                        {x.title}
                      </span>
                      <span className={`${d.small} ${d.faint}`} lang={x.lang}>
                        {x.author} · Listen
                      </span>
                    </span>
                  </Link>
                </li>
              ),
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
