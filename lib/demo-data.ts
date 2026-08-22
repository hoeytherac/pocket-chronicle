import type { ChronicleSnapshot } from "./protocol";

export const demoSnapshot: ChronicleSnapshot = {
  campaign: { id: "demo-grand-blooming", name: "The Grand Blooming", edition: "personal" },
  actor: {
    uuid: "Actor.demoCandy",
    name: "“Candy” Carolyn Alistair Candigoor",
    ancestry: "Elf",
    classLabel: "Druid",
    level: 10,
    hp: { value: 78, max: 83, temp: 0 },
    ac: 17,
    speed: 30,
    abilities: [
      { key: "str", label: "Strength", score: 10, modifier: 0 },
      { key: "dex", label: "Dexterity", score: 14, modifier: 2 },
      { key: "con", label: "Constitution", score: 16, modifier: 3 },
      { key: "int", label: "Intelligence", score: 12, modifier: 1 },
      { key: "wis", label: "Wisdom", score: 20, modifier: 5 },
      { key: "cha", label: "Charisma", score: 11, modifier: 0 },
    ],
    resources: [
      { key: "wildshape", label: "Wild Shape", value: 2, max: 2 },
      { key: "inspiration", label: "Inspiration", value: 1, max: 1 },
    ],
    actions: [
      { uuid: "Item.demoStaff", name: "Quarterstaff", type: "Weapon", uses: "At will" },
      { uuid: "Item.demoFlame", name: "Produce Flame", type: "Cantrip", uses: "At will" },
      { uuid: "Item.demoHeal", name: "Healing Word", type: "Spell", uses: "4 slots" },
    ],
    biography: "A druid carrying old promises into a world beginning to bloom again.",
  },
  journals: [
    {
      uuid: "JournalEntry.demoCradle",
      title: "The Cradle of Blooming Light",
      summary: "A sanctuary of pilgrims, living flowers, and the first promises of the festival.",
      content: "The Cradle stands at the heart of Feyrandralis. During the Days of the First Steps, one hundred pilgrims began the journey toward its living light. The road has already asked a terrible price, and every arrival now carries the weight of those who did not reach the gates.",
      updatedAt: Date.now() - 1000 * 60 * 18,
    },
    {
      uuid: "JournalEntry.demoSession",
      title: "Session One — Days of the First Steps",
      summary: "Arriving at the Cradle of Blooming Light.",
      content: "The party arrives as festival lanterns are raised and the surviving pilgrims gather beneath the blue-glass arches. This is where the next promise begins.",
      updatedAt: Date.now() - 1000 * 60 * 60 * 9,
    },
  ],
  messages: [
    { id: "demo-1", author: "The GM", content: "The bells of the Cradle ring once for every pilgrim who arrived.", timestamp: Date.now() - 1000 * 60 * 8 },
    { id: "demo-2", author: "Candy", content: "I look for the flowers that have not opened yet.", rollTotal: 19, timestamp: Date.now() - 1000 * 60 * 3 },
  ],
  shop: [
    { uuid: "Item.demoTea", name: "Festival Moon Tea", description: "A fragrant blue tea served in a keepsake cup.", price: 4, currency: "gp" },
    { uuid: "Item.demoRibbon", name: "First Steps Ribbon", description: "A pale-blue ribbon stitched with a single gold thread.", price: 2, currency: "gp" },
    { uuid: "Item.demoKit", name: "Pilgrim’s Field Kit", description: "Bandages, chalk, waxed cord, and a weatherproof journal.", price: 12, currency: "gp" },
  ],
  session: { title: "Days of the First Steps", subtitle: "Festival Week · Session Two", dateLabel: "29 AUG" },
  revision: 1,
  generatedAt: Date.now(),
};
