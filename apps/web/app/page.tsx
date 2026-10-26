import Link from 'next/link';
import { coverPalettes } from '@lamplight/tokens';
import demos from '../demos/demos.json';
import { Chapter } from '../components/Chapter';
import { HeroDemo } from '../components/HeroDemo';
import { Interlude } from '../components/Interlude';
import { Lamp } from '../components/Lamp';
import { PlayButton } from '../components/PlayButton';
import { Reveal } from '../components/Reveal';
import { CastDemo, type CastLine } from '../components/demos/CastDemo';
import { ChoiceAudio } from '../components/demos/ChoiceAudio';
import { CleanReadDemo } from '../components/demos/CleanReadDemo';
import { FixDemo } from '../components/demos/FixDemo';
import { LanguagesDemo } from '../components/demos/LanguagesDemo';
import { LibraryDemo, type Shelved } from '../components/demos/LibraryDemo';
import { MeaningDemo } from '../components/demos/MeaningDemo';
import { PlayerDemo } from '../components/demos/PlayerDemo';
import { PrivacyDemo } from '../components/demos/PrivacyDemo';
import { PronunciationDemo } from '../components/demos/PronunciationDemo';
import { SearchDemo } from '../components/demos/SearchDemo';
import { ThemesDemo } from '../components/demos/ThemesDemo';
import { SAMPLES, sampleById } from '../lib/samples';
import { flatten } from '../lib/timeline';
import styles from './page.module.css';

const FAQ: [string, string][] = [
  [
    'When can I get it?',
    'Lamplight is coming to Google Play for Android phones and tablets. The button on this page will work the day it’s live.',
  ],
  [
    'Does it really work without the internet?',
    'Yes. The voices are inside the app and run on your phone’s own processor. Airplane mode is fine. The internet is only used if you import a web article.',
  ],
  [
    'What can it read?',
    'EPUB books, PDFs with selectable text, Word documents, plain text, Markdown, web pages and articles you share to it. It can’t open DRM-protected books, and scanned PDFs need text in them.',
  ],
  [
    'Is there a subscription?',
    'No. You pay once on Google Play, and updates are included. No ads, no account, no in-app purchases.',
  ],
  [
    'Why can’t I try my own book here?',
    'The website plays short excerpts prepared with the same voices. Reading your own books and documents, privately and offline, is what the app is for.',
  ],
  [
    'How big is the download?',
    'Around 240 MB today, because the voices live inside the app. That’s what lets it read offline.',
  ],
];

const QUALITY_NOTES: Record<string, { title: string; note: string }> = {
  live: { title: 'Live', note: 'Starts at once; for older phones.' },
  studio: { title: 'Studio', note: 'High quality, quicker to start.' },
  studioPlus: { title: 'Studio+', note: 'Highest quality, the default. Prepared just ahead of you.' },
};

