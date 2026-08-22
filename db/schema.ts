import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const tenants = sqliteTable("tenants", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  edition: text("edition", { enum: ["personal", "commercial"] }).notNull().default("personal"),
  subscriptionStatus: text("subscription_status", {
    enum: ["personal", "trialing", "active", "past_due", "canceled"],
  }).notNull().default("personal"),
  createdAt: integer("created_at").notNull(),
}, (table) => [uniqueIndex("tenants_slug_unique").on(table.slug)]);

export const campaigns = sqliteTable("campaigns", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  bridgeKeyHash: text("bridge_key_hash").notNull(),
  status: text("status", { enum: ["active", "paused"] }).notNull().default("active"),
  lastSeenAt: integer("last_seen_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [index("campaigns_tenant_idx").on(table.tenantId)]);

export const pairingCodes = sqliteTable("pairing_codes", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  codeHash: text("code_hash").notNull(),
  actorUuid: text("actor_uuid").notNull(),
  playerLabel: text("player_label").notNull(),
  expiresAt: integer("expires_at").notNull(),
  consumedAt: integer("consumed_at"),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  uniqueIndex("pairing_codes_hash_unique").on(table.codeHash),
  index("pairing_codes_expiry_idx").on(table.expiresAt),
]);

export const playerAccounts = sqliteTable("player_accounts", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  foundryUserId: text("foundry_user_id").notNull(),
  playerLabel: text("player_label").notNull(),
  credentialHash: text("credential_hash"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  uniqueIndex("player_accounts_campaign_user_unique").on(table.campaignId, table.foundryUserId),
  index("player_accounts_campaign_idx").on(table.campaignId),
]);

export const playerAccountCharacters = sqliteTable("player_account_characters", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull().references(() => playerAccounts.id, { onDelete: "cascade" }),
  campaignId: text("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  actorUuid: text("actor_uuid").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  uniqueIndex("player_account_characters_unique").on(table.accountId, table.actorUuid),
  index("player_account_characters_actor_idx").on(table.campaignId, table.actorUuid),
]);

export const accountPairingCodes = sqliteTable("account_pairing_codes", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull().references(() => playerAccounts.id, { onDelete: "cascade" }),
  codeHash: text("code_hash").notNull(),
  expiresAt: integer("expires_at").notNull(),
  consumedAt: integer("consumed_at"),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  uniqueIndex("account_pairing_codes_hash_unique").on(table.codeHash),
  index("account_pairing_codes_expiry_idx").on(table.expiresAt),
]);

export const playerSessions = sqliteTable("player_sessions", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  actorUuid: text("actor_uuid").notNull(),
  accountId: text("account_id").references(() => playerAccounts.id, { onDelete: "set null" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  uniqueIndex("player_sessions_token_unique").on(table.tokenHash),
  index("player_sessions_expiry_idx").on(table.expiresAt),
]);

export const snapshots = sqliteTable("snapshots", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  campaignId: text("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  actorUuid: text("actor_uuid").notNull(),
  revision: integer("revision").notNull().default(1),
  payloadJson: text("payload_json").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  uniqueIndex("snapshots_campaign_actor_unique").on(table.campaignId, table.actorUuid),
  index("snapshots_tenant_idx").on(table.tenantId),
]);

export const actions = sqliteTable("actions", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  campaignId: text("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  actorUuid: text("actor_uuid").notNull(),
  sessionId: text("session_id").references(() => playerSessions.id, { onDelete: "set null" }),
  kind: text("kind").notNull(),
  payloadJson: text("payload_json").notNull(),
  status: text("status", { enum: ["pending", "claimed", "completed", "failed"] }).notNull().default("pending"),
  resultJson: text("result_json"),
  createdAt: integer("created_at").notNull(),
  completedAt: integer("completed_at"),
}, (table) => [
  index("actions_campaign_queue_idx").on(table.campaignId, table.status, table.createdAt),
  index("actions_actor_idx").on(table.actorUuid),
]);
