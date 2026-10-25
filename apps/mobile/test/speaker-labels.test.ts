import { describe, expect, it } from 'vitest';
import { speakerLabels } from '../src/player/readAlong';

const s = (block: number, kind = 'dialogue') =>
  ({ block, kind }) as { block: number; kind: 'dialogue' | 'narration' };
const names = new Map([
  ['anna', 'Anna'],
  ['tom', 'Tom'],
]);

describe('speakerLabels', () => {
  it('labels the first sentence of each turn, with a colour per character', () => {
    const sentences = [s(0), s(0), s(0, 'narration'), s(1), s(2), s(2)];
    const speakers = ['anna', 'anna', undefined, 'tom', 'anna', 'tom'];
    const labels = speakerLabels(sentences, speakers, names, '?', false);
    expect([...labels.keys()]).toEqual([0, 3, 4, 5]);
    expect(labels.get(0)?.name).toBe('Anna');
    expect(labels.get(0)?.color).toBe(labels.get(4)?.color);
    expect(labels.get(3)?.color).not.toBe(labels.get(0)?.color);
  });

  it('marks dialogue nobody was given, and keeps colours by first appearance', () => {
    const labels = speakerLabels([s(0), s(1)], [undefined, 'tom'], names, 'Who?', true);
    expect(labels.get(0)).toMatchObject({ id: null, name: 'Who?' });
    // Tom speaks first among the named, so he takes the first colour whatever the line counts.
    const other = speakerLabels([s(0), s(1)], ['anna', 'tom'], names, '?', true);
    expect(labels.get(1)?.color).toBe(other.get(0)?.color);
  });
});
