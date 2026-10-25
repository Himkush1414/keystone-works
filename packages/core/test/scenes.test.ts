import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { VOICE_CATALOG } from '../src/cast/catalog';
import { assignVoices } from '../src/cast/voices';
import { defaultCleanSettings } from '../src/clean/detect';
import { parsePlainText } from '../src/import/text';
import { TURN } from '../src/perform/plan';
import { buildQueue, prepareDocument, type QueueSegment } from '../src/pipeline';

/**
 * Sample scenes for turn-taking and character voices. Their queues are also the fixture the engine's
 * SceneRenderTest renders to audio (UPDATE_SCENES=1 rewrites it).
 */
export const SCENES: Record<string, string> = {
  'en-two': [
    '“Are you coming tonight?” Anna asked.',
    '“I can’t,” said Tom. “I have to work late again.”',
    '“Again?”',
    '“Again.”',
  ].join('\n\n'),
  'en-argument': [
    '“You promised me you would be there,” said Maya.',
    '“I said I would try,” Ravi said. “That is not the same thing, and you know—”',
    '“It is exactly the same thing!” Maya shouted.',
    '“Both of you, stop it,” said Grandmother quietly. “Sit down, both of you.”',
  ].join('\n\n'),
  'en-narrator-one': [
    'The old man looked out at the sea for a long time. The boats were coming in, one by one.',
    '“They always come back,” the old man said at last. “Every evening, they come back.”',
  ].join('\n\n'),
  'en-whisper': [
    '“Don’t move,” she whispered. “Someone is outside the door.”',
    'He held his breath and waited.',
  ].join('\n\n'),
  'hi-family': [
    '“तुम कहाँ जा रहे हो?” माँ ने पूछा।',
    '“बाज़ार,” रोहन ने कहा। “जल्दी आ जाऊँगा।”',
    '“अँधेरा होने से पहले लौट आना,” दादी ने धीरे से कहा।',
  ].join('\n\n'),
  'hinglish-exam': [
    '“Kal exam hai, aur maine kuch nahi padha,” Kabir ne kaha.',
    '“Relax yaar, hum saath mein padhenge,” Neha boli.',
  ].join('\n\n'),
};

function queueOf(text: string, lang: string) {
  const draft = parsePlainText(text, 'Scene', 'book');
  const doc = prepareDocument({ ...draft, meta: { ...draft.meta, language: lang } });
  const assignment = assignVoices(doc.characters, 'F1', VOICE_CATALOG);
  const q = buildQueue(
    { ...doc, blocks: doc.draft.blocks, chapters: doc.draft.chapters, language: doc.language },
    { clean: defaultCleanSettings('book', false), assignment, castMode: 'full' },
  );
  return { q, doc, assignment };
}

const fixture = fileURLToPath(
  new URL(
    '../../../apps/mobile/modules/lamplight-engine/engine-core-jvm/src/test/resources/scenes.json',
    import.meta.url,
  ),
);

describe('sample scenes', () => {
  const built = Object.fromEntries(
    Object.entries(SCENES).map(([name, text]) => [name, queueOf(text, name.startsWith('en') ? 'en' : 'hi')]),
  );

  it('gives every speaker in a scene a sound of their own (voice, register, pace)', () => {
    for (const [name, { q }] of Object.entries(built)) {
      const bySpeaker = new Map<string, Set<string>>();
      const dialogue = q.filter((s) => s.kind === 'dialogue');
      for (const s of dialogue) {
        const key = `${s.voice}`;
        bySpeaker.set(key, (bySpeaker.get(key) ?? new Set()).add(s.text));
      }
      const voices = new Set(dialogue.map((s) => s.voice));
      if (name !== 'en-narrator-one' && name !== 'en-whisper') expect(voices.size, name).toBeGreaterThan(1);
      for (const s of dialogue) expect(s.voice, `${name}: ${s.text}`).not.toBe('F1');
    }
  });

  it('hands over quickly, and an interrupted line is cut off', () => {
    const arg = built['en-argument']?.q ?? [];
    const cut = arg.find((s) => s.text.endsWith('know—') || s.ending === 'cut');
    expect(cut?.ending).toBe('cut');
    expect(cut?.pauseMs).toBe(TURN.interrupt);
    const two = built['en-two']?.q ?? [];
    const again = two.findIndex((s) => s.text.includes('Again?'));
    expect(two[again]?.pauseMs).toBe(TURN.quick);
  });

  it('matches the engine fixture', () => {
    const scenes = Object.fromEntries(
      Object.entries(built).map(([name, { q }]) => [name, q.map((s: QueueSegment) => ({ ...s }))]),
    );
    const json = `${JSON.stringify(scenes, null, 1)}\n`;
    if (process.env.UPDATE_SCENES) writeFileSync(fixture, json);
    expect(readFileSync(fixture, 'utf8')).toBe(json);
  });

  it('prints each scene as planned', () => {
    for (const [name, { q }] of Object.entries(built)) {
      for (const s of q) {
        if (!s.text) continue;
        const how = [
          s.voice,
          s.rate ? `×${s.rate}` : '',
          s.pitch ? `${s.pitch > 0 ? '+' : ''}${s.pitch} st` : '',
          s.gainDb ? `${s.gainDb} dB` : '',
          s.ending ?? '',
        ]
          .filter(Boolean)
          .join(' ');
        process.stdout.write(
          `scene ${name.padEnd(16)} ${how.padEnd(26)} then ${String(s.pauseMs).padStart(4)} ms  ${s.text}\n`,
        );
      }
    }
  });
});
