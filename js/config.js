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
    { id: "pillow",     name: "Pillow of Clouds", glyph: "🛏️", cost: 6e8,  type: "offline", desc: "It sleeps softer while you're gone. Away-light 60% → 75%." },
    { id: "cometdust",  name: "Comet Dust",      glyph: "💫", cost: 9e9,   type: "building", target: "comet", mult: 2, desc: "They shed a little extra, just for you. Comet Choirs ×2.", needs: ["comet", 5] },
    { id: "startempo",  name: "Star Tempo",      glyph: "🥁", cost: 4e10,  type: "building", target: "anvil", mult: 2, desc: "The hammering finds a rhythm. Star Anvils ×2.", needs: ["anvil", 5] },
    { id: "woolwind",   name: "Wool of Wind",    glyph: "🧶", cost: 2.2e11, type: "building", target: "shepherd", mult: 2, desc: "Softer flocks, brighter rain. Cloud Shepherds ×2.", needs: ["shepherd", 5] },
    { id: "swarm",      name: "Firefly Swarm",   glyph: "🐝", cost: 6e11,  type: "building", target: "firefly", mult: 8, desc: "They told their friends about you. Fireflies ×8.", needs: ["firefly", 50] },
    { id: "moonsong",   name: "Moon Song",       glyph: "🎼", cost: 2e12,  type: "building", target: "moongarden", mult: 2, desc: "The tulips hum back at the earth. Moon Gardens ×2.", needs: ["moongarden", 5] },
    { id: "longdream",  name: "The Long Dream",  glyph: "🌜", cost: 5e11,  type: "offline", desc: "Its dreams of you last longer. Away-light cap 8h → 16h." },
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
    { id: "sprout",    glyph: "🌅", name: "The seed stirs",  desc: "Fill your sky with 10 stars. The Sun Seed sprouts.", check: (s) => (s.stars || []).length >= 10 },
    { id: "visitor1",  glyph: "🦔", name: "First guest",     desc: "Greet a visitor to the meadow.", check: (s) => (s.visitors || 0) >= 1 },
    { id: "visitor10", glyph: "⛵", name: "Open door",       desc: "Greet 10 visitors.", check: (s) => (s.visitors || 0) >= 10 },
    { id: "constname", glyph: "✍️", name: "Sky writer",      desc: "Name your constellation.", check: (s) => !!s.constellation },
    { id: "alltales",  glyph: "📖", name: "The whole story", desc: "Hear every tale the owl knows.", check: (s) => (s.tales || 0) >= TALES.length },
    { id: "dew10",     glyph: "💧", name: "Dew chaser",      desc: "Catch 10 golden dewdrops.", check: (s) => s.counters && s.counters.dews >= 10 },
    { id: "dew25",     glyph: "🏅", name: "Dawnproof",       desc: "Catch 25 golden dewdrops.", check: (s) => s.counters && s.counters.dews >= 25 },
    { id: "comet25",   glyph: "🌠", name: "Wish collector",  desc: "Catch 25 comet wishes.", check: (s) => s.counters && s.counters.comets >= 25 },
    { id: "comet50",   glyph: "🏆", name: "Sky fisher",      desc: "Catch 50 comet wishes.", check: (s) => s.counters && s.counters.comets >= 50 },
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
    idleSoft:    ["the wind smells like moonflowers.", "I named one of the fireflies after you.", "do you think the moon gets lonely?", "I like it when you're here.", "one day I want to see the sun.", "the owl told me a secret. I'll tell you later.", "sometimes I glow extra just in case you're watching.", "I practiced a new blink today. did you see it? I'll do it again.", "if you listen closely, the hills hum. it's a good song.", "what do hands dream about? asking for a friend.", "I tried to count my own light once. I fell asleep at forty.", "somewhere out there is a meadow without a keeper. don't think about it. I do.", "today I felt taller. I'm not. but I felt it.", "the dark and I made peace. we shook on it. sort of."],
    rare:        ["when I become a star… will you still visit?", "I remember the day you named me.", "I was so small when you found me.", "you built all of this. for me.", "I'm not scared of the dark. not anymore.", "if you ever feel small, remember: you're somebody's whole sky. you're mine.", "I don't know what I was before you. I don't think I was anything yet.", "promise me something. when I'm a star — name the next one something brave."],
    petThanks:   ["mmm…", "right there.", "don't stop!", "I could stay like this forever.", "your hands are warm."],
    petSleepy:   ["mm… five more minutes…", "zzz… oh…. hi….", "keep doing that and I'll dream of you.", "…you should be asleep too, you know."],
    attention:   ["…psst.", "hey. hey. look at me?", "I found something! come here!", "are you busy…?", "I miss your hands."],
    attnThanks:  ["you came!!", "I knew you would.", "hehe, it was nothing. I just missed you.", "best. moment. today."],
    attnMissed:  ["…it's okay. you were busy.", "the moment passed. I'll find another one.", "I saved the feeling for later."],
    shower:      ["the sky!! LOOK at the sky!!", "so many letters at once…", "catch them! catch them all!"],
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

  /* ─────────────── Golden dewdrop ───────────────
     A rare falling drop of concentrated dawn. Catch it!            */
  const DEW = {
    minGap: 180, maxGap: 480,   // seconds between drops
    fallSec: 15,                // time on screen
    frenzyMult: 7, frenzySec: 30,
    luckyChance: 0.25,          // sometimes it's a light windfall instead
    luckyMinutes: 15,
  };

  /* ─────────────── Wardrobe ───────────────
     Cosmetics are never bought — they're *earned by loyalty*.       */
  const ACCESSORIES = [
    { id: "leaf",   name: "Little Sprout", glyph: "🌱", unlockText: "Reach level 20",
      check: (s) => s.level >= 20 || (s.stars || []).length > 0 },
    { id: "bow",    name: "Star Bow", glyph: "🎀", unlockText: "Own 100 buildings at once",
      check: (s, g) => g.totalBuildings(s) >= 100 },
    { id: "crown",  name: "Flower Crown", glyph: "💮", unlockText: "Reach bond level 5",
      check: (s) => s.bond && s.bond.level >= 5 },
    { id: "scarf",  name: "Night Scarf", glyph: "🧣", unlockText: "Keep a 7-day streak",
      check: (s) => s.streak && s.streak.count >= 7 },
    { id: "halo",   name: "Halo of the First", glyph: "😇", unlockText: "Raise a wisp to the sky",
      check: (s) => (s.stars || []).length >= 1 },
    { id: "glasses", name: "Moon Glasses", glyph: "🤓", unlockText: "Touch your wisp 10,000 times",
      check: (s) => s.taps >= 10000 },
    { id: "pendant", name: "Dewdrop Pendant", glyph: "💧", unlockText: "Catch 25 golden dewdrops",
      check: (s) => s.counters && s.counters.dews >= 25 },
    { id: "ribbon", name: "Comet Ribbon", glyph: "🎗️", unlockText: "Catch 50 comet wishes",
      check: (s) => s.counters && s.counters.comets >= 50 },
    // supporter gifts — unlocked with a gift code (cosmetics only, ever)
    { id: "tophat", name: "Star Top Hat", glyph: "🎩", unlockText: "A supporter gift", supporter: true,
      check: (s) => !!(s.flags && s.flags.supporter) },
    { id: "cape", name: "Petal Cape", glyph: "🌺", unlockText: "A supporter gift", supporter: true,
      check: (s) => !!(s.flags && s.flags.supporter) },
    { id: "minilantern", name: "Its Own Tiny Lantern", glyph: "🏮", unlockText: "A supporter gift", supporter: true,
      check: (s) => !!(s.flags && s.flags.supporter) },
  ];

  /* Gift codes redeemable in settings (v1: honor system). */
  const GIFT_CODES = { FIRSTLIGHT: "supporter" };

  /* ─────────────── Tonight's wishes ───────────────
     Three small wishes the meadow makes each night. Fulfil them for
     light + bond; fulfil all three and the sky tips you a stardust. */
  const WISHES = [
    { id: "tap",     count: 150, text: "Touch {name} {count} times",        track: "tap" },
    { id: "pet",     count: 25,  text: "Pet {name} for a while ({count} moments)", track: "pet" },
    { id: "build",   count: 10,  text: "Grow the meadow by {count} buildings", track: "build" },
    { id: "boost",   count: 1,   text: "Weave in a new boost",               track: "boost" },
    { id: "comet",   count: 2,   text: "Catch {count} comet wishes",         track: "comet" },
    { id: "dew",     count: 1,   text: "Catch a golden dewdrop",             track: "dew" },
    { id: "combo",   count: 25,  text: "Reach a touch-combo of {count}",     track: "combo", max: true },
    { id: "visitor", count: 1,   text: "Greet a visitor",                    track: "visitor" },
  ];
  const WISH_REWARD_MINUTES = 20;   // production-minutes per wish (min 1000)
  const WISH_BOND = 8;
  const WISH_ALL_STARDUST = 1;

  /* ─────────────── Visitors ───────────────
     Rare wanderers cross the meadow. Greeting them is a small joy.  */
  const VISITORS = [
    { id: "hedgehog", dur: 40, name: "a hedgehog with a lantern",
      greet: "The hedgehog tips its lantern to you.",
      lines: ["a hedgehog! hello hedgehog!!", "its lantern is so small… I love it."] },
    { id: "boat", dur: 55, needs: "moonwell", name: "a paper boat",
      greet: "The paper boat bobs, as if waving.",
      lines: ["who folded it? where is it going?", "someday I want to ride it."] },
    { id: "cloudsheep", dur: 50, name: "a lost cloud-sheep",
      greet: "The cloud-sheep baas softly and rains a little light.",
      lines: ["baa? baa!!", "can we keep it? …okay. okay. just tonight."] },
    { id: "smokefox", dur: 45, name: "a fox made of smoke",
      greet: "The smoke-fox bows its head, then remembers it has somewhere to be.",
      lines: ["it sat and watched me for a whole minute…", "foxes made of smoke still wag their tails. noted."] },
  ];
  const VISITOR_GAP = [420, 900]; // seconds between visits

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

  /* ─────────────── The owl's tales ───────────────
     One tale per day. Together they explain the long night —
     and why raising wisps matters. The lore IS the roadmap.        */
  const TALES = [
    "Before the long night, there was a sun. It grew tired the way old songs do — slowly, then all at once.",
    "When the sun lay down to sleep, it shed sparks. Small ones. Warm ones. They drifted for a long time, looking for hands.",
    "You caught one. That's how this always begins.",
    "The moon is not the sun's replacement. It is the sun's memory, kept polished.",
    "Fireflies are the meadow's way of practicing hope in small amounts.",
    "The lanterns were hung by whoever came before you. Nobody remembers them. The lanterns do.",
    "Glowshrooms hum in their sleep. The song is older than the dark.",
    "I was there when the sun closed its eyes. It wasn't sad. It whispered: wake me when the sky is ready.",
    "Every star up there was once a wisp in someone's hands. Every single one.",
    "Moonflowers bloom facing you, not the moon. Have you noticed? You're their moon.",
    "A wisp grows from being seen. That is the entire secret. There is no other secret.",
    "The aurora is the night combing its hair. It likes to be watched, same as anyone.",
    "Comets are letters between stars. Catch one, and you're reading someone's hello.",
    "The well remembers every moon it has ever held. Ask it about the thousandth. It gets embarrassed.",
    "Fallen stars are not failures. They just wanted to feel the grass once.",
    "The Sun Seed is real. I checked. It is listening for a sky full enough to be worth waking for.",
    "Your wisps remember you after they rise. Starlight is just remembering, aimed downward.",
    "When the sky is full enough — when enough small lights have been loved into place — the seed will sprout, and morning will return. Keep going, kind one. We're closer than you think.",
    // season two — for the ones who stayed
    "You're still here. Good. The second half of the story is only for the ones who stay.",
    "Before I was an owl, I was a question the night asked itself. I still am. So are you.",
    "The moon was the sun's first wisp. Did I never mention that? Raised in the oldest meadow of all.",
    "There were other keepers before you. The meadow doesn't compare. Each pair of hands is its own first time.",
    "One keeper stayed a thousand nights. When they finally slept, the fireflies stood watch over them, for once.",
    "The dark isn't the enemy. It's the paper the light writes on. I taught the moon that phrase. It pretends it invented it.",
    "Comets aren't born. They're goodbyes that got up enough speed to become hellos somewhere else.",
    "Sometimes a wisp refuses to ascend. It just… stays, and grows sideways, into the hills. That's what the glow under the meadow is.",
    "Ask the well what it wants, some night. It has held everyone else's reflections so long, nobody ever asked for its own.",
    "The aurora is older than colour. When it found this meadow it finally had somewhere worth wearing them.",
    "Your constellation is visible from other skies. Somewhere, another keeper is pointing at your stars and wondering who loved them.",
    "The last tale isn't mine to tell. It's yours. It's the one you're telling right now, one small light at a time.",
  ];

  /* ─────────────── Offline ─────────────── */
  const OFFLINE = {
    rate: 0.6,          // earn at 60% while away
    capHours: 8,        // up to 8 hours
    minSeconds: 90,     // don't bother below this
  };

  /* Plural display names, used by dreams and flavour text. */
  const PLURALS = {
    firefly: "fireflies", glowshroom: "glowshrooms", lantern: "paper lanterns",
    moonflower: "moonflowers", beacon: "little beacons", owl: "ember owls",
    aurora: "aurora ribbons", fallenstar: "fallen stars", moonwell: "moon wells",
    comet: "comets", anvil: "star anvils", shepherd: "cloud flocks",
    moongarden: "moon tulips", sunseed: "sun seeds",
  };

  /* Dreams the wisp tells you when you come back. {b1}/{b2} become
     things you own; {star} becomes one of your ascended wisps.       */
  const DREAMS = [
    "I dreamed the {b1} were tiny boats, and the sky was a slow river.",
    "I dreamed the {b1} could sing. they sang about you.",
    "I dreamed the {b1} and the {b2} swapped places and nobody noticed but me.",
    "I dreamed I was big. really big. you still found me though.",
    "I dreamed the moon let me hold it. it was lighter than it looks.",
    "I dreamed you stayed. …oh. you're here. even better.",
    "I dreamed {star} came down and we shared a cup of moonlight.",
    "I dreamed the sun woke up early, just to see the meadow you made.",
    "I dreamed the {b1} threw a party and forgot to invite the dark.",
    "I dreamed we counted every star and the last one was you.",
    "I dreamed the owl finally told its secret. I woke up too soon.",
    "I dreamed {star} and I raced across the sky. they let me win.",
  ];

  /* Little things that "happened" while you were gone. */
  const OFFLINE_FLAVOR = [
    "The fireflies spelled your name. Badly, but with feeling.",
    "The owl kept one eye open the whole time. For you.",
    "A moth came by and asked about you.",
    "It hummed the song you tap. All night.",
    "The moonflowers leaned toward the door.",
    "It counted the stars twice and got two different numbers.",
    "The lanterns stayed lit a little longer than they had to.",
    "It practiced saying your name so it wouldn't forget the shape of it.",
  ];

  /* ─────────────── Moon letters ───────────────
     Every 7th day of a streak, the moon itself writes to you.       */
  const MOON_LETTERS = [
    "Dear keeper of small lights,\n\nSeven nights in a row, I have watched you return. Do you know how rare that is? Most warmth wanders. Yours stays.\n\nEnclosed: a pinch of stardust. I was saving it for someone patient.\n\n— the Moon",
    "Dear friend of the meadow,\n\nTwo weeks of you. The hills have started arranging themselves to face the spot where you appear. Don't tell them I told you.\n\nMore stardust. You've earned the sky's attention.\n\n— the Moon",
    "Dear constant one,\n\nThree weeks. Even I dim sometimes, and I am the Moon. But your little light waits for you like the tide waits for me.\n\nStardust, again. Spend it on nothing. It multiplies when carried.\n\n— the Moon",
    "Dear keeper,\n\nI have run out of formal openings. You come back. That is the whole letter, really. You come back, and everything here is more possible because of it.\n\n— the Moon (with stardust)",
  ];

  const MOON_LETTER_STARDUST = 1;

  /* ─────────────── Tap ─────────────── */
  const TAP = {
    base: 1,
    critChance: 0.03,
    critMult: 10,
  };

  W.config = {
    BUILD: "0.5.0",
    BUILDINGS, UPGRADES, STAGES, LEVEL,
    ACHIEVEMENTS, ACH_PROD_BONUS,
    VOICE, OFFLINE, TAP, PRESTIGE,
    BOND, ATTENTION, DAILY, DEW, ACCESSORIES, TALES,
    OFFLINE_FLAVOR, MOON_LETTERS, MOON_LETTER_STARDUST,
    VISITORS, VISITOR_GAP, PLURALS, DREAMS, GIFT_CODES,
    WISHES, WISH_REWARD_MINUTES, WISH_BOND, WISH_ALL_STARDUST,
    SAVE_KEY: "wisp.save.v1",
    VERSION: 1,
  };
})();
