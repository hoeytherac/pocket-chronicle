import { and, eq, gt } from "drizzle-orm";
import { getDb } from "@/db";
import { campaigns, phoneAccessRequests, playerAccounts, playerSessions, tenants } from "@/db/schema";
import { isBridgeOnline } from "@/lib/bridge-presence";
import { hasCampaignProductAccess } from "@/lib/entitlements";
import { createPlayerAccountSession } from "@/lib/player-account";
import type { Edition, ProductTier, SubscriptionStatus } from "@/lib/protocol";
import { jsonError } from "@/lib/server-auth";
import { hashPassword, sha256 } from "@/lib/security";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as { requestToken?: string; password?: string } | null;
  if (!body?.requestToken || !body.password) return jsonError("Create an account password to finish the first setup.", 400);
  if (body.password.length < 6 || body.password.length > 128) return jsonError("Use an account password with at least six characters.", 400);

  const db = getDb();
  const [accessRequest] = await db
    .select({
      requestId: phoneAccessRequests.id,
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
    .from(phoneAccessRequests)
    .innerJoin(playerAccounts, eq(phoneAccessRequests.accountId, playerAccounts.id))
    .innerJoin(campaigns, eq(phoneAccessRequests.campaignId, campaigns.id))
    .innerJoin(tenants, eq(campaigns.tenantId, tenants.id))
    .where(and(
      eq(phoneAccessRequests.id, id),
      eq(phoneAccessRequests.requestTokenHash, await sha256(body.requestToken)),
      eq(phoneAccessRequests.status, "approved"),
      gt(phoneAccessRequests.expiresAt, Date.now()),
    ))
    .limit(1);

  const entitled = accessRequest && hasCampaignProductAccess(accessRequest.campaignId, accessRequest.edition as Edition, accessRequest.subscriptionStatus as SubscriptionStatus, accessRequest.productTier as ProductTier);
  if (!accessRequest || !entitled || !accessRequest.accountActive || accessRequest.campaignStatus !== "active") {
    return jsonError("That approved phone request is no longer available.", 403);
  }
  if (!isBridgeOnline(accessRequest.lastSeenAt)) return jsonError("That Foundry world is offline.", 503);
  const passwordWasReset = Boolean(accessRequest.credentialHash);

  if (passwordWasReset) {
    await db.delete(playerSessions).where(eq(playerSessions.accountId, accessRequest.accountId));
  }

  await db.update(playerAccounts).set({ credentialHash: await hashPassword(body.password), updatedAt: Date.now() })
    .where(eq(playerAccounts.id, accessRequest.accountId));

  const session = await createPlayerAccountSession(accessRequest.accountId, accessRequest.campaignId);
  if (!session) return jsonError("That Foundry account does not currently own any characters.", 409);
  await db.update(phoneAccessRequests).set({ status: "consumed", consumedAt: Date.now() })
    .where(eq(phoneAccessRequests.id, accessRequest.requestId));

  return Response.json({
    ok: true,
    passwordWasReset,
    account: { id: accessRequest.accountId, playerLabel: accessRequest.playerLabel, campaignName: accessRequest.campaignName },
  }, { headers: { "set-cookie": session.cookie } });
}
