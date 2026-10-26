import { describe, expect, it } from 'vitest';
import { analyseCast } from '../src/cast/attribute';

/** Who Cast says speaks each quotation, by the quotation's opening words. */
function speakers(paragraphs: string[], lang: string) {
  const { characters, attributions } = analyseCast(paragraphs, lang);
  const names = new Map(characters.map((c) => [c.id, c]));
  const at = (opening: string) => {
    const block = paragraphs.findIndex((p) => p.includes(opening));
    const start = (paragraphs[block] ?? '').indexOf(opening);
    const a = attributions.find((x) => x.block === block && x.span.start <= start + 1 && start < x.span.end);
    return a?.speaker ? names.get(a.speaker)?.name : undefined;
  };
  return { at, characters };
}

describe('Cast: people, not things', () => {
  const panch = [
    'जुम्मन शेख़ और अलगू चौधरी में गाढ़ी मित्रता थी।',
    'चारों ओर से घूम-घामकर बेचारी खाला अलगू चौधरी के पास आई। लाठी पटक दी और दम लेकर बोली, “बेटा, तुम भी दम भर के लिए मेरी पंचायत में चले आना।”',
    'अलगू ने कहा, “मुझे बुलाकर क्या करोगी? कई गाँव के आदमी तो आवेंगे ही।”',
    'खाला बोली, “अपनी विपद तो सबके आगे रो आई हूँ।”',
    '“यों आने को मैं आ जाऊँगा, मगर पंचायत में मुँह न खोलूँगा,” अलगू ने कहा।',
  ];

  it('never makes the stick a speaker: "लाठी पटक दी और … बोली" is the woman just named', () => {
    const { at, characters } = speakers(panch, 'hi');
    expect(at('बेटा, तुम भी')).toBe('खाला');
    expect(characters.map((c) => c.name)).not.toContain('लाठी');
  });

  it('hears a man in his own words when every tag about him takes ने', () => {
    const { characters } = speakers(panch, 'hi');
    expect(characters.find((c) => c.name === 'अलगू')?.gender).toBe('m');
    expect(characters.find((c) => c.name === 'खाला')?.gender).toBe('f');
  });

  it('never takes a possessive or a speech verb for a name', () => {
    const { characters } = speakers(['मेरे पास पैसे नहीं हैं, बोला, “चलो भाई।”', 'बोली, “ठीक है।”'], 'hi');
    for (const c of characters) expect(['मेरे', 'बोला', 'बोली']).not.toContain(c.name);
  });

  it('gives a woman titled by her husband’s rank a woman’s voice', () => {
    const { characters } = speakers(
      ['चौधराइन ने कहा, “अब तो जाना ही होगा।”', 'हामिद ने कहा, “हम भी चलेंगे।”'],
      'hi',
    );
    expect(characters.find((c) => c.name === 'चौधराइन')?.gender).toBe('f');
  });
});

describe('Cast: lines said by several people', () => {
  it('leaves "No room! No room!" they cried out to no one — not the sleeping Dormouse', () => {
    const alice = [
      'There was a table set out under a tree, and the March Hare and the Hatter were having tea at it: a Dormouse was sitting between them, fast asleep. “Very uncomfortable for the Dormouse,” thought Alice.',
      'The table was a large one, but the three were all crowded together at one corner of it: “No room! No room!” they cried out when they saw Alice coming. “There’s plenty of room!” said Alice indignantly.',
      '“Have some wine,” the March Hare said in an encouraging tone.',
    ];
    const { at } = speakers(alice, 'en');
    expect(at('No room!')).toBeUndefined();
    expect(at('There’s plenty')).toBe('Alice');
    expect(at('Have some wine')).toBe('March Hare');
  });

  it('leaves "सब बोले" to no one', () => {
    const { at } = speakers(['हामिद ने कहा, “चलो मेले चलें।”', 'सब बोले, “हाँ, चलो!”'], 'hi');
    expect(at('हाँ, चलो')).toBeUndefined();
    expect(at('चलो मेले')).toBe('हामिद');
  });
});
