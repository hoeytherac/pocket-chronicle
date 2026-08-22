import { and, eq, gt } from "drizzle-orm";
import { getDb } from "@/db";
import { phoneAccessRequests, playerAccountCharacters, playerAccounts } from "@/db/schema";
import { jsonError, requireBridge } from "@/lib/server-auth";

export async function GET(request: Request) {
  const bridge = await requireBridge(request);
  if (!bridge) return jsonError("Bridge authentication failed.", 401);

  const db = getDb();
  const rows = await db
    .select({
      id: phoneAccessRequests.id,
      accountId: phoneAccessRequests.accountId,
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
      eq(phoneAccessRequests.campaignId, bridge.campaignId),
      eq(phoneAccessRequests.status, "pending"),
      gt(phoneAccessRequests.expiresAt, Date.now()),
    ));

  const requests = Array.from(rows.reduce((entries, row) => {
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
  }, new Map<string, { id: string; playerLabel: string; kind: "first-time" | "password-reset"; characterCount: number; createdAt: number; expiresAt: number }>()).values());

  return Response.json({ requests });
}
