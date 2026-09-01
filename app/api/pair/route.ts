import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { accountPairingCodes, campaigns, pairingCodes, playerAccounts, playerSessions, tenants } from "@/db/schema";
import { isBridgeOnline } from "@/lib/bridge-presence";
import { hasCampaignProductAccess } from "@/lib/entitlements";
import { createPlayerAccountSession, PLAYER_SESSION_SECONDS } from "@/lib/player-account";
import type { Edition, ProductTier, SubscriptionStatus } from "@/lib/protocol";
import { jsonError } from "@/lib/server-auth";
import { hashPassword, randomToken, sessionCookie, sha256, verifyPassword } from "@/lib/security";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { code?: string; password?: string } | null;
  const code = body?.code?.replace(/[^a-z0-9]/gi, "").toUpperCase();
  const password = body?.password;
  if (!code || code.length !== 6) return jsonError("Enter the six-character pairing code from your GM.", 400);

  const db = getDb();
  const codeHash = await sha256(code);
  const [accountPairing] = await db
    .select({
      pairingId: accountPairingCodes.id,
      accountId: playerAccounts.id,
      playerLabel: playerAccounts.playerLabel,
      credentialHash: playerAccounts.credentialHash,
      accountActive: playerAccounts.active,
      campaignId: campaigns.id,
      campaignName: campaigns.name,
      campaignStatus: campaigns.status,
      lastSeenAt: campaigns.lastSeenAt,
      edition: tenants.edition,
      subscriptionStatus: tenants.subscriptionStatus,
      productTier: tenants.productTier,
    })
    .from(accountPairingCodes)
    .innerJoin(playerAccounts, eq(accountPairingCodes.accountId, playerAccounts.id))
    .innerJoin(campaigns, eq(accountPairingCodes.campaignId, campaigns.id))
    .innerJoin(tenants, eq(campaigns.tenantId, tenants.id))
    .where(and(
      eq(accountPairingCodes.codeHash, codeHash),
      gt(accountPairingCodes.expiresAt, Date.now()),
      isNull(accountPairingCodes.consumedAt),
    ))
    .limit(1);

  if (accountPairing) {
    const entitled = hasCampaignProductAccess(accountPairing.campaignId, accountPairing.edition as Edition, accountPairing.subscriptionStatus as SubscriptionStatus, accountPairing.productTier as ProductTier);
    if (!accountPairing.accountActive || !entitled || accountPairing.campaignStatus !== "active") {
      return jsonError("That Pocket Chronicle account is not currently available.", 403);
    }
    if (!isBridgeOnline(accountPairing.lastSeenAt)) {
      return jsonError("That Foundry module is offline. Ask the GM to open the world and enable Pocket Chronicle.", 503);
    }

    if (!password) {
      return Response.json({
        challenge: true,
        playerLabel: accountPairing.playerLabel,
        campaignName: accountPairing.campaignName,
        needsPasswordSetup: !accountPairing.credentialHash,
      });
    }
    if (password.length < 8 || password.length > 128) {
      return jsonError("Use a private Pocket Chronicle password with at least eight characters.", 400);
    }
    if (accountPairing.credentialHash) {
      if (!(await verifyPassword(password, accountPairing.credentialHash))) {
        return jsonError("That Pocket Chronicle password is incorrect.", 401);
      }
    } else {
      await db.update(playerAccounts)
        .set({ credentialHash: await hashPassword(password), updatedAt: Date.now() })
        .where(eq(playerAccounts.id, accountPairing.accountId));
    }

    const session = await createPlayerAccountSession(accountPairing.accountId, accountPairing.campaignId);
    if (!session) return jsonError("That Foundry account does not currently own any characters.", 409);
    await db.update(accountPairingCodes).set({ consumedAt: Date.now() }).where(eq(accountPairingCodes.id, accountPairing.pairingId));
    return Response.json({
      ok: true,
      account: {
        id: accountPairing.accountId,
        playerLabel: accountPairing.playerLabel,
        campaignName: accountPairing.campaignName,
      },
    }, { headers: { "set-cookie": session.cookie } });
  }

  const [pairing] = await db
    .select()
    .from(pairingCodes)
    .where(and(eq(pairingCodes.codeHash, codeHash), gt(pairingCodes.expiresAt, Date.now()), isNull(pairingCodes.consumedAt)))
    .limit(1);

  if (!pairing) return jsonError("That pairing code is invalid or has expired.", 404);

  const [campaign] = await db
    .select({ lastSeenAt: campaigns.lastSeenAt, status: campaigns.status })
    .from(campaigns)
    .where(eq(campaigns.id, pairing.campaignId))
    .limit(1);
  if (!campaign || campaign.status !== "active" || !isBridgeOnline(campaign.lastSeenAt)) {
    return jsonError("That Foundry module is offline. Ask the GM to open the world and enable Pocket Chronicle.", 503);
  }

  const now = Date.now();
  const token = randomToken();
  const sessionId = crypto.randomUUID();
  await db.insert(playerSessions).values({
    id: sessionId,
    campaignId: pairing.campaignId,
    actorUuid: pairing.actorUuid,
    tokenHash: await sha256(token),
    createdAt: now,
    expiresAt: now + PLAYER_SESSION_SECONDS * 1000,
  });
  await db.update(pairingCodes).set({ consumedAt: now }).where(eq(pairingCodes.id, pairing.id));

  return Response.json(
    { ok: true, playerLabel: pairing.playerLabel },
    { headers: { "set-cookie": sessionCookie(token, PLAYER_SESSION_SECONDS) } },
  );
}
