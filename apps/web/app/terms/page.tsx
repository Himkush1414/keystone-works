import type { Metadata } from 'next';
import Link from 'next/link';
import { Prose } from '../../components/Prose';

export const metadata: Metadata = { title: 'Terms of use', description: 'The terms for using Lamplight.' };

export default function Terms() {
  return (
    <Prose title="Terms of use" updated="26 October 2026">
      <p>
        These terms apply to the Lamplight app and this website. By installing or using Lamplight you agree to
        them.
      </p>

      <h2>Your licence</h2>
      <p>
        When you buy Lamplight on Google Play you get a personal, non-exclusive licence to use it on the
        devices linked to your Google account, under Google Play’s terms. Updates are included. Lamplight has
        no subscription and no in-app purchases.
      </p>

      <h2>Your documents</h2>
      <p>
        You decide what Lamplight reads. Only open material you have the right to use, and respect the
        copyright of the books and documents you import, including any audio you make from them. Lamplight
        does not remove DRM and cannot open DRM-protected files.
      </p>

      <h2 id="voice-model">Rules that come with the voices</h2>
      <p>
        Lamplight’s voices use the Supertonic 3 model by Supertone Inc., licensed under the{' '}
        <a href="/licenses/supertonic-3-open-rail-m.txt">BigScience Open RAIL-M License</a>. That licence
        requires everyone who uses the model, including you, to follow its use restrictions. You agree not to
        use Lamplight or audio made with it:
      </p>
      <ol type="a">
        <li>in any way that breaks any applicable law or regulation;</li>
        <li>to exploit or harm minors in any way;</li>
        <li>to make or spread verifiably false information with the purpose of harming others;</li>
        <li>to make or spread personal information that can be used to harm a person;</li>
        <li>
          to publish generated content in any context without clearly saying that it is machine-generated;
        </li>
        <li>to defame, disparage or harass others;</li>
        <li>to impersonate, or try to impersonate, anyone without their consent;</li>
        <li>
          for fully automated decisions that adversely affect a person’s legal rights or create or change a
          binding obligation;
        </li>
        <li>
          to discriminate against or harm people or groups based on their social behaviour or known or
          predicted personal or personality characteristics;
        </li>
        <li>
          to exploit the vulnerabilities of a group of people based on age or social, physical or mental
          characteristics in a way that causes or is likely to cause physical or psychological harm;
        </li>
        <li>to discriminate against people or groups based on legally protected characteristics;</li>
        <li>to provide medical advice or interpret medical results;</li>
        <li>
          to make or spread information for the administration of justice, law enforcement, immigration or
          asylum processes, such as predicting that someone will commit fraud or a crime.
        </li>
      </ol>

      <h2>Samples on this website</h2>
      <p>
        The samples are public-domain texts read by Lamplight’s voices. You’re welcome to listen to them;
        please don’t present the recordings as made by a person.
      </p>

      <h2>No warranty</h2>
      <p>
        We work hard to make Lamplight reliable, but it is provided “as is”. Voices can mispronounce words,
        Cast can give a line to the wrong speaker, and Clean Read can skip something it shouldn’t. Don’t rely
        on Lamplight where a mistake could cause harm. To the extent the law allows, we are not liable for
        indirect or consequential losses from using it. Nothing in these terms limits rights you have under
        consumer law that can’t be excluded.
      </p>

      <h2>Refunds</h2>
      <p>
        See the <Link href="/refunds">refund policy</Link>.
      </p>

      <h2>Changes and law</h2>
      <p>
        We may update these terms; the date above will change and the new terms apply from then. These terms
        are governed by the laws of the country where the developer of Lamplight is established, without
        taking away the protection of the consumer laws of the country where you live.
      </p>

      <h2>Contact</h2>
      <p>
        See <Link href="/support">Support</Link>.
      </p>
    </Prose>
  );
}
