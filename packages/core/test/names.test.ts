import { describe, expect, it } from 'vitest';
import { analyseCast } from '../src/cast/attribute';
import { givenNameGender } from '../src/cast/names';

// prettier-ignore
const FEMALE = [
  'Mary', 'Elizabeth', 'Jennifer', 'Sarah', 'Emily', 'Anna', 'Maya', 'Olivia', 'Charlotte', 'Grace', 'Lucy', 'Hannah',
  'Priya', 'Neha', 'Anjali', 'Sunita', 'Meera', 'Pooja', 'Kavita', 'Shreya', 'Ananya', 'Ayesha', 'Fatima', 'Lakshmi',
  'प्रिया', 'नेहा', 'मीरा', 'सुनीता', 'अंजलि', 'राधा', 'सीमा', 'पूजा', 'कविता', 'आयशा',
];
// prettier-ignore
const MALE = [
  'James', 'John', 'Michael', 'David', 'Thomas', 'Tom', 'Harry', 'George', 'Daniel', 'Oliver', 'Henry', 'Leo',
  'Ravi', 'Rahul', 'Rohan', 'Arjun', 'Kabir', 'Amit', 'Vikram', 'Suresh', 'Imran', 'Aarav', 'Krishna', 'Deepak',
  'रवि', 'राहुल', 'रोहन', 'अर्जुन', 'कबीर', 'अमित', 'विजय', 'सुरेश', 'इमरान', 'राम',
];
/** Names given to both: only the text can tell. */
const EITHER = ['Alex', 'Sam', 'Jordan', 'Taylor', 'Robin', 'Kiran', 'Suman', 'Jamie', 'किरन'];

describe('givenNameGender', () => {
  it('knows common English, Indian and Devanagari given names', () => {
    for (const n of FEMALE) expect(givenNameGender(n), n).toBe('f');
    for (const n of MALE) expect(givenNameGender(n), n).toBe('m');
  });

  it('leaves names given to both genders, and names it does not know, undecided', () => {
    for (const n of [...EITHER, 'Bennet', 'Holmes', 'Zorblax']) expect(givenNameGender(n), n).toBeUndefined();
  });

  it('reads the given name past titles, possessives and "-ji"', () => {
    expect(givenNameGender('Aunt Polly')).toBe('f');
    expect(givenNameGender('Mr. Tom Smith')).toBe('m');
    expect(givenNameGender('Maya’s')).toBe('f');
    expect(givenNameGender('Neha-ji')).toBe('f');
    expect(givenNameGender('रवि जी')).toBe('m');
  });
});

const genderOf = (blocks: string[], name: string, lang = 'en') =>
  analyseCast(blocks, lang).characters.find((c) => c.name === name)?.gender;

describe('gender from the story', () => {
  it('takes a common name when the text says nothing (Maya and Anna were read as men)', () => {
    const scene = [
      '“You promised me you would be there,” said Maya.',
      '“I said I would try,” Ravi said.',
      '“Are you coming tonight?” Anna asked.',
    ];
    expect(genderOf(scene, 'Maya')).toBe('f');
    expect(genderOf(scene, 'Anna')).toBe('f');
    expect(genderOf(scene, 'Ravi')).toBe('m');
  });

  it('lets the text overrule the name', () => {
    const story = [
      'Ashley pulled his coat tighter. He had walked all night, and his boots were soaked.',
      '“Is anyone there?” Ashley called. He waited for an answer himself.',
    ];
    expect(genderOf(story, 'Ashley')).toBe('m');
  });

  it('reads relations around a name', () => {
    expect(genderOf(['His sister Sam came in from the rain.', '“It’s cold,” Sam said.'], 'Sam')).toBe('f');
    expect(
      genderOf(['Jordan, a young man from the village, stood up.', '“I’ll go,” said Jordan.'], 'Jordan'),
    ).toBe('m');
    expect(genderOf(['Grandmother set down her cup.', '“Sit,” said Grandmother.'], 'Grandmother')).toBe('f');
  });

  it('reads Hindi and Hinglish verb agreement in narration, but not with ने', () => {
    expect(genderOf(['किरन बाज़ार गई।', '“आलू ले आई,” किरन ने कहा।'], 'किरन', 'hi')).toBe('f');
    expect(genderOf(['Kiran school gaya.', '“Main aa gaya,” Kiran ne kaha.'], 'Kiran', 'hi')).toBe('m');
    expect(genderOf(['सुमन ने खाना खाया।', '“बहुत अच्छा था,” सुमन ने कहा।'], 'सुमन', 'hi')).toBeUndefined();
    expect(genderOf(['मेरी बहन सुमन आई।', '“चलो,” सुमन ने कहा।'], 'सुमन', 'hi')).toBe('f');
  });
});
