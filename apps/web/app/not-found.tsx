import Link from 'next/link';

export default function NotFound() {
  return (
    <section style={{ maxWidth: 720, margin: '0 auto', padding: '96px var(--gutter)' }}>
      <h1 style={{ fontSize: 'clamp(36px, 5vw, 64px)' }}>This page isn’t here.</h1>
      <p>
        The link may be old. <Link href="/">Go to the home page</Link> or{' '}
        <Link href="/listen">listen to a sample</Link>.
      </p>
    </section>
  );
}
