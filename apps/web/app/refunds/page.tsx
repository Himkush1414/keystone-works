import type { Metadata } from 'next';
import Link from 'next/link';
import { Prose } from '../../components/Prose';

export const metadata: Metadata = {
  title: 'Refund policy',
  description: 'How to get a refund for Lamplight on Google Play.',
};

export default function Refunds() {
  return (
    <Prose title="Refund policy" updated="26 October 2026">
      <p>
        We want you to be glad you bought Lamplight. If it isn’t right for you, here’s how to get your money
        back.
      </p>

      <h2>Within 48 hours: through Google Play</h2>
      <p>
        Google Play handles refund requests made within 48 hours of purchase. Open Google Play, go to your
        account’s <strong>Payments &amp; subscriptions → Budget &amp; history</strong>, choose Lamplight and
        request a refund, or use Google’s refund request form. Google decides these requests under its own
        policy.
      </p>

      <h2>Within 14 days: if it doesn’t work on your phone</h2>
      <p>
        If Lamplight doesn’t run properly on your device, for example the voices won’t play or the app won’t
        open, contact us within 14 days of purchase through <Link href="/support">Support</Link> with your
        phone’s model and your Google Play order number (it starts with GPA). We’ll try to fix it; if we
        can’t, we’ll refund you in full.
      </p>

      <h2>Your rights</h2>
      <p>
        This policy adds to, and never reduces, the rights you have under the consumer law where you live.
      </p>
    </Prose>
  );
}
