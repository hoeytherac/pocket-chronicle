import type { Edition, SubscriptionStatus } from "./protocol";

export function hasProductAccess(edition: Edition, status: SubscriptionStatus) {
  if (edition === "personal") return status === "personal";
  return status === "trialing" || status === "active";
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
