/**
 * Stories with known speakers, for measuring dialogue attribution (Cast). `gold` lists the speaker of every
 * quotation in reading order, as `findDialogue` finds them. The short stories are written for this corpus;
 * the Austen chapter is the public-domain sample bundled with the app.
 */
import { SAMPLES } from '../../../../apps/mobile/src/import/samples';

export interface CastStory {
  id: string;
  lang: string;
  /** Paragraphs separated by blank lines. */
  text: string;
  /** Speaker key → the names the text may use for them, and their gender. */
  speakers: Record<string, { names: string[]; gender: 'f' | 'm' }>;
  gold: string[];
}

const austen = SAMPLES.find((s) => s.id === 'pride-and-prejudice')?.text ?? '';

export const CAST_CORPUS: CastStory[] = [
  {
    id: 'en-harbour',
    lang: 'en',
    text: [
      '“Where are you going?” asked Anna.',
      '“To the harbour,” said Tom.',
      '“Wait for me.” Anna pulled on her coat. “I want to see the boats.”',
      '“Then hurry,” he said.',
      '“Are they back yet?”',
      '“Not yet.”',
      'Old Mr. Grey looked up from his nets. “You two again,” he grumbled.',
      '“Good morning, Mr. Grey,” Anna said.',
      '“Is it?” the old man asked.',
    ].join('\n\n'),
    speakers: {
      anna: { names: ['Anna'], gender: 'f' },
      tom: { names: ['Tom'], gender: 'm' },
      grey: { names: ['Mr. Grey', 'Grey'], gender: 'm' },
    },
    gold: ['anna', 'tom', 'anna', 'anna', 'tom', 'anna', 'tom', 'grey', 'anna', 'grey'],
  },
  {
    id: 'hi-bazaar',
    lang: 'hi',
    text: [
      '“तुम कहाँ जा रहे हो?” मीरा ने पूछा।',
      '“बाज़ार,” रोहन ने कहा।',
      '“मैं भी चलूँगी।”',
      '“ठीक है, जल्दी करो,” वह बोला।',
      'दादी ने खिड़की से आवाज़ लगाई, “शाम से पहले लौट आना!”',
      '“हाँ दादी!” मीरा हँसकर बोली।',
      '“और मेरे लिए जलेबी लाना,” दादी ने धीरे से कहा।',
      '“पक्का,” रोहन बोला।',
    ].join('\n\n'),
    speakers: {
      meera: { names: ['मीरा'], gender: 'f' },
      rohan: { names: ['रोहन'], gender: 'm' },
      dadi: { names: ['दादी'], gender: 'f' },
    },
    gold: ['meera', 'rohan', 'meera', 'rohan', 'dadi', 'meera', 'dadi', 'rohan'],
  },
  {
    id: 'hinglish-bazaar',
    lang: 'hi',
    text: [
      '"Tum kahan ja rahe ho?" Meera ne poocha.',
      '"Market," Rohan ne kaha.',
      '"Main bhi chalungi."',
      '"Theek hai, jaldi karo," woh bola.',
      'Dadi ne khidki se awaaz lagayi, "Shaam se pehle laut aana!"',
      '"Haan Dadi!" Meera hanste hue boli.',
      '"Aur mere liye jalebi lana," Dadi ne dheere se kaha.',
      '"Pakka," Rohan bola.',
    ].join('\n\n'),
    speakers: {
      meera: { names: ['Meera'], gender: 'f' },
      rohan: { names: ['Rohan'], gender: 'm' },
      dadi: { names: ['Dadi'], gender: 'f' },
    },
    gold: ['meera', 'rohan', 'meera', 'rohan', 'dadi', 'meera', 'dadi', 'rohan'],
  },
  {
    id: 'en-austen-ch1',
    lang: 'en',
    text: austen,
    speakers: {
      mrs: { names: ['Mrs. Bennet'], gender: 'f' },
      mr: { names: ['Mr. Bennet', 'Bennet'], gender: 'm' },
    },
    // prettier-ignore
    gold: [
      'mrs', 'mrs', 'mrs', 'mrs', 'mrs', 'mr', 'mrs', 'mr', 'mrs', 'mr', 'mrs', 'mr', 'mrs', 'mrs', 'mr', 'mrs',
      'mr', 'mrs', 'mr', 'mrs', 'mr', 'mrs', 'mr', 'mrs', 'mr', 'mr', 'mrs', 'mr', 'mrs', 'mr', 'mrs', 'mr',
    ],
  },
];
