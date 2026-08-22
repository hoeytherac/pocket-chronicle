export type Edition = "personal" | "commercial";
export type SubscriptionStatus = "personal" | "trialing" | "active" | "past_due" | "canceled";

export type ChronicleActionKind =
  | "adjustHp"
  | "useItem"
  | "roll"
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
  level: number;
  hp: { value: number; max: number; temp?: number };
  ac: number;
  speed: number;
  abilities: Array<{ key: string; label: string; score: number; modifier: number }>;
  resources: Array<{ key: string; label: string; value: number; max: number }>;
  actions: Array<{ uuid: string; name: string; type: string; uses?: string }>;
  biography?: string;
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
}

export const allowedActionKinds = new Set<ChronicleActionKind>([
  "adjustHp",
  "useItem",
  "roll",
  "chat",
  "purchase",
  "updateBiography",
  "requestLevelUp",
]);
