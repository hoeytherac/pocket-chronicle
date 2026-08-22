import { and, eq, gt } from "drizzle-orm";
import { campaigns, playerSessions, tenants } from "@/db/schema";
import { getDb } from "@/db";
import { hasProductAccess } from "./entitlements";
import type { Edition, SubscriptionStatus } from "./protocol";
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
      bridgeKeyHash: campaigns.bridgeKeyHash,
      tenantId: tenants.id,
      edition: tenants.edition,
      subscriptionStatus: tenants.subscriptionStatus,
    })
    .from(campaigns)
    .innerJoin(tenants, eq(campaigns.tenantId, tenants.id))
    .where(eq(campaigns.id, campaignId))
    .limit(1);

  if (!result || result.bridgeKeyHash !== tokenHash || result.campaignStatus !== "active") return null;
  if (!hasProductAccess(result.edition as Edition, result.subscriptionStatus as SubscriptionStatus)) return null;
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
      campaignId: campaigns.id,
      tenantId: tenants.id,
      edition: tenants.edition,
      subscriptionStatus: tenants.subscriptionStatus,
    })
    .from(playerSessions)
    .innerJoin(campaigns, eq(playerSessions.campaignId, campaigns.id))
    .innerJoin(tenants, eq(campaigns.tenantId, tenants.id))
    .where(and(eq(playerSessions.tokenHash, tokenHash), gt(playerSessions.expiresAt, Date.now())))
    .limit(1);

  if (!result) return null;
  if (!hasProductAccess(result.edition as Edition, result.subscriptionStatus as SubscriptionStatus)) return null;
  return result;
}

export function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}