export default function Home() {
  const pride = sampleById('pride-and-prejudice');
  const prideSentences = pride ? flatten(pride) : [];
  const shelf: Shelved[] = SAMPLES.map((s, i) => ({
    id: s.id,
    title: s.title,
    author: s.author,
    kind: 'Book',
    lang: s.lang,
    cover: (coverPalettes[(i * 3 + 1) % coverPalettes.length] ?? [
      '#2F3A33',
      '#EFE6D2',
      '#C9A35B',
    ]) as Shelved['cover'],
  }));
  const library = SAMPLES.map((s) => ({
    id: s.id,
    title: s.title,
    lang: s.lang,
    audio: s.audio,
    sentences: flatten(s).map(({ text, start, end }) => ({ text, start, end })),
  }));
  const english = demos.languages.find((l) => l.code === 'en');

  return (
    <>
      <section className={`night ${styles.hero}`}>
        <div className={styles.heroInner}>
          <div className={styles.heroText}>
            <p className={styles.eyebrow}>Coming soon to Google Play</p>
            <h1 className={styles.display}>
              Every book, read to you <em>by lamplight.</em>
            </h1>
            <p className={styles.lede}>
              Natural voices that live on your phone read your books, PDFs and articles aloud, each character
              in a voice of their own. No account, no internet, no subscription.
            </p>
            <div className={styles.actions}>
              <PlayButton id="play-hero" />
              <Link href="#library" className={styles.secondary}>
                See it work <span aria-hidden="true">↓</span>
              </Link>
            </div>
          </div>
          <div className={styles.heroArt}>
            <Lamp className={styles.lamp} />
            {pride && <HeroDemo title={pride.title} audio={pride.audio} shown={prideSentences.slice(0, 6)} />}
          </div>
        </div>
        <ul className={styles.facts} aria-label="In short">
          <li>
            <strong>31</strong> languages
          </li>
          <li>
            <strong>10</strong> voices
          </li>
          <li>
            <strong>0</strong> accounts
          </li>
          <li>
            <strong>1</strong> price
          </li>
        </ul>
      </section>

      <Interlude text="Bring it everything you mean to read. It reads the way a person would." />

      <Chapter
        n={1}
        id="library"
        kicker="Import & library"
        title={
          <>
            Bring <em>anything</em> to read.
          </>
        }
        demo={<LibraryDemo samples={shelf} />}
        wide
      >
        <p>
          EPUB books, PDFs, Word files, plain text and Markdown, or an article shared from your browser. Each
          lands on your shelf with a cover, ready to play, offline from then on.
        </p>
        <p>
          Open one of the files. The four samples on the shelf play right here; your own files play in the
          app.
        </p>
      </Chapter>

      <Chapter
        n={2}
        id="search"
        kicker="Search"
        title={
          <>
            Find the line, <em>hear the line.</em>
          </>
        }
        demo={<SearchDemo library={library} />}
        flip
      >
        <p>
          Search every book and document in your library, in any script. Each result is a sentence; touch it
          and the voice starts right there.
        </p>
      </Chapter>

      <Interlude text="Then you press play, and the room goes quiet." />

      <Chapter
        n={3}
        id="player"
        kicker="The player"
        title={
          <>
            Follow along, <em>sentence by sentence.</em>
          </>
        }
        demo={
          pride && (
            <PlayerDemo
              title={pride.title}
              author={pride.author}
              audio={pride.audio}
              durationMs={pride.durationMs}
              sentences={prideSentences}
            />
          )
        }
      >
        <p>
          The sentence being read glows. Tap any other to jump there. Change speed from 0.75× to 2× without
          the chipmunk effect, open the contents, or set a sleep timer that fades out at the end of a chapter.
        </p>
        <p>Lock-screen and headphone controls work as you’d expect.</p>
      </Chapter>

      <Chapter
        n={4}
        id="cast"
        kicker="Cast"
        title={
          <>
            Every character, <em>their own voice.</em>
          </>
        }
        demo={
          <CastDemo
            runs={demos.cast as Record<'off' | 'on' | 'yours', { audio: string; lines: CastLine[] }>}
          />
        }
        flip
      >
        <p>
          Cast finds who says each line, in English and in Hindi, and gives every character a voice of their
          own, with the narrator in between. They take turns like people talking: a quick reply comes quickly,
          a question gets a thoughtful pause.
        </p>
        <p>Don’t like a voice? Choose any of the ten for any character.</p>
      </Chapter>

      <Chapter
        n={5}
        id="speakers"
        kicker="Speaker names"
        title={
          <>
            Who says this? <em>One tap to fix.</em>
          </>
        }
        demo={<FixDemo line={demos.fixLine} options={demos.fix} />}
      >
        <p>
          A small coloured name before each line shows who Lamplight thinks is speaking. If it’s wrong, tap it
          and choose. The book remembers, and the lines after it follow your correction.
        </p>
      </Chapter>

      <Chapter
        n={6}
        id="voice"
        kicker="A natural voice"
        title={
          <>
            Clean by default, <em>dramatic if you like.</em>
          </>
        }
        demo={
          <ChoiceAudio
            label="Voice processing"
            options={[
              {
                id: 'natural',
                title: 'Natural (the default)',
                note: 'The voice exactly as it speaks: pace, pauses and loudness follow the story.',
                audio: demos.emotion.natural,
              },
              {
                id: 'processed',
                title: 'Emotion processing',
                note: 'Also shifts pitch for feeling, and shapes how old or fiery characters end their lines.',
                audio: demos.emotion.processed,
              },
            ]}
          >
            <div className={styles.scene}>
              {demos.emotion.text.map((t) => (
                <p key={t}>{t}</p>
              ))}
            </div>
          </ChoiceAudio>
        }
        flip
      >
        <p>
          Out of the box the voice is left untouched, the cleanest it can be. Whispers are softer, shouts
          louder, and the narrator stays calm. Turn on emotion processing for more colour.
        </p>
      </Chapter>

      <Chapter
        n={7}
        id="quality"
        kicker="Quality"
        title={
          <>
            Studio quality, <em>made on your phone.</em>
          </>
        }
        demo={
          <ChoiceAudio
            label="Quality"
            options={[...demos.quality].reverse().map((q) => ({
              id: q.level,
              title: QUALITY_NOTES[q.level]?.title ?? q.level,
              note: QUALITY_NOTES[q.level]?.note ?? '',
              audio: q.audio,
            }))}
          >
            <p className={styles.quote}>“{demos.qualityText}”</p>
          </ChoiceAudio>
        }
      >
        <p>
          Lamplight prepares the next sentences while you listen, so even modest phones get the highest
          quality. Choose a lighter level if yours needs it.
        </p>
      </Chapter>

      <Interlude text="Reading, not just listening: the page is there whenever you look." />

      <Chapter
        n={8}
        id="clean"
        kicker="Clean Read"
        title={
          <>
            PDFs, <em>without the clutter</em> read out.
          </>
        }
        demo={<CleanReadDemo on={demos.cleanRead.on} off={demos.cleanRead.off} />}
        flip
      >
        <p>
          Running headers, page numbers, footnote markers and citations are skipped, and words broken across
          lines are joined. Columns are read in order. You can always see what was skipped and bring it back.
        </p>
      </Chapter>

      <Chapter
        n={9}
        id="meaning"
        kicker="Word meanings"
        title={
          <>
            What does it <em>mean here?</em>
          </>
        }
        demo={<MeaningDemo passages={demos.meanings} />}
      >
        <p>
          Pause on a word you don’t know and Lamplight explains it, in the sense the passage uses it, from a
          dictionary on your phone. English words come with Hindi equivalents.
        </p>
      </Chapter>

      <Chapter
        n={10}
        id="pronunciation"
        kicker="Pronunciation"
        title={
          <>
            Names, <em>said right.</em>
          </>
        }
        demo={
          <PronunciationDemo
            text={demos.pronunciation.text}
            rules={demos.pronunciation.rules}
            before={demos.pronunciation.before}
            after={demos.pronunciation.after}
          />
        }
        flip
      >
        <p>
          Teach it once: write the word, and how it should sound. Every book you open after that says it your
          way.
        </p>
      </Chapter>

      <Chapter
        n={11}
        id="appearance"
        kicker="Reading appearance"
        title={
          <>
            Paper by day, <em>night after dark.</em>
          </>
        }
        demo={
          <ThemesDemo
            passage={prideSentences
              .slice(0, 2)
              .map((x) => x.text)
              .join(' ')}
          />
        }
      >
        <p>
          Four reading themes, three fonts including Atkinson Hyperlegible and OpenDyslexic, and the size and
          spacing that suit your eyes.
        </p>
      </Chapter>

      <Chapter
        n={12}
        id="languages"
        kicker="31 languages"
        title={
          <>
            Thirty-one languages, <em>already on board.</em>
          </>
        }
        demo={<LanguagesDemo languages={demos.languages} />}
        wide
      >
        <p>
          Every voice speaks all thirty-one, no downloads. A Hindi story switches to English for English
          words, and Hinglish written in Latin letters is read as Hindi.
        </p>
      </Chapter>

      <Interlude text="And it is yours: no one listening in, no one sending a bill." />

      <Chapter
        n={13}
        id="privacy"
        kicker="Private by design"
        title={
          <>
            Nothing you read <em>leaves your phone.</em>
          </>
        }
        demo={english && <PrivacyDemo audio={english.audio} />}
        flip
      >
        <p>
          No sign-in, no analytics, no trackers, no ads. The voices run on your phone, so it reads on a plane,
          in a tunnel, in the middle of nowhere. <Link href="/privacy">The privacy policy</Link> is short.
        </p>
      </Chapter>

      <section id="promise" className={styles.promise} aria-labelledby="promise-title">
        <Reveal className={styles.promiseInner}>
          <div>
            <p className={styles.eyebrowDark}>XIV · One purchase</p>
            <h2 id="promise-title" className={styles.promiseTitle}>
              Bought once. <em>Yours for good.</em>
            </h2>
            <p className={styles.promiseBody}>
              Lamplight will never become a subscription, never show ads, and never take away features you
              paid for. Updates are included.
            </p>
          </div>
          <div className={styles.receipt} aria-label="What you pay for">
            <p className={styles.receiptHead}>Lamplight</p>
            <dl>
              <div>
                <dt>One purchase on Google Play</dt>
                <dd>once</dd>
              </div>
              <div>
                <dt>Subscription</dt>
                <dd>none</dd>
              </div>
              <div>
                <dt>Ads</dt>
                <dd>none</dd>
              </div>
              <div>
                <dt>Account</dt>
                <dd>none</dd>
              </div>
              <div>
                <dt>Updates</dt>
                <dd>included</dd>
              </div>
            </dl>
            <p className={styles.receiptFoot}>Coming soon</p>
          </div>
        </Reveal>
      </section>

      <section id="faq" className={styles.faqWrap} aria-labelledby="faq-title">
        <Reveal className={styles.narrow}>
          <h2 id="faq-title" className={styles.faqTitle}>
            Questions
          </h2>
          <div className={styles.faq}>
            {FAQ.map(([q, a]) => (
              <details key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </Reveal>
      </section>

      <section id="get" className={`night ${styles.get}`} aria-labelledby="get-title">
        <Lamp className={styles.getLamp} />
        <h2 id="get-title" className={styles.getTitle}>
          Let it read to you.
        </h2>
        <div className={styles.actions}>
          <PlayButton id="play-get" />
          <Link href="/listen" className={styles.secondary}>
            Listen to the samples <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
    </>
  );
}
