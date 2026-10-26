import Link from 'next/link';
import { HeroDemo } from '../components/HeroDemo';
import { PlayButton } from '../components/PlayButton';
import { sampleById } from '../lib/samples';
import { flatten } from '../lib/timeline';
import styles from './page.module.css';

const LANGUAGES = [
  'English',
  'हिन्दी',
  'Español',
  'Français',
  'Deutsch',
  'Português',
  'Italiano',
  'Nederlands',
  'Polski',
  'Русский',
  'Українська',
  'Türkçe',
  'العربية',
  '日本語',
  '한국어',
  'Tiếng Việt',
  'Bahasa Indonesia',
  'Svenska',
  'Dansk',
  'Suomi',
  'Čeština',
  'Ελληνικά',
];

const FAQ: [string, string][] = [
  [
    'When can I get it?',
    'Lamplight is coming to Google Play for Android phones and tablets. The button on this page will work the day it’s live.',
  ],
  [
    'Does it really work without the internet?',
    'Yes. The voices are inside the app and run on your phone’s own processor. Airplane mode is fine. The internet is only used if you import a web article, or choose to send a crash report.',
  ],
  [
    'What can it read?',
    'EPUB books, PDFs with selectable text, Word documents, plain text, Markdown, web pages and articles you share to it. It can’t open DRM-protected books, and scanned PDFs need text in them (OCR).',
  ],
  [
    'Is there a subscription?',
    'No. You pay once on Google Play, and updates are included. No ads, no account, no in-app purchases.',
  ],
  [
    'Which languages?',
    'Voices for 31 languages are built in, including English and Hindi. Hindi stories can switch to an English voice for English words, and Hinglish written in Latin letters is read as Hindi.',
  ],
  [
    'How big is the download?',
    'Around 240 MB today, because the voices live inside the app. That’s what lets it read offline.',
  ],
  [
    'Can I try it on the web?',
    'You can listen to short samples here, prepared with the same voices. Reading your own books and documents is what the app is for.',
  ],
];

