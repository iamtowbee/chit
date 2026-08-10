export interface MillionQuestion {
  level: number;
  prompt: string;
  options: string[];
  answer: number;
}

export interface MillionHint {
  kind: 'fifty' | 'phone' | 'audience';
  text: string;
}

export interface MillionHistoryEntry {
  round: number;
  prompt: string;
  action: string;
  answer: string;
  tier: number;
  bankAfter: number;
}

export interface MillionLives {
  fifty: boolean;
  phone: boolean;
  audience: boolean;
}

export interface MillionGameData {
  app: 'game';
  kind: 'million';
  seed: number;
  round: number;
  rounds: number;
  bank: number;
  safeFloor: number;
  questions: MillionQuestion[];
  lives: MillionLives;
  hint: MillionHint | null;
  corrects: number;
  wrongs: number;
  walks: number;
  decisions: number;
  history: MillionHistoryEntry[];
  outcome: 'win' | 'lose' | null;
  ending: 'grand' | 'fall' | 'walk' | 'broke' | null;
  name: string | null;
  won: number;
}

export const MILLION_ROUNDS = 15;
export const MILLION_TIERS = [
  100, 200, 300, 500, 1000, 2000, 4000, 8000, 16000, 32000, 64000, 125000, 250000, 500000, 1000000,
] as const;

export const MILLION_FIFTY = 4;
export const MILLION_PHONE = 5;
export const MILLION_AUDIENCE = 6;
export const MILLION_WALK = 7;

type BankQuestion = [prompt: string, a: string, b: string, c: string, d: string, answer: number];

