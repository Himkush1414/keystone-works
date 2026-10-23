import { describe, expect, it } from 'vitest';
import { cardinal, ordinal, year } from '../src/text/numbers';
import { lineLanguage, detectLanguage } from '../src/text/language';
import { normalize } from '../src/text/normalize';

const say = (t: string) => normalize(t, { start: 0, end: t.length }, 'hi').text;

describe('Hindi numbers', () => {
  it('has a word for every number below a hundred', () => {
    expect(cardinal(0, 'hi')).toBe('शून्य');
    expect(cardinal(5, 'hi')).toBe('पाँच');
    expect(cardinal(19, 'hi')).toBe('उन्नीस');
    expect(cardinal(29, 'hi')).toBe('उनतीस');
    expect(cardinal(45, 'hi')).toBe('पैंतालीस');
    expect(cardinal(67, 'hi')).toBe('सड़सठ');
    expect(cardinal(79, 'hi')).toBe('उन्यासी');
    expect(cardinal(99, 'hi')).toBe('निन्यानवे');
    const words = Array.from({ length: 100 }, (_, n) => cardinal(n, 'hi'));
    expect(new Set(words).size).toBe(100);
  });

  it('groups the Indian way: सौ, हज़ार, लाख, करोड़', () => {
    expect(cardinal(105, 'hi')).toBe('एक सौ पाँच');
    expect(cardinal(2026, 'hi')).toBe('दो हज़ार छब्बीस');
    expect(cardinal(125000, 'hi')).toBe('एक लाख पच्चीस हज़ार');
    expect(cardinal(35_000_000, 'hi')).toBe('तीन करोड़ पचास लाख');
  });

  it('says ordinals and years as people do', () => {
    expect(ordinal(1, 'hi')).toBe('पहला');
    expect(ordinal(2, 'hi')).toBe('दूसरा');
    expect(ordinal(6, 'hi')).toBe('छठा');
    expect(ordinal(7, 'hi')).toBe('सातवाँ');
    expect(year(1984, 'hi')).toBe('उन्नीस सौ चौरासी');
    expect(year(1900, 'hi')).toBe('उन्नीस सौ');
    expect(year(2026, 'hi')).toBe('दो हज़ार छब्बीस');
  });
});

describe('Hindi normalisation', () => {
  it('reads numbers, Indian grouping, Devanagari digits and decimals', () => {
    expect(say('मेरे पास 5 सेब हैं।')).toBe('मेरे पास पाँच सेब हैं।');
    expect(say('उसने 1,25,000 रुपये दिए।')).toBe('उसने एक लाख पच्चीस हज़ार रुपये दिए।');
    expect(say('२०२६ में')).toBe('दो हज़ार छब्बीस में');
    expect(say('सन 1984 में।')).toBe('सन उन्नीस सौ चौरासी में।');
    expect(say('3.14')).toBe('तीन दशमलव एक चार');
  });

  it('reads money, percent and units', () => {
    expect(say('₹ 250.50 का बिल था।')).toBe('दो सौ पचास रुपये और पचास पैसे का बिल था।');
    expect(say('Rs. 1 का सिक्का')).toBe('एक रुपया का सिक्का');
    expect(say('15% छूट')).toBe('पंद्रह प्रतिशत छूट');
    expect(say('5 km दूर')).toBe('पाँच किलोमीटर दूर');
  });

  it('tells the time with सवा, साढ़े, पौने, डेढ़ and ढाई', () => {
    expect(say('3:00')).toBe('तीन बजे');
    expect(say('3:15')).toBe('सवा तीन बजे');
    expect(say('3:30 बजे')).toBe('साढ़े तीन बजे');
    expect(say('1:30')).toBe('डेढ़ बजे');
    expect(say('2:30')).toBe('ढाई बजे');
    expect(say('3:45')).toBe('पौने चार बजे');
    expect(say('12:45')).toBe('पौने एक बजे');
    expect(say('3:20')).toBe('तीन बजकर बीस मिनट');
  });

  it('reads dates, chapters and ordinal suffixes', () => {
    expect(say('2026-10-23 को')).toBe('तेईस अक्टूबर दो हज़ार छब्बीस को');
    expect(say('अध्याय IV')).toBe('अध्याय चार');
    expect(say('वह 21वीं सदी थी')).toBe('वह इक्कीसवीं सदी थी');
  });

  it('spells romanised Hindi (Hinglish) in Devanagari for the Hindi voice, keeping English words', () => {
    expect(say('Kal 2 baje milte hain.')).toBe('कल दो बजे मिलते हैं.');
    expect(say('"Thanks yaar," woh bola.')).toBe('"Thanks यार," वो बोला.');
    expect(say('Abhi nahi, match chal raha hai.')).toBe('अभी नहीं, match चल रहा है.');
    // Names and English words are left alone; so are words English shares ("to", "me", "the").
    expect(say('Priya ne Netflix pe movie dekhi.')).toBe('Priya ने Netflix पे movie देखी.');
    expect(say('I gave it to me.')).toBe('I gave it to me.');
  });
});

describe('Hinglish detection', () => {
  it('recognises romanised Hindi as Hindi, and English as English', () => {
    expect(detectLanguage('Tum kahan ja rahe ho? Main bhi chalungi. Theek hai, jaldi karo.').lang).toBe('hi');
    expect(detectLanguage('Where are you going? To the harbour, said Tom. Wait for me.').lang).toBe('en');
  });

  it('picks the voice per line: Devanagari or Hinglish to Hindi, an English sentence in a Hindi book to English', () => {
    expect(lineLanguage('“हाँ दादी, मैं अभी आती हूँ!” मीरा बोली।', 'en')).toBe('hi');
    expect(lineLanguage('"Bhai, chai banaoge?" Priya ne poocha.', 'en')).toBe('hi');
    expect(lineLanguage('The meeting is at the end of the week.', 'hi')).toBe('en');
    expect(lineLanguage('OK, bye.', 'hi')).toBe('hi');
    expect(lineLanguage('She walked to the door and opened it.', 'en')).toBe('en');
  });
});
