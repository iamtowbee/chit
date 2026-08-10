export interface GameContext {
  inventory: string[];
  flags: Record<string, string | boolean>;
}

export interface GameChoice {
  label: string;
  to: string;
  requires?: (ctx: GameContext) => boolean;
  effect?: (ctx: GameContext) => void;
}

export interface GameNode {
  id: string;
  title: string;
  text: string;
  choices?: GameChoice[];
  ending?: 'win' | 'lose';
  onEnter?: (ctx: GameContext) => void;
}

export const GAME_NAME = "It's Cak";
export const GAME_TAGLINE = "A tiny cake's quest to choose its own name.";
export const START_NODE = 'start';
export const WIN_END = 'win_end';
export const LOSE_ENDS = new Set(['frost_greedy', 'kiln_judge', 'kiln_bluff', 'crumbs_end']);

export const ITEM_NAMES: Record<string, string> = {
  crumb_blessing: 'Crumb blessing',
  sugar_dust: 'Sugar Dust',
  whispering_berry: 'Whispering Berry',
  yeast_spark: 'Spark of Yeast-Fire',
};

export const has = (ctx: GameContext, item: string): boolean =>
  ctx.inventory.includes(item);

export const flag = (ctx: GameContext, key: string): boolean =>
  Boolean(ctx.flags[key]);

