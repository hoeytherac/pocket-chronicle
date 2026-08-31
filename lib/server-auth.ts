import { and, eq, gt } from "drizzle-orm";
import { campaigns, playerSessions, tenants } from "@/db/schema";
import { getDb } from "@/db";
import { hasCampaignProductAccess } from "./entitlements";
import type { Edition, ProductTier, SubscriptionStatus } from "./protocol";
import { bearerToken, readCookie, sha256 } from "./security";

export async function requireBridge(request: Request) {
  const campaignId = request.headers.get("x-pocket-campaign")?.trim();
  const token = bearerToken(request);
  if (!campaignId || !token) return null;

  const tokenHash = await sha256(token);
  const db = getDb();
  const [result] = await db
    .select({
      campaignId: campaigns.id,
      campaignName: campaigns.name,
      campaignStatus: campaigns.status,
      worldState: campaigns.worldState,
      activeUntil: campaigns.activeUntil,
      lastSeenAt: campaigns.lastSeenAt,
      bridgeKeyHash: campaigns.bridgeKeyHash,
      tenantId: tenants.id,
      edition: tenants.edition,
      subscriptionStatus: tenants.subscriptionStatus,
      productTier: tenants.productTier,
      playerLimit: tenants.playerLimit,
    })
    .from(campaigns)
    .innerJoin(tenants, eq(campaigns.tenantId, tenants.id))
    .where(eq(campaigns.id, campaignId))
    .limit(1);

  if (!result || result.bridgeKeyHash !== tokenHash || result.campaignStatus !== "active") return null;
  if (!hasCampaignProductAccess(result.campaignId, result.edition as Edition, result.subscriptionStatus as SubscriptionStatus, result.productTier as ProductTier)) return null;
  return result;
}

export async function requirePlayerSession(request: Request) {
  const token = readCookie(request, "pc_session");
  if (!token) return null;

  const tokenHash = await sha256(token);
  const db = getDb();
  const [result] = await db
    .select({
      sessionId: playerSessions.id,
      actorUuid: playerSessions.actorUuid,
      accountId: playerSessions.accountId,
      campaignId: campaigns.id,
      lastSeenAt: campaigns.lastSeenAt,
      worldState: campaigns.worldState,
      activeUntil: campaigns.activeUntil,
      tenantId: tenants.id,
      edition: tenants.edition,
      subscriptionStatus: tenants.subscriptionStatus,
      productTier: tenants.productTier,
    })
    .from(playerSessions)
    .innerJoin(campaigns, eq(playerSessions.campaignId, campaigns.id))
    .innerJoin(tenants, eq(campaigns.tenantId, tenants.id))
    .where(and(eq(playerSessions.tokenHash, tokenHash), gt(playerSessions.expiresAt, Date.now())))
    .limit(1);

  if (!result) return null;
  if (!hasCampaignProductAccess(result.campaignId, result.edition as Edition, result.subscriptionStatus as SubscriptionStatus, result.productTier as ProductTier)) return null;
  return result;
}

export function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}
