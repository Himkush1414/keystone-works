/**
 * Excerpts of real public-domain books with the speaker of every line of dialogue, for measuring Cast on
 * text nobody wrote for it. Each gold line is [a snippet of the spoken words, speaker], in reading order
 * ('' for a line that isn't anyone's: words not said, a group, a document read out, narration in quotes).
 *
 * English from Project Gutenberg: "Alice's Adventures in Wonderland" ch. VII, "Little Women" ch. 1,
 * "The Red-Headed League". Hindi from Hindi Wikisource (CC BY-SA 4.0) transcriptions of Premchand
 * (d. 1936): "ईदगाह" (मानसरोवर १), dialogue written "नाम—…"; "पंच परमेश्वर" (सप्तसरोज, 1917), whose
 * transcription has no quotation marks at all. Labels by hand, from the text.
 */
import books from './cast-books.json';

export interface BookExcerpt {
  id: string;
  lang: string;
  text: string;
  speakers: Record<string, { names: string[]; gender: 'f' | 'm' }>;
  lines: [anchor: string, speaker: string][];
}

const B = books as unknown as Record<string, { text: string; lines: [string, string][] }>;
const book = (id: string, key: string, lang: string, speakers: BookExcerpt['speakers']): BookExcerpt => ({
  id,
  lang,
  speakers,
  text: B[key]?.text ?? '',
  lines: B[key]?.lines ?? [],
});

export const CAST_BOOKS: BookExcerpt[] = [
  book('en-alice-tea-party', 'alice7', 'en', {
    alice: { names: ['Alice'], gender: 'f' },
    hatter: { names: ['Hatter', 'the Hatter'], gender: 'm' },
    hare: { names: ['March Hare', 'the March Hare', 'Hare'], gender: 'm' },
    dormouse: { names: ['Dormouse', 'the Dormouse'], gender: 'm' },
  }),
  book('en-little-women-1', 'littlewomen1', 'en', {
    jo: { names: ['Jo'], gender: 'f' },
    meg: { names: ['Meg'], gender: 'f' },
    amy: { names: ['Amy'], gender: 'f' },
    beth: { names: ['Beth'], gender: 'f' },
  }),
  book('en-red-headed-league', 'redheaded', 'en', {
    holmes: { names: ['Holmes', 'Sherlock Holmes', 'Mr. Holmes', 'Mr. Sherlock Holmes'], gender: 'm' },
    watson: { names: ['I (narrator)', 'Watson', 'Doctor'], gender: 'm' },
    wilson: { names: ['Wilson', 'Jabez Wilson', 'Mr. Wilson', 'Mr. Jabez Wilson'], gender: 'm' },
  }),
  book('hi-idgah', 'idgah', 'hi', {
    hamid: { names: ['हामिद'], gender: 'm' },
    mohsin: { names: ['मोहसिन', 'मोहदिन', 'मोहसिंन'], gender: 'm' },
    mahmood: { names: ['महमूद', 'मद्दमूद'], gender: 'm' },
    noore: { names: ['नूरे'], gender: 'm' },
    sammi: { names: ['सम्मी'], gender: 'm' },
    amina: { names: ['अमीना', 'दादी', 'अम्माँ'], gender: 'f' },
    shopkeeper: { names: ['दूकानदार', 'दुकानदार'], gender: 'm' },
  }),
  book('hi-panch-parmeshwar', 'panch', 'hi', {
    jumman: { names: ['जुम्मन', 'जुम्मन शेख', 'शेख जुम्मन', 'जुम्मनने'], gender: 'm' },
    khala: { names: ['खाला', 'खालाजान', 'बूढ़ी खाला', 'खालाने'], gender: 'f' },
    algu: { names: ['अलगू', 'अलगू चौधरी', 'अलगूने'], gender: 'm' },
    ramdhan: { names: ['रामधन मिश्र', 'रामधन'], gender: 'm' },
    chaudharain: { names: ['चौधराइन'], gender: 'f' },
  }),
];