export const STORY: readonly GameNode[] = [
  {
    id: 'start',
    title: 'The Ovenlight',
    text:
      'You are Cak - a small frosted cake with legs and an unshakeable sense of purpose. ' +
      'The Ovenlight flickers low. Tonight is the Grand Bake, and legend says a cake that ' +
      'gathers the three Ingredients may name itself. The three Ingredients are Sugar Dust, ' +
      'a Whispering Berry, and a Spark of Yeast-Fire.',
    choices: [
      { label: 'Ask the Elder Crumbs for a blessing', to: 'elders' },
      { label: 'March straight to the Frost Fields', to: 'frost_gate' },
    ],
  },
  {
    id: 'elders',
    title: 'The Elder Crumbs',
    text:
      'A ring of ancient crumbs crackles on the cooling rack. One speaks in a whisper of ' +
      'flour-dust: "The Frost Fields are guarded by the Sugar Wraith, who prizes warm ' +
      'answers. The Jam Woods sing, and that song is half a lie. And the Kiln Caves - oh, ' +
      'the fire there has opinions about thieves." A crumb drops into your frosting. It ' +
      'feels lucky.',
    onEnter: (ctx) => {
      if (!has(ctx, 'crumb_blessing')) ctx.inventory.push('crumb_blessing');
    },
    choices: [{ label: 'Thank them and head for the Frost Fields', to: 'frost_gate' }],
  },
  {
    id: 'frost_gate',
    title: 'The Frost Fields',
    text:
      'Hoarfrost glitters as far as a cake can see. At the gate stands the Sugar Wraith - ' +
      'tall, shimmering, and terribly polite. "None may take the Dust," it chimes, "unless ' +
      'they answer: what is sweeter than sugar?"',
    choices: [
      { label: 'Say: "A warm friend."', to: 'frost_accept' },
      { label: 'Say: "More sugar, obviously."', to: 'frost_greedy' },
      { label: 'Sneak past while it blinks', to: 'frost_sneak' },
    ],
  },
  {
    id: 'frost_greedy',
    title: 'The Wrong Answer',
    text:
      'The Wraith\'s smile freezes. "Wrong," it whispers. "The only thing sweeter than ' +
      'sugar is knowing you were right." It dusts you in dream-sugar, and you wander the ' +
      'sparkling fields, content and lost, forever. Cak is happy. Cak is gone.',
    ending: 'lose',
  },
  {
    id: 'frost_accept',
    title: 'A Warm Answer',
    text:
      'The Wraith tilts its head. "A warm friend," it repeats, almost to itself. "That is ' +
      'the sweetest answer in all the Ovenlands." It bows and hands you a pouch of Sugar ' +
      'Dust, glittering like trapped moonlight.',
    onEnter: (ctx) => {
      if (!has(ctx, 'sugar_dust')) ctx.inventory.push('sugar_dust');
    },
    choices: [{ label: 'Cross into the Jam Woods', to: 'jam_gate' }],
  },
  {
    id: 'frost_sneak',
    title: 'Sneaky Steps',
    text:
      'You tiptoe through the frost and filch the Dust. The Wraith does not see you - but ' +
      'the frost remembers. A cold thread winds around your crumb, marking you. You feel a ' +
      'little cursed, and a lot naughty.',
    onEnter: (ctx) => {
      if (!has(ctx, 'sugar_dust')) ctx.inventory.push('sugar_dust');
      ctx.flags.cursed = true;
    },
    choices: [{ label: 'Cross into the Jam Woods', to: 'jam_gate' }],
  },
  {
    id: 'jam_gate',
    title: 'The Jam Woods',
    text:
      'The Jam Woods hum with a berry-sweet song. On a throne of tarts sits the Whispering ' +
      'Berry, and beside it a fox with a knowing grin. The Berry\'s song says: "Take me, ' +
      'and you shall be famous." The Fox\'s grin says: "Famous is heavy."',
    choices: [
      {
        label: 'Offer the Whispering Berry your Crumb blessing',
        to: 'berry_gift',
        requires: (ctx) => has(ctx, 'crumb_blessing'),
      },
      { label: 'Ask the Fox for a trade', to: 'berry_fox' },
      { label: 'Snatch the Berry and run', to: 'berry_steal' },
    ],
  },
  {
    id: 'berry_gift',
    title: 'A Fair Trade',
    text:
      'You offer the crumb. The Berry stops singing, and for a moment the woods hold their ' +
      'breath. "A blessing for a berry," it hums, pleased. It rolls into your frosting like ' +
      'a friend. The Fox claps politely.',
    onEnter: (ctx) => {
      if (!has(ctx, 'whispering_berry')) ctx.inventory.push('whispering_berry');
    },
    choices: [{ label: 'Climb to the Kiln Caves', to: 'kiln_gate' }],
  },
  {
    id: 'berry_fox',
    title: "The Fox's Deal",
    text:
      'The Fox holds up a paw. "One berry for one dance." It winks. "I collect joy, not ' +
      'coin." So you dance - and Cak can really dance, little butter legs and all. The ' +
      'Berry giggles itself off the throne and into your arms.',
    onEnter: (ctx) => {
      if (!has(ctx, 'whispering_berry')) ctx.inventory.push('whispering_berry');
    },
    choices: [{ label: 'Climb to the Kiln Caves', to: 'kiln_gate' }],
  },
  {
    id: 'berry_steal',
    title: "The Berry's Revenge",
    text:
      'You snatch the Berry and bolt. The song does not stop - it follows you, a wailing ' +
      'chorus behind every tree. The Fox shakes its head. The Berry is yours, but so is ' +
      'the haunting.',
    onEnter: (ctx) => {
      if (!has(ctx, 'whispering_berry')) ctx.inventory.push('whispering_berry');
      ctx.flags.haunted = true;
    },
    choices: [{ label: 'Climb to the Kiln Caves', to: 'kiln_gate' }],
  },
  {
    id: 'kiln_gate',
    title: 'The Kiln Caves',
    text:
      'Heat rolls from the caves, warm as a held hand. At the heart, the Yeast-Fire ' +
      'crackles: a bonfire with a face like kneaded dough. "Cak," it rumbles. "Show me ' +
      'what you carry - and what you are."',
    choices: [
      {
        label: 'Hold up the Crumb blessing',
        to: 'kiln_blessed',
        requires: (ctx) => has(ctx, 'crumb_blessing'),
      },
      {
        label: 'Confess the frost-thievery',
        to: 'kiln_mercy',
        requires: (ctx) => flag(ctx, 'cursed'),
      },
      {
        label: 'Bluff your way through',
        to: 'kiln_bluff',
        requires: (ctx) => flag(ctx, 'cursed'),
      },
      {
        label: 'Face the fire',
        to: 'kiln_judge',
        requires: (ctx) => flag(ctx, 'haunted'),
      },
      {
        label: 'Step forward and take the Spark',
        to: 'kiln_spark',
        requires: (ctx) => !flag(ctx, 'cursed') && !flag(ctx, 'haunted'),
      },
    ],
  },
  {
    id: 'kiln_judge',
    title: 'The Song Never Forgives',
    text:
      'The Fire looks through you and sees the stolen song wrapped around your frosting. ' +
      '"The Berry chose its own ending," it says softly. "You took the ending. Sit by my ' +
      'warmth, Cak, and think on it - you may leave when the song forgives you." The song ' +
      'never forgives you. It is still singing.',
    ending: 'lose',
  },
  {
    id: 'kiln_bluff',
    title: 'The Cold Spark',
    text:
      'You square your frosting and bluff about the frost. The Fire does not blink. "The ' +
      'frost marks its own," it says. "I do not light thieves." The spark stays dark. ' +
      'Without it, the Grand Bake cannot begin - and Cak learns, coldly, that sugar cannot ' +
      'light a fire by pretending.',
    ending: 'lose',
  },
  {
    id: 'kiln_mercy',
    title: 'The Confession',
    text:
      'You bow your little cake body and confess the frost-thievery. The Fire cracks ' +
      'something that might be a laugh. "A cake that confesses is rare," it rumbles. ' +
      '"Rarer still is a cake that changes." It sets a Spark of Yeast-Fire into your ' +
      'frosting - warm, alive, and yours.',
    onEnter: (ctx) => {
      if (!has(ctx, 'yeast_spark')) ctx.inventory.push('yeast_spark');
      ctx.flags.cursed = false;
    },
    choices: [{ label: 'Begin the Grand Bake', to: 'grand_bake' }],
  },
  {
    id: 'kiln_blessed',
    title: 'The Blessed Spark',
    text:
      'You hold up the Crumb blessing. The Fire goes quiet, then warm as a sunrise. "A ' +
      'crumb of the elders, carried all this way," it says, honored. "Take your Spark, ' +
      'Cak. The Ovenlands smile on you." The spark settles into your frosting like a ' +
      'heartbeat.',
    onEnter: (ctx) => {
      if (!has(ctx, 'yeast_spark')) ctx.inventory.push('yeast_spark');
    },
    choices: [{ label: 'Begin the Grand Bake', to: 'grand_bake' }],
  },
  {
    id: 'kiln_spark',
    title: 'The Gift of Fire',
    text:
      'You step forward, frosting held high. The Fire hums, pleased with your nerve. "No ' +
      'tricks, no debts," it rumbles. "I like this cake." It places a Spark of Yeast-Fire ' +
      'in your hands - a living ember, warm as a friend.',
    onEnter: (ctx) => {
      if (!has(ctx, 'yeast_spark')) ctx.inventory.push('yeast_spark');
    },
    choices: [{ label: 'Begin the Grand Bake', to: 'grand_bake' }],
  },
  {
    id: 'grand_bake',
    title: 'The Grand Bake',
    text:
      'You lay the Sugar Dust, the Whispering Berry, and the Spark before the Great Oven. ' +
      'The Ovenlight rises. You have gathered the three Ingredients, Cak. It is time to ' +
      'choose a name.',
    choices: [
      {
        label: 'Face the empty oven',
        to: 'crumbs_end',
        requires: (ctx) =>
          !has(ctx, 'sugar_dust') || !has(ctx, 'whispering_berry') || !has(ctx, 'yeast_spark'),
      },
      {
        label: 'Name yourself Cakey the Brave',
        to: WIN_END,
        effect: (ctx) => {
          ctx.flags.name = 'Cakey the Brave';
        },
      },
      {
        label: 'Name yourself Sir Frostbite',
        to: WIN_END,
        effect: (ctx) => {
          ctx.flags.name = 'Sir Frostbite';
        },
      },
      {
        label: 'Name yourself simply... Cak',
        to: WIN_END,
        effect: (ctx) => {
          ctx.flags.name = 'Cak';
        },
      },
    ],
  },
  {
    id: 'crumbs_end',
    title: 'A Hole in the Story',
    text:
      'The Ovenlight dims. You search your frosting and find one of the three Ingredients ' +
      'is missing. The Elder Crumbs shake their heads. "A cake cannot bake with a hole in ' +
      'its story." The Grand Bake ends before it begins - but the Crumbs promise: stories ' +
      'can start over.',
    ending: 'lose',
  },
  {
    id: WIN_END,
    title: 'Legend',
    text:
      'The Ovenlight blazes and the Great Oven opens its door to you. "Rise, {{NAME}}," it ' +
      'booms. "The Ovenlands have their champion." You are a legend now, and you chose ' +
      'yourself - one warm answer at a time.',
    ending: 'win',
  },
];

export const NODES: Record<string, GameNode> = Object.fromEntries(
  STORY.map((node) => [node.id, node]),
);

export const TOTAL_NODES = STORY.length;

export function nodeTitle(id: string): string {
  return NODES[id]?.title ?? 'The Ovenlands';
}
