import { PlayButton } from '../components/PlayButton';

export default function Home() {
  return (
    <section style={{ maxWidth: 1200, margin: '0 auto', padding: '64px var(--gutter)' }}>
      <h1 style={{ fontSize: 'clamp(44px, 7vw, 112px)' }}>Lamplight reads to you.</h1>
      <PlayButton id="play-hero" />
    </section>
  );
}