const BANK: BankQuestion[][] = [
  [
    ['How many legs does a spider have?', '6', '8', '10', '12', 1],
    ['What colour do red and yellow mix to make?', 'green', 'purple', 'orange', 'brown', 2],
    ['Which planet is called the Red Planet?', 'Venus', 'Mars', 'Jupiter', 'Saturn', 1],
    ['How many days are in a leap year?', '364', '365', '366', '367', 2],
  ],
  [
    ['Which animal is called the king of the jungle?', 'tiger', 'elephant', 'lion', 'gorilla', 2],
    ['What do honeybees make?', 'sugar', 'honey', 'jam', 'syrup', 1],
    ['Which season comes right after winter?', 'autumn', 'spring', 'summer', 'monsoon', 1],
    ['How many continents are there on Earth?', '5', '6', '7', '8', 2],
  ],
  [
    ['What is the largest ocean on Earth?', 'Atlantic', 'Indian', 'Arctic', 'Pacific', 3],
    ['Which instrument has 88 keys?', 'violin', 'piano', 'guitar', 'flute', 1],
    ['What is the capital of France?', 'London', 'Berlin', 'Paris', 'Rome', 2],
    ['How many minutes are in an hour?', '60', '90', '100', '120', 0],
  ],
  [
    ['What is the fastest land animal?', 'cheetah', 'lion', 'horse', 'greyhound', 0],
    ['How many strings does a standard guitar have?', '4', '5', '6', '7', 2],
    ['Which gas do plants take in from the air?', 'oxygen', 'nitrogen', 'carbon dioxide', 'helium', 2],
    ['At what temperature does water boil, in Celsius?', '50', '75', '100', '150', 2],
  ],
  [
    ['Which is the largest country by area?', 'China', 'the USA', 'Canada', 'Russia', 3],
    ['How many sides does a hexagon have?', '5', '6', '7', '8', 1],
    ['Which element has the chemical symbol O?', 'gold', 'silver', 'oxygen', 'iron', 2],
    ['What is the largest mammal?', 'African elephant', 'blue whale', 'giraffe', 'hippopotamus', 1],
  ],
  [
    ['Which river flows through Egypt?', 'Amazon', 'Nile', 'Ganges', 'Danube', 1],
    ['Who painted the Mona Lisa?', 'Van Gogh', 'Picasso', 'Leonardo da Vinci', 'Monet', 2],
    ['How many bones are in an adult human body?', '106', '206', '306', '406', 1],
    ['What is the hardest natural substance?', 'iron', 'quartz', 'diamond', 'gold', 2],
  ],
  [
    ['Which country is home to the kangaroo?', 'Brazil', 'Australia', 'South Africa', 'India', 1],
    ['What is the largest hot desert on Earth?', 'Gobi', 'Sahara', 'Atacama', 'Kalahari', 1],
    ['Which planet spins the fastest?', 'Jupiter', 'Mars', 'Earth', 'Mercury', 0],
    ['What is the capital of Japan?', 'Beijing', 'Seoul', 'Tokyo', 'Bangkok', 2],
  ],
  [
    ['How many books are in the main Harry Potter series?', '5', '6', '7', '8', 2],
    ['Which gas makes up most of the air we breathe?', 'oxygen', 'nitrogen', 'carbon dioxide', 'argon', 1],
    ['What is the smallest prime number?', '0', '1', '2', '3', 2],
    ['What is the longest bone in the human body?', 'spine', 'femur', 'humerus', 'tibia', 1],
  ],
  [
    ['Who wrote Romeo and Juliet?', 'Charles Dickens', 'William Shakespeare', 'Mark Twain', 'Jane Austen', 1],
    ['What is the capital of Australia?', 'Sydney', 'Melbourne', 'Canberra', 'Perth', 2],
    ['How many teeth does an adult human normally have?', '28', '30', '32', '34', 2],
    ['Which element has atomic number 1?', 'helium', 'hydrogen', 'oxygen', 'carbon', 1],
  ],
  [
    ['What is the currency of Japan?', 'won', 'yuan', 'yen', 'ringgit', 2],
    ['Which organ produces insulin?', 'liver', 'kidney', 'pancreas', 'spleen', 2],
    ['Which country spans the most time zones?', 'Russia', 'the USA', 'France', 'China', 2],
    ['What is the square root of 144?', '11', '12', '13', '14', 1],
  ],
  [
    ['What is the largest island on Earth?', 'New Guinea', 'Borneo', 'Greenland', 'Madagascar', 2],
    ['Who developed the theory of relativity?', 'Isaac Newton', 'Albert Einstein', 'Stephen Hawking', 'Galileo', 1],
    ['Which blood type is the universal donor?', 'A', 'B', 'AB', 'O', 3],
    ['What is the fastest ocean fish?', 'great white shark', 'bluefin tuna', 'sailfish', 'dolphin', 2],
  ],
  [
    ['Which planet has the longest day?', 'Mercury', 'Venus', 'Mars', 'Neptune', 1],
    ['What is the main ingredient in glass?', 'plastic', 'sand', 'salt', 'chalk', 1],
    ['Which language has the most native speakers?', 'English', 'Spanish', 'Mandarin', 'Hindi', 2],
    ['What is the only mammal that truly flies?', 'bat', 'flying squirrel', 'flying lemur', 'sugar glider', 0],
  ],
  [
    ['What is the smallest country in the world?', 'Monaco', 'Vatican City', 'San Marino', 'Liechtenstein', 1],
    ['Which gas do plants give off during photosynthesis?', 'carbon dioxide', 'nitrogen', 'oxygen', 'methane', 2],
    ['About how long is Earth\'s equator?', '10,000 km', '20,000 km', '40,000 km', '60,000 km', 2],
    ['Who composed The Four Seasons?', 'Bach', 'Mozart', 'Vivaldi', 'Beethoven', 2],
  ],
  [
    ['What is the hardest mineral on the Mohs scale?', 'topaz', 'corundum', 'diamond', 'quartz', 2],
    ['Which country invented paper?', 'Egypt', 'Greece', 'China', 'India', 2],
    ['Which element has the chemical symbol Au?', 'silver', 'iron', 'gold', 'copper', 2],
    ['How many ribs does a typical human have?', '12', '18', '24', '30', 2],
  ],
  [
    ['About how fast does light travel?', '300,000 km/s', '150,000 km/s', '30,000 km/s', '3,000,000 km/s', 0],
    ['Which chemical element has the symbol W?', 'titanium', 'tungsten', 'tin', 'tantalum', 1],
    ['Who is called the father of geometry?', 'Pythagoras', 'Euclid', 'Archimedes', 'Eratosthenes', 1],
    ['Which planet is named after a Greek god?', 'Mars', 'Jupiter', 'Uranus', 'Neptune', 2],
  ],
];

export interface MillionCreateOptions {
  seed: number;
}

export function initialMillionGame(options: MillionCreateOptions): MillionGameData {
  const questions = buildDeck(options.seed);
  return {
    app: 'game' as const,
    kind: 'million' as const,
    seed: options.seed,
    round: 0,
    rounds: MILLION_ROUNDS,
    bank: 0,
    safeFloor: safeFloorAt(0),
    questions,
    lives: { fifty: false, phone: false, audience: false },
    hint: null,
    corrects: 0,
    wrongs: 0,
    walks: 0,
    decisions: 0,
    history: [],
    outcome: null,
    ending: null,
    name: null,
    won: 0,
  };
}

