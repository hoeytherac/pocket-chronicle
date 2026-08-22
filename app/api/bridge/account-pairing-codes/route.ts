import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accountPairingCodes, playerAccountCharacters, playerAccounts } from "@/db/schema";
import { jsonError, requireBridge } from "@/lib/server-auth";
import { randomPairingCode, sha256 } from "@/lib/security";

export async function POST(request: Request) {
  const bridge = await requireBridge(request);
  if (!bridge) return jsonError("Bridge authentication failed.", 401);

  const body = await request.json().catch(() => null) as {
    foundryUserId?: string;
    playerLabel?: string;
    actorUuids?: string[];
  } | null;
  const actorUuids = Array.from(new Set((body?.actorUuids || []).filter((uuid) => /^Actor\.[A-Za-z0-9]+$/.test(uuid)))).slice(0, 50);
  if (!body?.foundryUserId || !body.playerLabel || actorUuids.length === 0) {
    return jsonError("Choose a Foundry player account that owns at least one character.", 400);
  }

  const db = getDb();
  const now = Date.now();
  const [existing] = await db
    .select({ id: playerAccounts.id })
    .from(playerAccounts)
    .where(and(
      eq(playerAccounts.campaignId, bridge.campaignId),
      eq(playerAccounts.foundryUserId, body.foundryUserId.slice(0, 100)),
    ))
    .limit(1);

  const accountId = existing?.id || crypto.randomUUID();
  if (existing) {
    await db.update(playerAccounts).set({
      playerLabel: body.playerLabel.slice(0, 80),
      active: true,
      updatedAt: now,
    }).where(eq(playerAccounts.id, accountId));
  } else {
    await db.insert(playerAccounts).values({
      id: accountId,
      campaignId: bridge.campaignId,
      foundryUserId: body.foundryUserId.slice(0, 100),
      playerLabel: body.playerLabel.slice(0, 80),
      active: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  await db.delete(playerAccountCharacters).where(eq(playerAccountCharacters.accountId, accountId));
  await db.insert(playerAccountCharacters).values(actorUuids.map((actorUuid) => ({
    id: crypto.randomUUID(),
    accountId,
    campaignId: bridge.campaignId,
    actorUuid,
    updatedAt: now,
  })));

  const code = randomPairingCode();
  await db.insert(accountPairingCodes).values({
    id: crypto.randomUUID(),
    campaignId: bridge.campaignId,
    accountId,
    codeHash: await sha256(code),
    createdAt: now,
    expiresAt: now + 10 * 60 * 1000,
  });

  return Response.json({
    code,
    playerLabel: body.playerLabel.slice(0, 80),
    characterCount: actorUuids.length,
    expiresInSeconds: 600,
  });
}
