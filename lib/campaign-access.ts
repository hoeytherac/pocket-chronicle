import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { campaigns, tenants } from "@/db/schema";
import { hasProductAccess } from "@/lib/entitlements";
import type { Edition, SubscriptionStatus } from "@/lib/protocol";
import { verifyPassword } from "@/lib/security";

export async function authenticateCampaignAccess(campaignId: string, password: string) {
  const normalizedCampaignId = campaignId.trim().slice(0, 100);
  if (!normalizedCampaignId || password.length < 8 || password.length > 128) return null;

  const [campaign] = await getDb()
    .select({
      id: campaigns.id,
      name: campaigns.name,
      status: campaigns.status,
      lastSeenAt: campaigns.lastSeenAt,
      pairingPasswordHash: campaigns.pairingPasswordHash,
      edition: tenants.edition,
      subscriptionStatus: tenants.subscriptionStatus,
    })
    .from(campaigns)
    .innerJoin(tenants, eq(campaigns.tenantId, tenants.id))
    .where(eq(campaigns.id, normalizedCampaignId))
    .limit(1);

  if (!campaign || campaign.status !== "active" || !campaign.pairingPasswordHash) return null;
  if (!hasProductAccess(campaign.edition as Edition, campaign.subscriptionStatus as SubscriptionStatus)) return null;
  if (!(await verifyPassword(password, campaign.pairingPasswordHash))) return null;
  return campaign;
}
