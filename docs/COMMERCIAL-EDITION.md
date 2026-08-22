# Commercial edition plan

Pocket Chronicle uses one product codebase. Personal and commercial deployments differ through tenant configuration and entitlements, not source-code forks.

## Already built into the foundation

- tenant-owned campaigns
- `personal` and `commercial` editions
- `personal`, `trialing`, `active`, `past_due`, and `canceled` subscription states
- a provider-neutral billing interface
- campaign-scoped bridge keys
- player pairing that does not depend on a specific storefront

Personal tenants are entitled by the `personal` state. Commercial tenants are entitled only while `trialing` or `active`.

## Required before taking payment

1. DM account and organization sign-in
2. hosted checkout and customer portal from a supported payment provider
3. verified billing webhooks that update tenant entitlements
4. campaign creation, deletion, bridge-key rotation, and member management dashboard
5. plan limits, usage metering, invoices, tax handling, cancellation, and data export
6. support, privacy, terms, and operational monitoring

Billing should update only tenant entitlements. It must never read, rewrite, or delete character snapshots directly.

## Packaging recommendation

- **Personal license:** one self-hosted deployment, no billing service required.
- **Hosted Storykeeper plan:** several campaigns, managed updates, player pairing, shared media, and support.
- **Studio plan:** multiple DMs, organization roles, higher storage, custom branding, and audit history.

Exact pricing should be chosen only after testing real hosting, support, media-storage, and Foundry-version maintenance costs.
