import type { Metadata } from 'next';
import Link from 'next/link';
import { Prose } from '../../components/Prose';

export const metadata: Metadata = { title: 'Support', description: 'Help with Lamplight.' };

const ISSUES = 'https://github.com/Himkush1414/keystone-works/issues';

export default function Support() {
  return (
    <Prose title="Support">
      <p>
        Something not working, a word the voice gets wrong, or an idea? We read every message. Please include
        your phone model and Android version, and never send us a document you aren’t happy to share.
      </p>

      <h2>Get in touch</h2>
      <p>
        <a href={ISSUES}>Open an issue on GitHub</a>. That’s the quickest way to reach us while Lamplight is
        getting ready for Google Play. A support email will be listed here at launch.
      </p>

      <h2>Quick answers</h2>
      <h3>A name is pronounced wrong</h3>
      <p>Add it to your pronunciation dictionary in Settings: write the word, and how it should sound.</p>
      <h3>The wrong voice speaks a line</h3>
      <p>
        Tap the coloured speaker name before the line and choose who says it. Lamplight remembers it for the
        book, and the lines after it follow.
      </p>
      <h3>A PDF reads page numbers or headers</h3>
      <p>
        Clean Read skips them in most PDFs. Open the Clean Read sheet in the player to see what was skipped
        and change it. Scanned PDFs without text can’t be read.
      </p>
      <h3>Refunds</h3>
      <p>
        See the <Link href="/refunds">refund policy</Link>.
      </p>
    </Prose>
  );
}
