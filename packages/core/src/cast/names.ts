import type { Gender } from './attribute';

/**
 * Given names whose gender most readers take for granted, in English and in Indian names as Hindi stories
 * spell them (romanised for Hinglish, and Devanagari). Names used for both (Alex, Sam, Jordan, Kiran, Suman)
 * are left out: for those only the text can tell. A match is a prior, not a verdict; Cast weighs it against
 * pronouns, honorifics and verb agreement.
 */
// prettier-ignore
const FEMALE = [
  // English
  'mary patricia jennifer linda elizabeth barbara susan jessica sarah karen lisa nancy betty margaret sandra',
  'ashley kimberly emily donna michelle carol amanda dorothy melissa deborah stephanie rebecca sharon laura',
  'cynthia kathleen amy angela shirley anna annie ann anne brenda pamela emma nicole helen samantha katherine',
  'catherine christine debra rachel carolyn janet maria heather diane ruth julie olivia joyce virginia victoria',
  'kelly lauren christina joan evelyn judith megan andrea cheryl hannah jacqueline martha gloria teresa sara',
  'madison frances kathryn janice jean abigail alice judy sophia sophie grace denise amber doris marilyn',
  'danielle beverly isabella theresa diana natalie brittany charlotte marie kayla lori maya mia ava chloe lily',
  'ella zoe zoey harper aria nora hazel violet stella luna aurora penelope scarlett eleanor clara rose ruby',
  'jane lucy eliza beth meg kitty lydia georgiana caroline louisa harriet fanny marianne elinor julia jenny',
  'molly polly sally holly nina tina gina wendy fiona claire clare kate katie hermione ginny petunia irene',
  'agnes edith ethel mabel florence matilda beatrice cora daisy emily jo amelia isla freya poppy anya tara',
  // Indian, romanised
  'priya pooja puja neha anjali sunita anita kavita savita geeta gita sita seeta radha meera mira riya ria',
  'isha ishita shreya sneha divya deepa deepika aarti arti rekha rani lata asha usha nisha manisha sapna',
  'swati shweta pallavi preeti priti jyoti kajal komal rashmi sangeeta shalini shilpa sonia sonal tanvi tanya',
  'vidya aditi ananya anika anushka avni diya kiara myra saanvi aaradhya pari navya nandini lakshmi parvati',
  'durga saraswati kamla kamala sarita poonam payal mona monika nidhi ruchi richa sakshi simran uma vandana',
  'varsha yamini zoya ayesha aisha fatima sana noor nazia shabana salma heena hina anu anju nikita kritika',
  'radhika shruti sudha chitra mamta seema reena meena leela kusum pushpa savitri gauri ira',
  // Devanagari
  'प्रिया पूजा नेहा अंजलि सुनीता अनीता कविता गीता सीता राधा मीरा माया रिया ईशा श्रेया स्नेहा दिव्या दीपा',
  'आरती रेखा रानी लता आशा उषा निशा सपना स्वाति श्वेता प्रीति ज्योति काजल कोमल रश्मि संगीता शालिनी सोनिया',
  'तान्या विद्या अदिति अनन्या लक्ष्मी पार्वती सरिता पूनम पायल मोनिका निधि साक्षी सिमरन तारा उमा वंदना वर्षा',
  'आयशा फ़ातिमा फातिमा सना नूर अनु निकिता राधिका श्रुति सुधा चित्रा ममता सीमा रीना मीना लीला पुष्पा कमला',
  'सावित्री गौरी',
].join(' ');

// prettier-ignore
const MALE = [
  // English
  'james robert john michael david william richard joseph thomas charles christopher daniel matthew anthony',
  'mark donald steven paul andrew joshua kenneth kevin brian george timothy ronald edward jason jeffrey ryan',
  'jacob gary nicholas eric jonathan stephen larry justin scott brandon benjamin samuel gregory alexander',
  'frank patrick raymond jack dennis jerry tyler aaron jose adam nathan henry douglas zachary peter kyle noah',
  'ethan jeremy walter christian keith roger terry austin sean gerald carl harold dylan arthur lawrence jesse',
  'bryan billy bruce gabriel joe logan alan juan albert willie elijah wayne randy vincent liam mason lucas',
  'oliver leo max hugo oscar harry ron fred percy neville draco sirius remus severus tom tim jim bob bill ben',
  'dan ted ned fitzwilliam edmund edgar hector felix theo arnold ernest herbert leonard stanley victor',
  // Indian, romanised
  'ravi rahul rohan rohit amit ajay vijay sanjay arjun aarav vivaan aditya vihaan krishna kabir raj raju',
  'ramesh suresh mahesh dinesh rajesh mukesh naresh ganesh rakesh umesh anil sunil kapil nikhil akhil vikram',
  'vikas vishal vivek varun karan kunal manish ashish harish girish satish yogesh deepak alok ashok prakash',
  'akash vikash anand arvind gopal govind mohan sohan rajiv sanjeev pankaj neeraj dheeraj suraj manoj saurabh',
  'gaurav abhishek siddharth sameer imran salman shahrukh aamir irfan farhan arif asif zaid ayaan ishaan',
  'reyansh atharv shaurya devansh hari shyam ram laxman bharat shiv mohit sumit lalit ankit ankur tarun arun',
  'karthik raghav pranav yash harsh aryan kartik veer',
  // Devanagari
  'रवि राहुल रोहन रोहित अमित अजय विजय संजय अर्जुन आरव कबीर राज राजू रमेश सुरेश महेश दिनेश राजेश मुकेश गणेश',
  'राकेश अनिल सुनील कपिल निखिल विक्रम विकास विशाल विवेक वरुण करण कुणाल मनीष आशीष हरीश सतीश दीपक अशोक',
  'प्रकाश आकाश आनंद अरविंद गोपाल गोविंद मोहन राजीव संजीव पंकज नीरज सूरज मनोज सौरभ गौरव अभिषेक सिद्धार्थ',
  'समीर इमरान सलमान आमिर इरफ़ान इरफान आदित्य कृष्ण श्याम राम हरि शिव मोहित सुमित अंकित तरुण अरुण राघव',
  'प्रणव यश हर्ष आर्यन कार्तिक वीर',
].join(' ');

const BY_NAME = new Map<string, Gender>([
  ...FEMALE.split(/\s+/).map((n): [string, Gender] => [n, 'f']),
  ...MALE.split(/\s+/).map((n): [string, Gender] => [n, 'm']),
]);

/** Words that come before a given name without being one ("Mr.", "Aunt", "Dr."), and the "-ji" of respect. */
const TITLE = /^(?:\p{L}{1,4}\.|aunt|uncle|auntie|cousin|little|old|young|sister|brother)$/iu;

/** The gender a given name suggests, or undefined when the name isn't listed or is used for both. */
export function givenNameGender(name: string): Gender | undefined {
  const words = name
    .normalize('NFC')
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/['’]s$/u, '').replace(/^(?:ji|जी)$|-(?:ji|जी)$/iu, ''));
  const given = words.find((w) => w && !TITLE.test(w));
  return given ? BY_NAME.get(given.toLowerCase()) : undefined;
}
