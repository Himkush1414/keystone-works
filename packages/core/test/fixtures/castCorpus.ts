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

const sherlock = SAMPLES.find((s) => s.id === 'scandal-in-bohemia')?.text ?? '';

/**
 * Held out: written or labelled after Cast was tuned on the corpus above, and never tuned on. Their scores are
 * the honest estimate of accuracy on new text.
 */
export const HELD_OUT: CastStory[] = [
  {
    id: 'en-rain',
    lang: 'en',
    text: [
      'Maria set the kettle on the stove.',
      '“Where’s your brother?” she asked.',
      '“Out with the dog,” said Leo, not looking up from his book.',
      '“In this rain?”',
      '“He likes the rain.”',
      'The door banged open and Mr. Costa stamped in, shaking water from his hat.',
      '“Who left the gate open?” the old man demanded.',
      '“Sam did,” Leo said quickly.',
      '“Then Sam can fix it,” said Mr. Costa.',
      'Maria laughed. “You’ll have to catch him first.”',
    ].join('\n\n'),
    speakers: {
      maria: { names: ['Maria'], gender: 'f' },
      leo: { names: ['Leo'], gender: 'm' },
      costa: { names: ['Mr. Costa', 'Costa'], gender: 'm' },
    },
    gold: ['maria', 'leo', 'maria', 'leo', 'costa', 'leo', 'costa', 'maria'],
  },
  {
    id: 'hi-family',
    lang: 'hi',
    text: [
      'शाम को पूरा परिवार आँगन में बैठा था।',
      '“आज खाने में क्या बना है?” पिताजी ने पूछा।',
      '“दाल और चावल,” माँ बोली।',
      '“फिर से दाल?” अनु ने नाक सिकोड़ी।',
      '“चुपचाप खाओ,” भैया हँसते हुए बोला।',
      '“तुम भी तो कल शिकायत कर रहे थे!” उसने तुरंत कहा।',
      'पिताजी मुस्कुराए। “बस करो तुम दोनों।”',
    ].join('\n\n'),
    speakers: {
      pitaji: { names: ['पिताजी'], gender: 'm' },
      maa: { names: ['माँ'], gender: 'f' },
      anu: { names: ['अनु'], gender: 'f' },
      bhaiya: { names: ['भैया'], gender: 'm' },
    },
    gold: ['pitaji', 'maa', 'anu', 'bhaiya', 'anu', 'pitaji'],
  },
  {
    id: 'hinglish-chai',
    lang: 'hi',
    text: [
      '"Bhai, chai banaoge?" Priya ne poocha.',
      '"Abhi nahi, match chal raha hai," Arjun bola.',
      '"Toh main khud bana leti hoon."',
      '"Mere liye bhi ek cup," Arjun ne hanste hue kaha.',
      'Mummy kitchen se boli, "Dono ke liye main bana deti hoon!"',
    ].join('\n\n'),
    speakers: {
      priya: { names: ['Priya'], gender: 'f' },
      arjun: { names: ['Arjun'], gender: 'm' },
      mummy: { names: ['Mummy'], gender: 'f' },
    },
    gold: ['priya', 'arjun', 'priya', 'arjun', 'mummy'],
  },
  {
    id: 'en-sherlock',
    lang: 'en',
    text: sherlock,
    speakers: {
      holmes: { names: ['Holmes', 'Sherlock Holmes'], gender: 'm' },
      watson: { names: ['I (narrator)', 'Watson'], gender: 'm' },
    },
    gold: [
      'holmes',
      'holmes',
      'watson',
      'holmes',
      'watson',
      'holmes',
      'watson',
      'watson',
      'holmes',
      'holmes',
    ],
  },
];
