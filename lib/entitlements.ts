import type { Edition, ProductTier, SubscriptionStatus } from "./protocol";

// These are Cole's owner worlds. They must never lose Pocket Chronicle access
// because a commercial Patreon entitlement is paused, canceled, or unavailable.
export const OWNER_CAMPAIGN_IDS = new Set(["grand-blooming", "exodusters"]);

export function isOwnerCampaign(campaignId: string) {
  return OWNER_CAMPAIGN_IDS.has(String(campaignId || "").trim().toLowerCase());
}

export function hasProductAccess(edition: Edition, status: SubscriptionStatus, productTier: ProductTier) {
  if (edition === "personal") return status === "personal";
  return productTier === "keeper" && (status === "trialing" || status === "active");
}

export function hasCampaignProductAccess(campaignId: string, edition: Edition, status: SubscriptionStatus, productTier: ProductTier) {
  return isOwnerCampaign(campaignId) || hasProductAccess(edition, status, productTier);
}

export interface BillingProvider {
  createCheckout(input: { tenantId: string; returnUrl: string }): Promise<{ url: string }>;
  readSubscription(tenantId: string): Promise<SubscriptionStatus>;
}

// Commercial billing plugs into this boundary later. Character and campaign data
// never depends on a specific payment provider.
export function billingNotConfigured(): BillingProvider {
  return {
    async createCheckout() {
      throw new Error("Commercial billing is not configured for this deployment.");
    },
    async readSubscription() {
      return "canceled";
    },
  };
}
