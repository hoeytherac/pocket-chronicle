import { and, asc, eq, gt } from "drizzle-orm";
import { getDb } from "@/db";
import {
  actions,
  phoneAccessRequests,
  playerAccountCharacters,
  playerAccounts,
  playerSessions,
} from "@/db/schema";

export async function claimPendingActions(campaignId: string) {
  const db = getDb();
  const pending = await db
    .select({
      id: actions.id,
      actorUuid: actions.actorUuid,
      kind: actions.kind,
      payloadJson: actions.payloadJson,
      createdAt: actions.createdAt,
      requestedByFoundryUserId: playerAccounts.foundryUserId,
    })
    .from(actions)
    .leftJoin(playerSessions, eq(actions.sessionId, playerSessions.id))
    .leftJoin(playerAccounts, eq(playerSessions.accountId, playerAccounts.id))
    .where(and(eq(actions.campaignId, campaignId), eq(actions.status, "pending")))
    .orderBy(asc(actions.createdAt))
    .limit(20);

  for (const action of pending) {
    await db.update(actions).set({ status: "claimed" }).where(eq(actions.id, action.id));
  }

  return pending.map((action) => ({
    id: action.id,
    actorUuid: action.actorUuid,
    kind: action.kind,
    payload: JSON.parse(action.payloadJson),
    createdAt: action.createdAt,
    requestedByFoundryUserId: action.requestedByFoundryUserId || undefined,
  }));
}

export async function readPendingAccessRequests(campaignId: string) {
  const rows = await getDb()
    .select({
      id: phoneAccessRequests.id,
      playerLabel: playerAccounts.playerLabel,
      credentialHash: playerAccounts.credentialHash,
      actorUuid: playerAccountCharacters.actorUuid,
      createdAt: phoneAccessRequests.createdAt,
      expiresAt: phoneAccessRequests.expiresAt,
    })
    .from(phoneAccessRequests)
    .innerJoin(playerAccounts, eq(phoneAccessRequests.accountId, playerAccounts.id))
    .innerJoin(playerAccountCharacters, eq(playerAccountCharacters.accountId, playerAccounts.id))
    .where(and(
      eq(phoneAccessRequests.campaignId, campaignId),
      eq(phoneAccessRequests.status, "pending"),
      gt(phoneAccessRequests.expiresAt, Date.now()),
    ));

  return Array.from(rows.reduce((entries, row) => {
    const current = entries.get(row.id) || {
      id: row.id,
      playerLabel: row.playerLabel,
      kind: row.credentialHash ? "password-reset" as const : "first-time" as const,
      characterCount: 0,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
    };
    current.characterCount += 1;
    entries.set(row.id, current);
    return entries;
  }, new Map<string, {
    id: string;
    playerLabel: string;
    kind: "first-time" | "password-reset";
    characterCount: number;
    createdAt: number;
    expiresAt: number;
  }>()).values());
}
