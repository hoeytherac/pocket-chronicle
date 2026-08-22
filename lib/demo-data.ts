import type { ChronicleSnapshot } from "./protocol";

// This placeholder is never rendered while the app is locked. Live character,
// journal, chat, and shop data arrives only through a paired Foundry module.
export const demoSnapshot: ChronicleSnapshot = {
  campaign: { id: "unpaired", name: "Connected Campaign", edition: "personal" },
  actor: {
    uuid: "Actor.unpaired",
    name: "Unpaired Adventurer",
    ancestry: "Adventurer",
    classLabel: "Adventurer",
    identity: { species: "Adventurer", className: "Adventurer", languages: [] },
    level: 1,
    hp: { value: 0, max: 0, temp: 0 },
    ac: 10,
    speed: 0,
    initiative: 0,
    inspiration: false,
    deathSaves: { successes: 0, failures: 0 },
    abilities: [
      { key: "str", label: "Strength", score: 10, modifier: 0 },
      { key: "dex", label: "Dexterity", score: 10, modifier: 0 },
      { key: "con", label: "Constitution", score: 10, modifier: 0 },
      { key: "int", label: "Intelligence", score: 10, modifier: 0 },
      { key: "wis", label: "Wisdom", score: 10, modifier: 0 },
      { key: "cha", label: "Charisma", score: 10, modifier: 0 },
    ],
    saves: [],
    skills: [],
    resources: [],
    actions: [],
  },
  journals: [],
  messages: [],
  shop: [],
  session: { title: "Foundry Connection", subtitle: "Waiting for the active GM" },
  revision: 0,
  generatedAt: 0,
};