export function isMillionGame(value: unknown): value is MillionGameData {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.app === 'game' &&
    record.kind === 'million' &&
    typeof record.round === 'number' &&
    Array.isArray(record.questions)
  );
}

export function isMillionBake(state: MillionGameData): boolean {
  return state.round >= state.rounds && state.outcome === null;
}

export function safeFloorAt(round: number): number {
  if (round >= 10) return MILLION_TIERS[9] as number;
  if (round >= 5) return MILLION_TIERS[4] as number;
  return 0;
}

export function tierAt(round: number): number {
  return MILLION_TIERS[Math.min(Math.max(0, round), MILLION_ROUNDS - 1)] as number;
}

export function millionProgress(state: MillionGameData): number {
  const total = state.rounds + (isMillionBake(state) ? 1 : 0);
  return Math.min(1, (state.round + 1) / Math.max(1, total));
}

export function resolveMillionPlay(
  state: MillionGameData,
  choiceIndex: number,
): MillionGameData {
  const next: MillionGameData = {
    ...state,
    questions: state.questions.map((q) => ({ ...q, options: [...q.options] })),
    lives: { ...state.lives },
    history: [...state.history],
    hint: state.hint ? { ...state.hint } : null,
  };
  if (next.outcome !== null) {
    throw new Error('this game has already ended');
  }
  if (isMillionBake(next)) {
    const names = ['Cakey the Brave', 'Sir Frostbite', 'Cak'];
    const name = names[choiceIndex];
    if (!name) throw new Error('that name is not available');
    next.outcome = 'win';
    next.ending = 'grand';
    next.name = name;
    next.won = MILLION_TIERS[14] as number;
    return next;
  }
  const question = next.questions[next.round];
  if (!question) throw new Error('no question left to answer');

  if (choiceIndex === MILLION_WALK) {
    next.outcome = 'lose';
    next.ending = 'walk';
    next.won = next.bank;
    next.walks += 1;
    next.decisions += 1;
    next.hint = null;
    next.history.push({
      round: next.round + 1,
      prompt: question.prompt,
      action: 'Walked',
      answer: '',
      tier: next.bank,
      bankAfter: next.bank,
    });
    return next;
  }

  if (choiceIndex === MILLION_FIFTY) {
    return useFifty(next, question);
  }
  if (choiceIndex === MILLION_PHONE) {
    return usePhone(next, question);
  }
  if (choiceIndex === MILLION_AUDIENCE) {
    return useAudience(next, question);
  }

  if (choiceIndex < 0 || choiceIndex >= question.options.length) {
    throw new Error('that choice is not available here');
  }
  const chosen = question.options[choiceIndex] as string;
  const correct = choiceIndex === question.answer;
  next.hint = null;
  next.decisions += 1;
  if (correct) {
    const tier = MILLION_TIERS[next.round] as number;
    next.bank = tier;
    next.corrects += 1;
    next.history.push({
      round: next.round + 1,
      prompt: question.prompt,
      action: 'Correct',
      answer: chosen,
      tier,
      bankAfter: next.bank,
    });
    next.round += 1;
    next.safeFloor = safeFloorAt(next.round);
  } else {
    const floor = safeFloorAt(next.round);
    next.bank = floor;
    next.won = floor;
    next.wrongs += 1;
    next.outcome = 'lose';
    next.ending = floor > 0 ? 'fall' : 'broke';
    next.history.push({
      round: next.round + 1,
      prompt: question.prompt,
      action: 'Wrong',
      answer: chosen,
      tier: floor,
      bankAfter: next.bank,
    });
  }
  return next;
}