export default function Home() {
  const pride = sampleById('pride-and-prejudice');
  const shown = pride ? flatten(pride).slice(0, 6) : [];

  return (
    <>
      <section className={styles.hero}>
        <div className={styles.heroText}>
          <p className={styles.kicker}>Coming soon to Google Play</p>
          <h1 className={styles.display}>
            Books, read aloud by a voice that <em>lives on your phone.</em>
          </h1>
          <p className={styles.lede}>
            Lamplight reads your books, PDFs and articles in natural voices that run entirely on your device.
            Every sentence lights up as it’s spoken. No account, no internet, no subscription.
          </p>
          <div className={styles.actions}>
            <PlayButton id="play-hero" />
            <Link href="/listen" className={styles.secondary}>
              Listen to samples <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
        {pride && <HeroDemo title={pride.title} audio={pride.audio} shown={shown} />}
      </section>

      <section className={styles.band} aria-labelledby="cast">
        <div className={styles.split}>
          <div>
            <p className={styles.kicker}>Cast</p>
            <h2 id="cast" className={styles.h2}>
              Dialogue that sounds like people talking.
            </h2>
            <p className={styles.body}>
              Cast finds who says each line and gives every character a voice of their own, with the narrator
              in between. It works in English and in Hindi, from Austen to Premchand. If it guesses wrong, one
              tap on the speaker’s name fixes it, and the rest of the story follows.
            </p>
            <p className={styles.body}>
              <Link href="/listen/alice-tea-party">Hear the Mad Tea-Party</Link> ·{' '}
              <Link href="/listen/panch-parmeshwar" lang="hi">
                पंच परमेश्वर सुनें
              </Link>
            </p>
          </div>
          <div className={styles.castCard} aria-hidden="true">
            <p>
              <span className={styles.label} data-c="0">
                Alice
              </span>
              “There’s plenty of room!”
            </p>
            <p>
              <span className={styles.label} data-c="1">
                March Hare
              </span>
              “Have some wine.”
            </p>
            <p>
              <span className={styles.label} data-c="0">
                Alice
              </span>
              “I don’t see any wine.”
            </p>
            <p lang="hi">
              <span className={styles.label} data-c="2">
                खाला
              </span>
              “बेटा, क्या बिगाड़ के डर से ईमान की बात न कहोगे?”
            </p>
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="clean">
        <div className={styles.split}>
          <div className={styles.pdf} aria-hidden="true">
            <div className={`${styles.pdfLine} ${styles.skip}`}>JOURNAL OF APPLIED THINGS · VOL. 12</div>
            <p>
              Reading aloud changes how we remember a text
              <sup className={styles.skip}>14</sup>. Listeners in the study recalled more of what they heard
              when the voice paused at the ends of sen-
              <br />
              tences <span className={styles.skip}>(Ortiz &amp; Rao, 2019)</span>.
            </p>
            <div className={`${styles.pdfLine} ${styles.skip}`}>— 37 —</div>
          </div>
          <div>
            <p className={styles.kicker}>Clean Read</p>
            <h2 id="clean" className={styles.h2}>
              PDFs, without the clutter read out.
            </h2>
            <p className={styles.body}>
              Running headers, page numbers, footnote markers and citations are skipped, and words broken
              across lines are joined back together. Columns are read in order. You can see exactly what was
              skipped and bring anything back.
            </p>
          </div>
        </div>
      </section>

      <section className={styles.band} aria-labelledby="languages">
        <div className={styles.narrow}>
          <p className={styles.kicker}>Voices</p>
          <h2 id="languages" className={styles.h2}>
            31 languages, already on your phone.
          </h2>
          <p className={styles.body}>
            Ten natural voices for every language, prepared ahead at studio quality while you listen. Slow
            down to 0.75× or speed up to 2× without the chipmunk effect.
          </p>
          <ul className={styles.chips}>
            {LANGUAGES.map((l) => (
              <li key={l}>{l}</li>
            ))}
            <li className={styles.more}>and 9 more</li>
          </ul>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="private">
        <div className={styles.three}>
          <div>
            <h2 id="private" className={styles.h3}>
              Private by design
            </h2>
            <p>
              No sign-in, no analytics, no trackers, no ads. What you read stays on your phone. We couldn’t
              see it if we wanted to.
            </p>
          </div>
          <div>
            <h3 className={styles.h3}>Made for listening</h3>
            <p>
              Lock-screen and headphone controls, a sleep timer that can stop at the end of a chapter, and
              your own pronunciation dictionary for names the voice gets wrong.
            </p>
          </div>
          <div>
            <h3 className={styles.h3}>Comfortable to read</h3>
            <p>
              Reading themes from bright paper to warm night, set in Literata, with a coloured name before
              each line of dialogue. Built for large text.
            </p>
          </div>
        </div>
      </section>

      <section id="promise" className={styles.promise} aria-labelledby="promise-title">
        <div className={styles.narrow}>
          <p className={styles.kicker}>Our promise</p>
          <h2 id="promise-title" className={styles.h2}>
            Bought once. Yours for good.
          </h2>
          <p className={styles.body}>
            Lamplight will never become a subscription, never show ads, and never take away features you paid
            for. Updates are included.
          </p>
        </div>
      </section>

      <section id="faq" className={styles.section} aria-labelledby="faq-title">
        <div className={styles.narrow}>
          <h2 id="faq-title" className={styles.h2}>
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
        </div>
      </section>

      <section id="get" className={styles.get} aria-labelledby="get-title">
        <div className={styles.narrow}>
          <h2 id="get-title" className={styles.display2}>
            Let it read to you.
          </h2>
          <div className={styles.actions}>
            <PlayButton id="play-get" />
          </div>
        </div>
      </section>
    </>
  );
}
