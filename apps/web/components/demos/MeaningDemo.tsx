'use client';

import { useState } from 'react';
import d from './demos.module.css';
import s from './MeaningDemo.module.css';

interface Sense {
  lemma: string;
  pos: string | null;
  definition: string;
  hindi: string[];
  roman: string | null;
}
interface Passage {
  lang: string;
  text: string;
  words: string[];
  meanings: Record<string, Sense | null>;
}

/** "What does this word mean here?": tap a word in the passage; the sense is the one that fits the passage. */
export function MeaningDemo({ passages }: { passages: Passage[] }) {
  const [p, setP] = useState(0);
  const [word, setWord] = useState<string | null>(null);
  const passage = passages[p];
  if (!passage) return null;
  const sense = word ? passage.meanings[word] : null;
  const parts = passage.text.split(new RegExp(`(${passage.words.join('|')})`, 'u'));
  return (
    <div className={d.phone}>
      <div className={d.screen} style={{ minHeight: 380 }}>
        <div className={d.bar}>
          <span>Meaning</span>
          <span className={d.row} role="radiogroup" aria-label="Language">
            {passages.map((x, i) => (
              <button
                key={x.lang}
                type="button"
                role="radio"
                aria-checked={p === i}
                className={`${d.chip} ${s.lang}`}
                onClick={() => (setP(i), setWord(null))}
              >
                {x.lang === 'hi' ? 'हिन्दी' : 'English'}
              </button>
            ))}
          </span>
        </div>
        <p className={`${d.reading} ${s.passage}`} lang={passage.lang}>
          {parts.map((part, i) =>
            passage.words.includes(part) && passage.meanings[part] ? (
              <button
                key={i}
                type="button"
                className={s.word}
                aria-pressed={word === part}
                onClick={() => setWord(part)}
              >
                {part}
              </button>
            ) : (
              <span key={i}>{part}</span>
            ),
          )}
        </p>
        <p className={`${d.small} ${d.faint} ${s.hint}`}>
          Tap an underlined word. In the app: pause, then touch any word.
        </p>
        <div className={d.sheet} data-open={!!sense} aria-hidden={!sense} aria-live="polite">
          <div className={d.grip} />
          {sense && (
            <>
              <p className={s.lemma} lang={passage.lang}>
                {sense.lemma} {sense.roman && <span className={d.faint}>({sense.roman})</span>}
              </p>
              {sense.pos && <p className={`${d.small} ${d.faint}`}>{sense.pos}</p>}
              <p className={s.def}>{sense.definition}</p>
              {sense.hindi.length > 0 && passage.lang !== 'hi' && (
                <p className={d.small} lang="hi">
                  <span className={d.faint}>हिन्दी: </span>
                  {sense.hindi.join(', ')}
                </p>
              )}
              <button type="button" className={d.chip} onClick={() => setWord(null)}>
                Close
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
