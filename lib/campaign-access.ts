import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { campaigns, tenants } from "@/db/schema";
import { hasProductAccess } from "@/lib/entitlements";
import type { Edition, SubscriptionStatus } from "@/lib/protocol";
import { normalizeCampaignCode, verifyPassword } from "@/lib/security";

export async function authenticateCampaignAccess(campaignId: string, code: string) {
  const normalizedCampaignId = campaignId.trim().slice(0, 100);
  const normalizedCode = normalizeCampaignCode(code);
  if (!normalizedCampaignId || !normalizedCode) return null;

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
  if (!(await verifyPassword(normalizedCode, campaign.pairingPasswordHash))) return null;
  return campaign;
}