function useFifty(state: MillionGameData, question: MillionQuestion): MillionGameData {
  if (state.lives.fifty) throw new Error('50/50 has already been used');
  if (question.options.length <= 2) throw new Error('there is nothing left to remove');
  const rng = mulberry32(lifeSeed(state, 0x9e3779b9));
  const keepAnswer = question.answer;
  const wrongs: number[] = [];
  for (let i = 0; i < question.options.length; i += 1) {
    if (i !== keepAnswer) wrongs.push(i);
  }
  const removedA = wrongs[Math.floor(rng() * wrongs.length)] as number;
  const keptWrong = wrongs.find((i) => i !== removedA) as number;
  const kept = [question.options[keepAnswer] as string, question.options[keptWrong] as string];
  const keptIdx = Math.floor(rng() * kept.length);
  const ordered = keptIdx === 0 ? [kept[0] as string, kept[1] as string] : [kept[1] as string, kept[0] as string];
  const removedText = [
    question.options[removedA] as string,
    ...wrongs.filter((i) => i !== removedA && i !== keptWrong).map((i) => question.options[i] as string),
  ];
  question.options = ordered;
  question.answer = ordered.indexOf(kept[keptIdx] as string);
  state.lives.fifty = true;
  state.decisions += 1;
  state.hint = {
    kind: 'fifty',
    text: '50/50 removed ' + removedText.join(' and ') + ' — the answer hides in the two that remain.',
  };
  state.history.push({
    round: state.round + 1,
    prompt: question.prompt,
    action: '50/50',
    answer: '',
    tier: 0,
    bankAfter: state.bank,
  });
  return state;
}

function usePhone(state: MillionGameData, question: MillionQuestion): MillionGameData {
  if (state.lives.phone) throw new Error('your friend is already on the line');
  const rng = mulberry32(lifeSeed(state, 0x85ebca6b));
  const guess = rng() < 0.85 ? question.answer : wrongIndex(question, rng);
  const option = question.options[guess];
  state.lives.phone = true;
  state.decisions += 1;
  state.hint = {
    kind: 'phone',
    text: 'your friend whispers: "I would go with ' + (option as string) + '."',
  };
  state.history.push({
    round: state.round + 1,
    prompt: question.prompt,
    action: 'Phone',
    answer: '',
    tier: 0,
    bankAfter: state.bank,
  });
  return state;
}

function useAudience(state: MillionGameData, question: MillionQuestion): MillionGameData {
  if (state.lives.audience) throw new Error('the audience has already voted');
  const rng = mulberry32(lifeSeed(state, 0xc2b2ae35));
  const correctShare = 38 + Math.floor(rng() * 35);
  const shares: number[] = question.options.map((_opt, index) => (index === question.answer ? correctShare : 0));
  let remaining = 100 - correctShare;
  const wrongIdxs: number[] = [];
  for (let i = 0; i < shares.length; i += 1) {
    if (i !== question.answer) wrongIdxs.push(i);
  }
  for (let i = 0; i < wrongIdxs.length - 1; i += 1) {
    const idx = wrongIdxs[i] as number;
    const share = Math.max(1, Math.floor(rng() * remaining * 0.6));
    shares[idx] = share;
    remaining -= share;
  }
  shares[wrongIdxs[wrongIdxs.length - 1] as number] = Math.max(0, remaining);
  state.lives.audience = true;
  state.decisions += 1;
  const tally = question.options.map((opt, index) => opt + ' ' + shares[index] + '%').join('  ');
  state.hint = {
    kind: 'audience',
    text: 'the audience votes — ' + tally + '.',
  };
  state.history.push({
    round: state.round + 1,
    prompt: question.prompt,
    action: 'Audience',
    answer: '',
    tier: 0,
    bankAfter: state.bank,
  });
  return state;
}

function wrongIndex(question: MillionQuestion, rng: () => number): number {
  const wrongs: number[] = [];
  for (let i = 0; i < question.options.length; i += 1) {
    if (i !== question.answer) wrongs.push(i);
  }
  return wrongs[Math.floor(rng() * wrongs.length)] as number;
}

function lifeSeed(state: MillionGameData, salt: number): number {
  return (state.seed ^ Math.imul(state.round + 1, 2654435761) ^ Math.imul(state.decisions, salt)) >>> 0;
}

function buildDeck(seed: number): MillionQuestion[] {
  const rng = mulberry32(seed >>> 0);
  const questions: MillionQuestion[] = [];
  for (let level = 0; level < MILLION_ROUNDS; level += 1) {
    const pool = BANK[level] ?? [];
    const picked = pool[Math.floor(rng() * pool.length)] as BankQuestion;
    const [prompt, a, b, c, d, answer] = picked;
    const options = [a, b, c, d];
    shuffle(options, rng);
    const answerText = options[answer] as string;
    questions.push({
      level,
      prompt,
      options,
      answer: options.indexOf(answerText),
    });
  }
  return questions;
}

function shuffle<T>(values: T[], rng: () => number): void {
  for (let i = values.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = values[i] as T;
    values[i] = values[j] as T;
    values[j] = tmp;
  }
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
