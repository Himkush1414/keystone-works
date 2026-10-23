/**
 * Hinglish: Hindi written in Latin letters ("Tum kahan ja rahe ho?"). The Hindi voice reads Devanagari
 * natively, so common romanised Hindi words are spelled in Devanagari before synthesis; English words and
 * names stay as written (the voice reads mixed script without dropping anything). Words that are also common
 * English words ("to", "the", "me", "hi", "use", "sun", "log", "mat") are left out on purpose.
 */

// prettier-ignore
const WORDS = `
main:मैं mai:मैं mujhe:मुझे mujhko:मुझको mera:मेरा meri:मेरी mere:मेरे hum:हम humein:हमें hamein:हमें hame:हमें
hamara:हमारा hamari:हमारी hamare:हमारे tum:तुम tumhe:तुम्हें tumhein:तुम्हें tumhara:तुम्हारा tumhari:तुम्हारी
tumhare:तुम्हारे tu:तू tujhe:तुझे tera:तेरा teri:तेरी tere:तेरे aap:आप aapka:आपका aapki:आपकी aapke:आपके
aapko:आपको wo:वो woh:वो vo:वो ye:ये yeh:ये usne:उसने usse:उससे usko:उसको uska:उसका uski:उसकी uske:उसके
unka:उनका unki:उनकी unke:उनके unhe:उन्हें unhein:उन्हें unhone:उन्होंने isse:इससे isko:इसको iska:इसका iski:इसकी
iske:इसके koi:कोई kuch:कुछ kuchh:कुछ sab:सब sabko:सबको sabhi:सभी apna:अपना apni:अपनी apne:अपने khud:ख़ुद
kaun:कौन kya:क्या kyun:क्यों kyon:क्यों kyu:क्यों kaise:कैसे kaisa:कैसा kaisi:कैसी kahan:कहाँ kab:कब
kitna:कितना kitni:कितनी kitne:कितने jab:जब tab:तब jahan:जहाँ wahan:वहाँ yahan:यहाँ idhar:इधर udhar:उधर
hai:है hain:हैं hoon:हूँ hun:हूँ ho:हो tha:था thi:थी raha:रहा rahi:रही rahe:रहे gaya:गया gayi:गई gaye:गए
ne:ने kar:कर karo:करो karna:करना karta:करता karti:करती karte:करते kiya:किया ki:की ke:के ka:का ko:को se:से
mein:में par:पर pe:पे tak:तक bhi:भी toh:तो aur:और ya:या lekin:लेकिन magar:मगर phir:फिर fir:फिर ab:अब
abhi:अभी kabhi:कभी nahi:नहीं nahin:नहीं na:ना haan:हाँ ji:जी accha:अच्छा acha:अच्छा achha:अच्छा
theek:ठीक thik:ठीक bahut:बहुत bohot:बहुत bahot:बहुत zyada:ज़्यादा jyada:ज़्यादा kam:कम thoda:थोड़ा
thodi:थोड़ी bas:बस sirf:सिर्फ़ bilkul:बिल्कुल sach:सच sahi:सही galat:ग़लत pata:पता chalo:चलो chal:चल
chalte:चलते jao:जाओ ja:जा jaa:जा jana:जाना jaana:जाना aao:आओ aaja:आजा aana:आना aaya:आया aayi:आई aaye:आए
aa:आ dekho:देखो dekh:देख dekha:देखा dekhi:देखी dekhe:देखे suno:सुनो bolo:बोलो bola:बोला boli:बोली bole:बोले kaha:कहा
kehna:कहना kehte:कहते kehti:कहती poocha:पूछा puchha:पूछा pucha:पूछा lo:लो le:ले lena:लेना liya:लिया
li:ली diya:दिया di:दी de:दे dena:देना dijiye:दीजिए lijiye:लीजिए baitho:बैठो ruko:रुको khao:खाओ socha:सोचा
samjha:समझा samjho:समझो chahiye:चाहिए chahta:चाहता chahti:चाहती sakta:सकता sakti:सकती sakte:सकते
hoga:होगा hogi:होगी honge:होंगे hua:हुआ hui:हुई hue:हुए hota:होता hoti:होती hote:होते rehna:रहना
raho:रहो karenge:करेंगे jayega:जाएगा jaayega:जाएगा milte:मिलते milenge:मिलेंगे mila:मिला mili:मिली
padha:पढ़ा padh:पढ़ padhai:पढ़ाई likha:लिखा hansa:हँसा hansi:हँसी hanste:हँसते laga:लगा lagi:लगी
lagta:लगता lagti:लगती banaoge:बनाओगे bana:बना banana:बनाना leti:लेती deti:देती chalungi:चलूँगी chalunga:चलूँगा
bhai:भाई behen:बहन behan:बहन didi:दीदी maa:माँ papa:पापा mummy:मम्मी dadi:दादी dada:दादा nani:नानी
nana:नाना beta:बेटा beti:बेटी dost:दोस्त yaar:यार ghar:घर kaam:काम din:दिन raat:रात subah:सुबह shaam:शाम
aaj:आज kal:कल parso:परसों waqt:वक़्त samay:समय paani:पानी pani:पानी chai:चाय khana:खाना baat:बात
baatein:बातें dil:दिल pyaar:प्यार pyar:प्यार zindagi:ज़िंदगी duniya:दुनिया jhooth:झूठ darwaza:दरवाज़ा
kitab:किताब bura:बुरा bada:बड़ा badi:बड़ी bade:बड़े chota:छोटा chhota:छोटा choti:छोटी chhoti:छोटी naya:नया
nayi:नई purana:पुराना sundar:सुंदर khush:ख़ुश udaas:उदास pehle:पहले baad:बाद saath:साथ sath:साथ liye:लिए
wala:वाला wali:वाली wale:वाले jaisa:जैसा jaise:जैसे aise:ऐसे waise:वैसे zaroor:ज़रूर jaldi:जल्दी
dheere:धीरे ek:एक teen:तीन paanch:पाँच baje:बजे shukriya:शुक्रिया dhanyavaad:धन्यवाद namaste:नमस्ते
`;

export const HINGLISH: ReadonlyMap<string, string> = new Map(
  WORDS.trim()
    .split(/\s+/)
    .map((pair) => pair.split(':') as [string, string]),
);

/** Common Hinglish words that rarely appear in English, used to recognise romanised Hindi. */
// prettier-ignore
export const HINGLISH_STOPWORDS = 'hai hain ka ki ke ko se mein nahi nahin kya tha thi bhi aur toh yeh woh tum aap hum mera meri mere tera teri kuch bahut lekin kyun kaise kaha bola boli raha rahi rahe gaya gayi hoon ho abhi phir accha theek yaar';

/** Spells the Hinglish words of `text` in Devanagari, keeping case-insensitive matches only. */
export function hinglishWord(word: string): string | undefined {
  return HINGLISH.get(word.toLowerCase());
}

/** Share of the Latin-script words in `text` that are Hinglish, and how many there are. */
export function hinglishShare(text: string): { share: number; count: number } {
  const words = text.match(/\p{Script=Latin}+/gu) ?? [];
  const count = words.filter((w) => HINGLISH.has(w.toLowerCase())).length;
  return { share: words.length ? count / words.length : 0, count };
}
