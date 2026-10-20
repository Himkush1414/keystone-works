import { describe, expect, it } from 'vitest';
import { detectLanguage } from '../src/text/language';

// Short paragraphs written for these tests (not quoted from any work).
const samples: [string, string][] = [
  [
    'en',
    'The lamp was still burning when she reached the last page, and for a moment she simply listened to the rain against the window.',
  ],
  [
    'de',
    'Die Lampe brannte noch, als sie die letzte Seite erreichte, und für einen Moment hörte sie einfach dem Regen am Fenster zu.',
  ],
  [
    'es',
    'La lámpara seguía encendida cuando llegó a la última página, y por un momento solo escuchó la lluvia contra la ventana.',
  ],
  [
    'fr',
    'La lampe brûlait encore quand elle arriva à la dernière page, et pendant un moment elle écouta simplement la pluie contre la fenêtre.',
  ],
  [
    'it',
    'La lampada era ancora accesa quando arrivò all’ultima pagina, e per un momento ascoltò soltanto la pioggia contro la finestra.',
  ],
  [
    'pt',
    'A lâmpada ainda estava acesa quando ela chegou à última página, e por um momento apenas ouviu a chuva contra a janela.',
  ],
  [
    'nl',
    'De lamp brandde nog toen ze de laatste bladzijde bereikte, en een moment luisterde ze alleen naar de regen tegen het raam.',
  ],
  [
    'sv',
    'Lampan brann fortfarande när hon kom till den sista sidan, och för en stund lyssnade hon bara på regnet mot fönstret.',
  ],
  [
    'da',
    'Lampen brændte stadig, da hun nåede den sidste side, og et øjeblik lyttede hun bare til regnen mod vinduet.',
  ],
  [
    'pl',
    'Lampa wciąż się paliła, kiedy dotarła do ostatniej strony, i przez chwilę po prostu słuchała deszczu za oknem.',
  ],
  [
    'cs',
    'Lampa ještě svítila, když došla na poslední stránku, a chvíli jen poslouchala déšť, který bubnoval na okno.',
  ],
  [
    'hu',
    'A lámpa még égett, amikor elérte az utolsó oldalt, és egy pillanatig csak hallgatta az esőt az ablakon.',
  ],
  ['tr', 'Son sayfaya geldiğinde lamba hâlâ yanıyordu ve bir süre sadece pencereye vuran yağmuru dinledi.'],
  [
    'ro',
    'Lampa încă ardea când a ajuns la ultima pagină, iar pentru o clipă a ascultat doar ploaia care bătea în fereastră.',
  ],
  [
    'fi',
    'Lamppu paloi vielä, kun hän pääsi viimeiselle sivulle, ja hetken hän vain kuunteli sadetta ikkunaa vasten.',
  ],
  [
    'vi',
    'Ngọn đèn vẫn còn cháy khi cô đọc đến trang cuối, và trong một lúc cô chỉ lắng nghe tiếng mưa trên cửa sổ.',
  ],
  [
    'id',
    'Lampu itu masih menyala ketika dia sampai di halaman terakhir, dan untuk sesaat dia hanya mendengarkan hujan di jendela.',
  ],
  [
    'ru',
    'Лампа ещё горела, когда она дошла до последней страницы, и на мгновение она просто слушала дождь за окном.',
  ],
  [
    'uk',
    'Лампа ще горіла, коли вона дійшла до останньої сторінки, і на мить вона просто слухала дощ за вікном.',
  ],
  [
    'bg',
    'Лампата още гореше, когато тя стигна до последната страница, и за миг тя просто слушаше дъжда по прозореца.',
  ],
  [
    'el',
    'Η λάμπα έκαιγε ακόμα όταν έφτασε στην τελευταία σελίδα, και για μια στιγμή απλώς άκουγε τη βροχή στο παράθυρο.',
  ],
  ['ar', 'كان المصباح لا يزال مضاءً عندما وصلت إلى الصفحة الأخيرة، وللحظة استمعت فقط إلى المطر على النافذة.'],
  [
    'hi',
    'जब वह आखिरी पन्ने पर पहुँची तब भी दीपक जल रहा था, और एक पल के लिए उसने बस खिड़की पर बारिश को सुना।',
  ],
  [
    'ko',
    '마지막 페이지에 이르렀을 때도 등불은 여전히 타고 있었고, 그녀는 잠시 창문에 부딪히는 빗소리를 들었다.',
  ],
  [
    'ja',
    '最後のページにたどり着いたとき、ランプはまだ灯っていて、彼女はしばらく窓を打つ雨の音を聞いていた。',
  ],
];

describe('detectLanguage', () => {
  it.each(samples)('detects %s', (lang, text) => {
    const d = detectLanguage(text);
    expect(d.lang).toBe(lang);
  });

  it('is confident on clear prose', () => {
    expect(detectLanguage(samples[0]?.[1] ?? '').confidence).toBeGreaterThan(0.5);
  });

  it('reports unsupported scripts without guessing', () => {
    expect(detectLanguage('灯还亮着，她读到了最后一页。窗外的雨声很轻。')).toEqual({
      lang: undefined,
      confidence: 0.9,
    });
    expect(detectLanguage('โคมไฟยังคงสว่างอยู่')).toEqual({ lang: undefined, confidence: 0.9 });
  });

  it('handles empty and symbol-only input', () => {
    expect(detectLanguage('')).toEqual({ lang: undefined, confidence: 0 });
    expect(detectLanguage('12 345 — !!!')).toEqual({ lang: undefined, confidence: 0 });
  });
});
