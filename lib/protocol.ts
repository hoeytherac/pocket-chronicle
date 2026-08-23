export type Edition = "personal" | "commercial";
export type SubscriptionStatus = "personal" | "trialing" | "active" | "past_due" | "canceled";

export type ChronicleActionKind =
  | "adjustHp"
  | "useItem"
  | "consumeItem"
  | "roll"
  | "rollAbility"
  | "rollSkill"
  | "rollSave"
  | "rollInitiative"
  | "rollDeathSave"
  | "recordDeathSave"
  | "showDice"
  | "setInspiration"
  | "chat"
  | "purchase"
  | "updateBiography"
  | "requestLevelUp";

export interface ChronicleActor {
  uuid: string;
  name: string;
  portrait?: string;
  ancestry: string;
  classLabel: string;
  identity?: {
    species: string;
    background?: string;
    className?: string;
    subclass?: string;
    alignment?: string;
    size?: string;
    languages?: string[];
  };
  level: number;
  hp: { value: number; max: number; temp?: number };
  ac: number;
  speed: number;
  initiative?: number;
  inspiration?: boolean;
  deathSaves?: { successes: number; failures: number };
  abilities: Array<{ key: string; label: string; score: number; modifier: number }>;
  saves?: Array<{ key: string; label: string; modifier: number; proficient: boolean }>;
  skills?: Array<{
    key: string;
    label: string;
    ability: string;
    modifier: number;
    passive: number;
    proficiency: number;
  }>;
  resources: Array<{
    key: string;
    label: string;
    value: number;
    max: number;
    spent?: number;
    kind?: "actor" | "item" | "activity";
    itemUuid?: string;
    activityId?: string;
  }>;
  effects?: Array<{
    id: string;
    name: string;
    image?: string;
    statuses?: string[];
    duration?: string;
    source?: string;
    description?: string;
  }>;
  spellSlots?: Array<{
    key: string;
    label: string;
    level: number;
    value: number;
    max: number;
    pact?: boolean;
  }>;
  actions: Array<{
    uuid: string;
    name: string;
    type: string;
    category?: "action" | "spell" | "feat" | "item";
    subtitle?: string;
    description?: string;
    image?: string;
    uses?: string;
    spellLevel?: number;
    rolls?: Array<{
      key: string;
      label: string;
      formula: string;
      kind: "attack" | "damage" | "healing" | "item";
    }>;
    activities?: Array<{
      id: string;
      name: string;
      type: string;
      typeLabel?: string;
      activation?: string;
      duration?: string;
      concentration?: boolean;
      description?: string;
      save?: {
        abilities: string[];
        abilityLabels: string[];
        dc: number;
        onSuccess?: string;
      };
      effects?: Array<{ id: string; name: string; image?: string }>;
      castOptions?: Array<{
        slotKey?: string;
        level: number;
        label: string;
        value?: number;
        max?: number;
        pact?: boolean;
      }>;
      rollsByLevel?: Array<{
        level: number;
        rolls: Array<{
          key: string;
          label: string;
          formula: string;
          kind: "attack" | "damage" | "healing" | "item";
        }>;
      }>;
      consumptionByOption?: Array<{
        slotKey?: string;
        level: number;
        entries: Array<{
          type: string;
          label: string;
          hint?: string;
          value?: number;
          warning?: boolean;
        }>;
      }>;
      automation?: {
        providers: string[];
        requiresFoundryWorkflow: boolean;
      };
      canConsume?: boolean;
      requiresSpellSlot?: boolean;
    }>;
    canConsume?: boolean;
  }>;
  owners?: Array<{ userId: string; name: string }>;
  biography?: string;
}

export interface ChronicleCharacterChoice {
  uuid: string;
  name: string;
  portrait?: string;
  ancestry: string;
  classLabel: string;
  level: number;
}

export interface ChronicleJournal {
  uuid: string;
  title: string;
  summary: string;
  content: string;
  image?: string;
  updatedAt: number;
}

export interface ChronicleMessage {
  id: string;
  author: string;
  content: string;
  rollTotal?: number;
  timestamp: number;
}

export interface ChronicleShopItem {
  uuid: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  image?: string;
}

export interface ChronicleSnapshot {
  campaign: { id: string; name: string; edition: Edition };
  actor: ChronicleActor;
  integrations?: Array<{ id: string; label: string; active: boolean; version?: string }>;
  journals: ChronicleJournal[];
  messages: ChronicleMessage[];
  shop: ChronicleShopItem[];
  session: { title: string; subtitle: string; dateLabel?: string };
  revision: number;
  generatedAt: number;
}

export interface QueuedChronicleAction {
  id: string;
  actorUuid: string;
  kind: ChronicleActionKind;
  payload: Record<string, unknown>;
  createdAt: number;
  requestedByFoundryUserId?: string;
}

export const allowedActionKinds = new Set<ChronicleActionKind>([
  "adjustHp",
  "useItem",
  "consumeItem",
  "roll",
  "rollAbility",
  "rollSkill",
  "rollSave",
  "rollInitiative",
  "rollDeathSave",
  "recordDeathSave",
  "showDice",
  "setInspiration",
  "chat",
  "purchase",
  "updateBiography",
  "requestLevelUp",
]);
