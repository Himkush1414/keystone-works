import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Reader } from '../../../components/reader/Reader';
import { SAMPLES, sampleById } from '../../../lib/samples';

export const dynamicParams = false;

export function generateStaticParams() {
  return SAMPLES.map((s) => ({ id: s.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const s = sampleById((await params).id);
  return s
    ? {
        title: `${s.title}, read aloud`,
        description: `${s.title} by ${s.author}: a sample read aloud by Lamplight's on-device voices, with Cast giving each speaker a voice.`,
      }
    : {};
}

export default async function SamplePage({ params }: { params: Promise<{ id: string }> }) {
  const sample = sampleById((await params).id);
  if (!sample) notFound();
  return <Reader sample={sample} />;
}
