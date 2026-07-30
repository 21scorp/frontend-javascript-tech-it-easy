/* ═══════════════════════════════════════════════════════════════
   WISP — config.js
   All balance data & content tables live here so tuning the game
   never means touching logic.
   ═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  /* ─────────────── Buildings ───────────────
     Things you grow around your wisp. Every one of them is drawn
     into the world, so buying feels like *building a place*.       */
  const BUILDINGS = [
    {
      id: "firefly", name: "Firefly", glyph: "✨",
      desc: "A tiny friend that wanders the meadow, gathering stray light.",
      baseCost: 15, rate: 0.1, growth: 1.15,
    },
    {
      id: "glowshroom", name: "Glowshroom", glyph: "🍄",
      desc: "Soft mushrooms that hum quietly in the dark.",
      baseCost: 100, rate: 1, growth: 1.15,
    },
    {
      id: "lantern", name: "Paper Lantern", glyph: "🏮",
      desc: "Strung between the hills. Someone must have hung them for you.",
      baseCost: 750, rate: 6, growth: 1.15,
    },
    {
      id: "moonflower", name: "Moonflower", glyph: "🌸",
      desc: "Blooms only at night — which, here, is always.",
      baseCost: 4600, rate: 32, growth: 1.15,
    },
    {
      id: "beacon", name: "Little Beacon", glyph: "🗼",
      desc: "A gentle tower that calls light home from far away.",
      baseCost: 30000, rate: 170, growth: 1.15,
    },
    {
      id: "owl", name: "Ember Owl", glyph: "🦉",
      desc: "Watches over the meadow. Blinks slowly. Approves of you.",
      baseCost: 185000, rate: 850, growth: 1.15,
    },
    {
      id: "aurora", name: "Aurora Loom", glyph: "🌈",
      desc: "Weaves ribbons of colour across your sky.",
      baseCost: 1.2e6, rate: 4400, growth: 1.15,
    },
    {
      id: "fallenstar", name: "Fallen Star", glyph: "⭐",
      desc: "It landed softly on the far hill. It seems happy here.",
      baseCost: 8.5e6, rate: 23000, growth: 1.15,
    },
    {
      id: "moonwell", name: "Moon Well", glyph: "🌙",
      desc: "A still pool that remembers every moon it has ever seen.",
      baseCost: 6.2e7, rate: 125000, growth: 1.15,
    },
    {
      id: "comet", name: "Comet Choir", glyph: "☄️",
      desc: "They pass overhead each night, singing light down to you.",
      baseCost: 4.5e8, rate: 700000, growth: 1.15,
    },
    {
      id: "anvil", name: "Star Anvil", glyph: "⚒️",
      desc: "Where fallen light is hammered back into mornings.",
      baseCost: 3.5e9, rate: 3.9e6, growth: 1.15,
    },
    {
      id: "shepherd", name: "Cloud Shepherd", glyph: "🌥️",
      desc: "Herds the softest clouds. Sometimes they rain starlight.",
      baseCost: 3e10, rate: 2.2e7, growth: 1.15,
    },
    {
      id: "moongarden", name: "Moon Garden", glyph: "🌷",
      desc: "A garden on the moon itself. If you wave, it waves back.",
      baseCost: 2.8e11, rate: 1.25e8, growth: 1.15,
    },
    {
      id: "sunseed", name: "Sun Seed", glyph: "🌻",
      desc: "One day it will sprout. Not yet. But one day.",
      baseCost: 2.6e12, rate: 7e8, growth: 1.15,
    },
  ];

  /* ─────────────── Upgrades (one-time boosts) ───────────────
     type: "tap"     -> multiplies tap value
           "global"  -> multiplies all production
           "building"-> multiplies one building (target)
           "tapRate" -> tap also gains +pct of light/sec              */
  const UPGRADES = [
    { id: "warmhands",  name: "Warm Hands",      glyph: "🤲", cost: 100,    type: "tap",     mult: 2,    desc: "Your touch is twice as kind. Tap ×2." },
    { id: "fireflyjar", name: "Open Jar",        glyph: "🫙", cost: 1000,   type: "building", target: "firefly", mult: 2, desc: "Fireflies come and go as they please. Fireflies ×2.", needs: ["firefly", 5] },
    { id: "cupping",    name: "Gentle Cupping",  glyph: "👐", cost: 2600,   type: "tap",     mult: 2,    desc: "You've learned how it likes to be held. Tap ×2." },
    { id: "sporesong",  name: "Spore Song",      glyph: "🎶", cost: 8000,   type: "building", target: "glowshroom", mult: 2, desc: "The mushrooms hum in harmony. Glowshrooms ×2.", needs: ["glowshroom", 5] },
    { id: "lullaby",    name: "Lullaby",         glyph: "🌜", cost: 12000,  type: "global",  mult: 1.25, desc: "You hum to the meadow. Everything ×1.25." },
    { id: "silkwick",   name: "Silk Wicks",      glyph: "🕯️", cost: 40000,  type: "building", target: "lantern", mult: 2, desc: "The lanterns burn softer, longer. Lanterns ×2.", needs: ["lantern", 5] },
    { id: "gloves",     name: "Sunpetal Gloves", glyph: "🧤", cost: 90000,  type: "tap",     mult: 3,    desc: "Woven from petals that once saw daylight. Tap ×3." },
    { id: "dew",        name: "Moonlit Dew",     glyph: "💧", cost: 220000, type: "building", target: "moonflower", mult: 2, desc: "The flowers drink starlight. Moonflowers ×2.", needs: ["moonflower", 5] },
    { id: "chorus",     name: "Night Chorus",    glyph: "🌌", cost: 400000, type: "global",  mult: 1.25, desc: "The whole meadow sings along. Everything ×1.25." },
    { id: "kindred",    name: "Kindred Rhythm",  glyph: "💞", cost: 1.5e6,  type: "tapRate", pct: 0.02,  desc: "Your heartbeats sync. Taps gain +2% of your light/sec." },
    { id: "owlwisdom",  name: "Owl's Counsel",   glyph: "📜", cost: 4e6,    type: "building", target: "owl", mult: 2, desc: "It finally tells you what it knows. Ember Owls ×2.", needs: ["owl", 5] },
    { id: "blessing",   name: "Moon Blessing",   glyph: "🌕", cost: 2e7,    type: "global",  mult: 1.5,  desc: "The moon has noticed your little light. Everything ×1.5." },
    { id: "auroradye",  name: "Aurora Dye",      glyph: "🎨", cost: 6e7,    type: "building", target: "aurora", mult: 2, desc: "New colours nobody has names for. Aurora Looms ×2.", needs: ["aurora", 5] },
    { id: "heartbeat",  name: "Shared Heartbeat", glyph: "💗", cost: 2.5e8, type: "tapRate", pct: 0.05,  desc: "You can't tell whose pulse is whose. Taps gain +5% of light/sec." },
    { id: "starsong",   name: "Star Song",       glyph: "🎵", cost: 1e9,   type: "global",  mult: 1.5,  desc: "Even the sky hums along now. Everything ×1.5." },
    { id: "cometdust",  name: "Comet Dust",      glyph: "💫", cost: 9e9,   type: "building", target: "comet", mult: 2, desc: "They shed a little extra, just for you. Comet Choirs ×2.", needs: ["comet", 5] },
    { id: "startempo",  name: "Star Tempo",      glyph: "🥁", cost: 4e10,  type: "building", target: "anvil", mult: 2, desc: "The hammering finds a rhythm. Star Anvils ×2.", needs: ["anvil", 5] },
    { id: "woolwind",   name: "Wool of Wind",    glyph: "🧶", cost: 2.2e11, type: "building", target: "shepherd", mult: 2, desc: "Softer flocks, brighter rain. Cloud Shepherds ×2.", needs: ["shepherd", 5] },
    { id: "swarm",      name: "Firefly Swarm",   glyph: "🐝", cost: 6e11,  type: "building", target: "firefly", mult: 8, desc: "They told their friends about you. Fireflies ×8.", needs: ["firefly", 50] },
    { id: "moonsong",   name: "Moon Song",       glyph: "🎼", cost: 2e12,  type: "building", target: "moongarden", mult: 2, desc: "The tulips hum back at the earth. Moon Gardens ×2.", needs: ["moongarden", 5] },
    { id: "onepulse",   name: "One Pulse",       glyph: "❣️", cost: 8e12,  type: "tapRate", pct: 0.15,  desc: "One heart, two lights. Taps gain +15% of light/sec." },
    { id: "dawnhymn",   name: "Dawn Hymn",       glyph: "🌅", cost: 3e13,  type: "global",  mult: 2,    desc: "A song about a sunrise neither of you has seen. Everything ×2." },
    { id: "sunwithin",  name: "The Sun Within",  glyph: "☀️", cost: 5e14,  type: "building", target: "sunseed", mult: 3, desc: "It dreams of sprouting. The dream leaks light. Sun Seeds ×3.", needs: ["sunseed", 5] },
  ];

  /* ─────────────── Evolution stages ───────────────
     The wisp visibly grows. hue is the absolute glow hue:
     gold → warm ember → rose → violet → starlight blue.           */
  const STAGES = [
    { level: 1,  name: "Mote",       radius: 26, hue: 46,  motes: 0, rays: 0 },
    { level: 4,  name: "Spark",      radius: 30, hue: 44,  motes: 0, rays: 0 },
    { level: 8,  name: "Wisp",       radius: 35, hue: 40,  motes: 2, rays: 0 },
    { level: 13, name: "Glimmer",    radius: 40, hue: 34,  motes: 3, rays: 0 },
    { level: 19, name: "Flare",      radius: 46, hue: 26,  motes: 4, rays: 6 },
    { level: 26, name: "Beacon",     radius: 52, hue: 16,  motes: 5, rays: 8 },
    { level: 34, name: "Radiant",    radius: 58, hue: 340, motes: 6, rays: 10 },
    { level: 43, name: "Luminous",   radius: 64, hue: 300, motes: 7, rays: 12 },
    { level: 53, name: "Tiny Star",  radius: 71, hue: 255, motes: 8, rays: 14 },
    { level: 64, name: "Starheart",  radius: 78, hue: 210, motes: 10, rays: 16 },
    { level: 78, name: "Nova",       radius: 84, hue: 190, motes: 12, rays: 18 },
    { level: 94, name: "Little Moon", radius: 89, hue: 180, motes: 14, rays: 20 },
    { level: 112, name: "Dawn",      radius: 94, hue: 55,  motes: 16, rays: 24 },
  ];

  /* ─────────────── Levels ───────────────
     XP = light earned (all sources). Each level: +4% production.  */
  const LEVEL = {
    baseXp: 60,
    growth: 1.42,
    prodPerLevel: 0.04,
  };

  /* ─────────────── Achievements ───────────────
     check(s) receives state, returns true when earned.
     Every achievement gives +1% production. That makes them
     matter — collecting feels good AND is good.                    */
  const ACHIEVEMENTS = [
    { id: "named",     glyph: "💛", name: "Hello, little one", desc: "Give your wisp a name.", check: (s) => !!s.wispName },
    { id: "tap1",      glyph: "👆", name: "First touch",     desc: "Tap your wisp once.", check: (s) => s.taps >= 1 },
    { id: "tap100",    glyph: "🫶", name: "Getting acquainted", desc: "Tap 100 times.", check: (s) => s.taps >= 100 },
    { id: "tap1000",   glyph: "🤗", name: "Inseparable",     desc: "Tap 1,000 times.", check: (s) => s.taps >= 1000 },
    { id: "tap10000",  glyph: "🌟", name: "Devoted",         desc: "Tap 10,000 times.", check: (s) => s.taps >= 10000 },
    { id: "light100",  glyph: "🕯️", name: "A soft glow",     desc: "Earn 100 light.", check: (s) => s.totalLight >= 100 },
    { id: "light10k",  glyph: "🔆", name: "Brightening",     desc: "Earn 10K light.", check: (s) => s.totalLight >= 1e4 },
    { id: "light1m",   glyph: "💡", name: "Radiance",        desc: "Earn 1M light.", check: (s) => s.totalLight >= 1e6 },
    { id: "light100m", glyph: "🌞", name: "Brilliance",      desc: "Earn 100M light.", check: (s) => s.totalLight >= 1e8 },
    { id: "light10b",  glyph: "✴️", name: "A second sun",    desc: "Earn 10B light.", check: (s) => s.totalLight >= 1e10 },
    { id: "build1",    glyph: "🧱", name: "Groundbreaking",  desc: "Build your first thing.", check: (s, g) => g.totalBuildings(s) >= 1 },
    { id: "build10",   glyph: "🏘️", name: "A little corner", desc: "Own 10 buildings.", check: (s, g) => g.totalBuildings(s) >= 10 },
    { id: "build50",   glyph: "🏞️", name: "A living meadow", desc: "Own 50 buildings.", check: (s, g) => g.totalBuildings(s) >= 50 },
    { id: "build100",  glyph: "🌆", name: "A whole world",   desc: "Own 100 buildings.", check: (s, g) => g.totalBuildings(s) >= 100 },
    { id: "level5",    glyph: "🌱", name: "Growing up",      desc: "Reach level 5.", check: (s) => s.level >= 5 },
    { id: "level10",   glyph: "🌿", name: "Coming alive",    desc: "Reach level 10.", check: (s) => s.level >= 10 },
    { id: "level20",   glyph: "🌳", name: "Flourishing",     desc: "Reach level 20.", check: (s) => s.level >= 20 },
    { id: "level30",   glyph: "🎋", name: "Towering gently", desc: "Reach level 30.", check: (s) => s.level >= 30 },
    { id: "return",    glyph: "🏡", name: "Welcome back",    desc: "Return after being away.", check: (s) => s.flags.returned },
    { id: "night",     glyph: "🌃", name: "Night owl",       desc: "Play between midnight and 5am.", check: () => { const h = new Date().getHours(); return h >= 0 && h < 5; } },
    { id: "allbuild",  glyph: "🗝️", name: "One of everything", desc: "Own every kind of building.", check: (s) => BUILDINGS.every((b) => (s.buildings[b.id] || 0) > 0) },
    { id: "upg5",      glyph: "📦", name: "Collector",       desc: "Buy 5 boosts.", check: (s) => Object.keys(s.upgrades).length >= 5 },
    { id: "upg10",     glyph: "🎁", name: "Connoisseur",     desc: "Buy 10 boosts.", check: (s) => Object.keys(s.upgrades).length >= 10 },
    { id: "ascend1",   glyph: "🌠", name: "Goodbye, hello",  desc: "Watch a wisp take its place in the sky.", check: (s) => (s.stars || []).length >= 1 },
    { id: "ascend3",   glyph: "🌌", name: "A family of stars", desc: "Raise three wisps to the sky.", check: (s) => (s.stars || []).length >= 3 },
    { id: "dust10",    glyph: "✨", name: "Stardust keeper", desc: "Hold 10 stardust.", check: (s) => (s.stardust || 0) >= 10 },
    { id: "bond3",     glyph: "💗", name: "It trusts you",   desc: "Reach bond level 3.", check: (s) => s.bond && s.bond.level >= 3 },
    { id: "bond5",     glyph: "💖", name: "Warmth shared",   desc: "Reach bond level 5.", check: (s) => s.bond && s.bond.level >= 5 },
    { id: "bond8",     glyph: "💞", name: "Kindred lights",  desc: "Reach bond level 8.", check: (s) => s.bond && s.bond.level >= 8 },
    { id: "streak3",   glyph: "📅", name: "Three nights",    desc: "Visit 3 days in a row.", check: (s) => s.streak && s.streak.count >= 3 },
    { id: "streak7",   glyph: "🗓️", name: "A whole week",    desc: "Visit 7 days in a row.", check: (s) => s.streak && s.streak.count >= 7 },
    { id: "streak30",  glyph: "🏆", name: "A month of light", desc: "Visit 30 days in a row.", check: (s) => s.streak && s.streak.count >= 30 },
    { id: "light1t",   glyph: "🌅", name: "Almost a dawn",   desc: "Earn 1T light.", check: (s) => s.totalLight >= 1e12 },
    { id: "light100t", glyph: "🌄", name: "Daybreak",        desc: "Earn 100T light.", check: (s) => s.totalLight >= 1e14 },
    { id: "jar25",     glyph: "🫙", name: "A jar of friends", desc: "Own 25 fireflies.", check: (s) => (s.buildings.firefly || 0) >= 25 },
    { id: "build250",  glyph: "🌌", name: "A small universe", desc: "Own 250 buildings.", check: (s, g) => g.totalBuildings(s) >= 250 },
    { id: "level50",   glyph: "💫", name: "Half a hundred",  desc: "Reach level 50.", check: (s) => s.level >= 50 },
    { id: "level75",   glyph: "🌠", name: "Beyond the hills", desc: "Reach level 75.", check: (s) => s.level >= 75 },
    { id: "level100",  glyph: "🌞", name: "A hundred lights", desc: "Reach level 100.", check: (s) => s.level >= 100 },
    { id: "sunseed1",  glyph: "🌻", name: "Planted hope",    desc: "Plant a Sun Seed.", check: (s) => (s.buildings.sunseed || 0) >= 1 },
  ];
  const ACH_PROD_BONUS = 0.01;

  /* ─────────────── Wisp voice ───────────────
     Little things it says. Keys are moments; arrays are picked
     from at random. {name} is replaced with the player… wait, no —
     the wisp doesn't know your name yet. It just knows you're here. */
  const VOICE = {
    greetDawn:   ["you stayed up… or got up early? either way, hi.", "the sky is turning. I like this part.", "good morning. I kept the light on."],
    greetDay:    ["hello! the world is bright today.", "you're here! I was just thinking about you.", "hi hi hi!"],
    greetEvening:["good evening. the fireflies are waking up.", "you came back! the lanterns missed you.", "evening. my favourite time."],
    greetNight:  ["it's late… I'm glad you're here though.", "shh… the meadow is sleeping. but I'm awake!", "the stars and me were waiting for you."],
    tapHappy:    ["hehe", "again!", "warm!", "✦", "more!", "that tickles"],
    levelUp:     ["I feel… bigger!", "did you see that?!", "I'm growing because of you.", "look at me!!", "something changed. something good."],
    firstBuild:  ["oh! for me?", "it's beautiful…", "our first one."],
    build:       ["it's perfect.", "the meadow likes it too.", "another one! another one!", "I'll take care of it.", "it glows like me!"],
    idleSoft:    ["the wind smells like moonflowers.", "I named one of the fireflies after you.", "do you think the moon gets lonely?", "I like it when you're here.", "one day I want to see the sun.", "the owl told me a secret. I'll tell you later.", "sometimes I glow extra just in case you're watching."],
    rare:        ["when I become a star… will you still visit?", "I remember the day you named me.", "I was so small when you found me.", "you built all of this. for me.", "I'm not scared of the dark. not anymore."],
    petThanks:   ["mmm…", "right there.", "don't stop!", "I could stay like this forever.", "your hands are warm."],
    attention:   ["…psst.", "hey. hey. look at me?", "I found something! come here!", "are you busy…?", "I miss your hands."],
    attnThanks:  ["you came!!", "I knew you would.", "hehe, it was nothing. I just missed you.", "best. moment. today."],
    daily:       ["you came back! you always come back.", "I saved this for you.", "I counted the nights until you returned.", "today is a good day. you're in it."],
  };

  /* ─────────────── Bond ───────────────
     Petting and daily visits deepen your bond. The bond is *yours* —
     it carries across generations of wisps.                        */
  const BOND = {
    baseXp: 25,
    growth: 1.7,
    prodPerLevel: 0.02,   // +2% production per bond level
    tapPerLevel: 0.05,    // +5% tap per bond level
    petXp: 1,             // per pet pulse (~0.55s of holding)
    titles: ["Curious", "Friendly", "Fond", "Close", "Warm", "Devoted",
             "Inseparable", "Kindred", "Soulbound", "One Light"],
  };

  /* ─────────────── Attention moments ───────────────
     Sometimes the wisp just wants you. Answering is always worth it. */
  const ATTENTION = {
    minGap: 150, maxGap: 420,   // seconds between moments
    window: 22,                 // seconds to respond
    bondXp: 15,
    prodMinutes: 4,             // reward: minutes of production
    tapMult: 40,                // …or at least this many taps
  };

  /* ─────────────── Daily gift & streak ─────────────── */
  const DAILY = {
    buffMult: 2,
    buffMinutes: 10,
    prodMinutes: 30,            // gift: minutes of production (min 500)
    bondBase: 10, bondPerDay: 5,
  };

  /* ─────────────── Ascension (prestige) ───────────────
     Your wisp becomes a permanent star in YOUR sky. Each point of
     stardust makes every future wisp shine 10% brighter.           */
  const PRESTIGE = {
    unlockLevel: 15,     // ascension card appears in the Wisp tab
    divisor: 5e7,        // stardust = floor(sqrt(totalLight / divisor))
    perStardust: 0.10,
    ceremonySec: 4.2,
  };

  /* ─────────────── Offline ─────────────── */
  const OFFLINE = {
    rate: 0.6,          // earn at 60% while away
    capHours: 8,        // up to 8 hours
    minSeconds: 90,     // don't bother below this
  };

  /* ─────────────── Tap ─────────────── */
  const TAP = {
    base: 1,
    critChance: 0.03,
    critMult: 10,
  };

  W.config = {
    BUILDINGS, UPGRADES, STAGES, LEVEL,
    ACHIEVEMENTS, ACH_PROD_BONUS,
    VOICE, OFFLINE, TAP, PRESTIGE,
    BOND, ATTENTION, DAILY,
    SAVE_KEY: "wisp.save.v1",
    VERSION: 1,
  };
})();
