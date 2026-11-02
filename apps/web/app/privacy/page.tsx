import type { Metadata } from 'next';
import Link from 'next/link';
import { Prose } from '../../components/Prose';

export const metadata: Metadata = {
  title: 'Privacy policy',
  description: 'Lamplight has no account, no analytics and no ads. What you read stays on your phone.',
};

export default function Privacy() {
  return (
    <Prose title="Privacy policy" updated="2 November 2026">
      <p>
        <strong>The short version:</strong> Lamplight has no account, no analytics, no trackers and no ads.
        The documents you open, where you are in them, and the audio made from them stay on your phone. We
        never receive them.
      </p>

      <h2>The Lamplight app</h2>
      <h3>What stays on your phone</h3>
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Where it lives</th>
            <th>Sent to us?</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Copies of the books, documents and articles you import</td>
            <td>The app’s private storage</td>
            <td>No</td>
          </tr>
          <tr>
            <td>
              Your library, reading positions, speaker corrections, pronunciation dictionary and settings
            </td>
            <td>A database in the app’s private storage</td>
            <td>No</td>
          </tr>
          <tr>
            <td>Audio prepared by the voices</td>
            <td>The app’s cache, which you or Android can clear</td>
            <td>No</td>
          </tr>
        </tbody>
      </table>
      <p>The voices run on your phone’s own processor. Text is never sent anywhere to be read aloud.</p>

      <h3>The internet</h3>
      <p>
        Lamplight does not connect to the internet. The Android app doesn’t even ask for the internet
        permission, so it can’t send anything anywhere: no crash reports, no usage statistics, nothing else.
        If a future version offers something that needs the internet, such as crash reports, this policy will
        say so first, and a crash report would be sent only after you have seen its contents and tapped Send,
        with no text from your documents in it.
      </p>

      <h3>Android backups</h3>
      <p>
        Lamplight turns Android’s automatic backup off, so your library is not copied to your Google account
        or anywhere else. The flip side: on a new phone, Lamplight starts with an empty library.
      </p>

      <h3>Google Play</h3>
      <p>
        You buy Lamplight through Google Play. Google processes the payment and tells us about sales in
        aggregate reports; we don’t receive your card details. Google’s privacy policy covers what Google
        collects.
      </p>

      <h2 id="delete-data">Deleting your data</h2>
      <p>
        There is no account to delete. Removing a book in the app deletes its copy and everything about it.
        Uninstalling Lamplight, or clearing its storage in Android settings, deletes all of it. We hold
        nothing that identifies you, so there is nothing for us to delete on our side.
      </p>

      <h2>This website</h2>
      <p>
        This site sets no cookies and runs no analytics or third-party scripts. Fonts and audio are served
        from this site. If you choose a reading theme on a sample, that choice is remembered in your browser’s
        local storage and never leaves your device. Like any web host, our hosting provider (Vercel) keeps
        short-lived server logs, including IP addresses, to run and protect the service.
      </p>

      <h2>Children</h2>
      <p>
        Lamplight is suitable for everyone and collects no personal information from anyone, including
        children.
      </p>

      <h2>Changes</h2>
      <p>
        If this policy changes, the new version will be posted here with a new date before the change takes
        effect in the app.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about privacy are welcome: see <Link href="/support">Support</Link>.
      </p>
    </Prose>
  );
}
