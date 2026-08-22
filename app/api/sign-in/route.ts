import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { campaigns, playerAccounts, tenants } from "@/db/schema";
import { isBridgeOnline } from "@/lib/bridge-presence";
import { hasProductAccess } from "@/lib/entitlements";
import { createPlayerAccountSession } from "@/lib/player-account";
import type { Edition, SubscriptionStatus } from "@/lib/protocol";
import { jsonError } from "@/lib/server-auth";
import { verifyPassword } from "@/lib/security";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { accountId?: string; password?: string } | null;
  if (!body?.accountId || !body.password) return jsonError("Enter your Pocket Chronicle password.", 400);

  const db = getDb();
  const [account] = await db
    .select({
      accountId: playerAccounts.id,
      playerLabel: playerAccounts.playerLabel,
      credentialHash: playerAccounts.credentialHash,
      active: playerAccounts.active,
      campaignId: campaigns.id,
      campaignName: campaigns.name,
      campaignStatus: campaigns.status,
      lastSeenAt: campaigns.lastSeenAt,
      edition: tenants.edition,
      subscriptionStatus: tenants.subscriptionStatus,
    })
    .from(playerAccounts)
    .innerJoin(campaigns, eq(playerAccounts.campaignId, campaigns.id))
    .innerJoin(tenants, eq(campaigns.tenantId, tenants.id))
    .where(and(eq(playerAccounts.id, body.accountId), eq(playerAccounts.active, true)))
    .limit(1);

  const entitled = account && hasProductAccess(account.edition as Edition, account.subscriptionStatus as SubscriptionStatus);
  if (!account || !entitled || account.campaignStatus !== "active" || !account.credentialHash) {
    return jsonError("That Pocket Chronicle account could not be signed in.", 401);
  }
  if (!isBridgeOnline(account.lastSeenAt)) return jsonError("The Foundry module is offline.", 503);
  if (!(await verifyPassword(body.password, account.credentialHash))) return jsonError("That password is incorrect.", 401);

  const session = await createPlayerAccountSession(account.accountId, account.campaignId);
  if (!session) return jsonError("That Foundry account does not currently own any characters.", 409);
  return Response.json({
    ok: true,
    account: { id: account.accountId, playerLabel: account.playerLabel, campaignName: account.campaignName },
  }, { headers: { "set-cookie": session.cookie } });
}
