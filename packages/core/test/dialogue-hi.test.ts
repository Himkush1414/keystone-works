import { describe, expect, it } from 'vitest';
import { analyseCast } from '../src/cast/attribute';
import { findDialogue } from '../src/cast/dialogue';

const spoken = (text: string) => findDialogue(text, 'hi').map((s) => text.slice(s.start, s.end).trim());

describe('Hindi dialogue without quotation marks', () => {
  it('finds speech after a name and a dash, a speech verb and a dash, or a speech verb and a comma', () => {
    expect(spoken('मोहसिन—हाँ, उछल-कूद नहीं सकती।')).toEqual(['हाँ, उछल-कूद नहीं सकती।']);
    expect(spoken('महमूद ---और मेरा सिपाही घर का पहरा देगा।')).toEqual(['और मेरा सिपाही घर का पहरा देगा।']);
    expect(spoken('हामिद ने फिर पूछा—जिन्नात बहुत बड़े-बड़े होते होगे?')).toEqual([
      'जिन्नात बहुत बड़े-बड़े होते होगे?',
    ]);
    expect(spoken('खालाने नम्रतासे कहा, मुझे कुछ रूपा-सूखा चाहिये भी कि नहीं?')).toEqual([
      'मुझे कुछ रूपा-सूखा चाहिये भी कि नहीं?',
    ]);
    expect(spoken('हामिद को यकीन न आया—ऐसे रुपये जिन्नात को कहाँ से मिल जायँगे?')).toEqual([
      'ऐसे रुपये जिन्नात को कहाँ से मिल जायँगे?',
    ]);
  });

  it('splits two speakers in one paragraph where the second is introduced', () => {
    const p =
      'मोहसिन ने हँसकर कहा---यह चिमटा क्यों लाया पगले। हामिद ने चिमटे को पटककर कहा--ज़रा अपना भिश्ती गिरा दो।';
    expect(spoken(p)).toEqual(['यह चिमटा क्यों लाया पगले।', 'ज़रा अपना भिश्ती गिरा दो।']);
  });

  it('leaves hyphens and a single en dash in narration alone', () => {
    expect(spoken('महमूद गिनता है, एक-दो, दस-बारह उसके पास बारह पैसे हैं।')).toEqual([]);
    expect(spoken('तरह-तरह के खिलौने हैं–सिपाही और गुजरिया, राजा और वकील।')).toEqual([]);
  });

  it('gives each line to the speaker named before it, not the one introduced after it', () => {
    const paragraphs = [
      'महमूद ने कहा—हमारी अम्मीजान के तो हाथ कांपने लगे।',
      'मोहसिन बोला— चलो, मनों आटा पीस डालती हैं।',
      'मोहसिन ने हँसकर कहा---यह चिमटा क्यों लाया पगले। हामिद ने चिमटे को पटककर कहा--ज़रा अपना भिश्ती गिरा दो।',
      'खालाने नम्रतासे कहा, मुझे कुछ चाहिये।',
    ];
    const { characters, attributions } = analyseCast(paragraphs, 'hi');
    const name = (id?: string) => characters.find((c) => c.id === id)?.name;
    expect(attributions.map((a) => name(a.speaker))).toEqual(['महमूद', 'मोहसिन', 'मोहसिन', 'हामिद', 'खाला']);
  });

  it('takes the speaker past adverbs and participles, and the agent of कहा', () => {
    const { characters, attributions } = analyseCast(
      [
        'सम्मी मेले में था।',
        'अन्तमें एक दिन खालाने जुम्मनसे कहा, बेटा! तुम्हारे साथ मेरा निर्वाह न होगा।',
        'सम्मी ने खेजरी ली थी। प्रभावित होकर बोला---मेरी खेजरी से बदलोगे?',
      ],
      'hi',
    );
    const name = (id?: string) => characters.find((c) => c.id === id)?.name;
    expect(attributions.map((a) => name(a.speaker))).toEqual(['खाला', 'सम्मी']);
  });
});

describe('Hindi pronouns that introduce speech', () => {
  it('refer to the person just named in the paragraph', () => {
    const { characters, attributions } = analyseCast(
      [
        'खालाने कहा, बेटा! यह क्या हुआ?',
        'चौधराइन ने भी जुम्मन पर ही दोषारोपण किया। उसने कहा, जुम्मन ने कुछ कर दिया है।',
      ],
      'hi',
    );
    const name = (id?: string) => characters.find((c) => c.id === id)?.name;
    expect(attributions.map((a) => name(a.speaker))).toEqual(['खाला', 'चौधराइन']);
  });
});

describe('quotations left open', () => {
  it('runs a paragraph that opens a quotation and never closes it to its end', () => {
    const en = '“It was a long time ago, and nobody remembers it now. But I do.';
    expect(findDialogue(en, 'en').map((s) => en.slice(s.start, s.end))).toEqual([en]);
    const hi = '‘कहाँ पचास, कहाँ एक सौ। पचास एक थैली-भर होता है।';
    expect(findDialogue(hi, 'hi').map((s) => hi.slice(s.start, s.end))).toEqual([hi]);
  });

  it('leaves an apostrophe-led word in narration alone', () => {
    const t = "'Twas the night before the fair, and all was quiet.";
    expect(findDialogue(t, 'en')).toEqual([]);
  });
});
