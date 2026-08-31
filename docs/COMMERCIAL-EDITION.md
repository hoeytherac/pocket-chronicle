# Commercial edition plan

Pocket Chronicle uses one product codebase. Personal and commercial deployments differ through tenant configuration and entitlements, not source-code forks.

## Already built into the foundation

- tenant-owned campaigns
- `personal` and `commercial` editions
- `personal`, `trialing`, `active`, `past_due`, and `canceled` subscription states
- `owner`, `supporter`, and `keeper` product tiers
- one-world/eight-player defaults for hosted Keeper accounts
- a provider-neutral billing interface
- campaign-scoped bridge keys
- player pairing that does not depend on a specific storefront

Personal tenants are entitled by the `personal` state. Commercial tenants need the `keeper` product tier and must be `trialing` or `active`.

The owner campaigns `grand-blooming` and `exodusters` are permanently exempt from storefront subscription checks and hosted seat limits. Their campaign status and private bridge credentials still protect access.

## Required before taking payment

1. DM account and organization sign-in
2. hosted checkout and customer portal from a supported payment provider
3. verified billing webhooks that update tenant entitlements
4. campaign creation, deletion, bridge-key rotation, and member management dashboard
5. verified Patreon-to-tenant provisioning, invoices, tax handling, cancellation, and data export
6. support, privacy, terms, and operational monitoring

Billing should update only tenant entitlements. It must never read, rewrite, or delete character snapshots directly.

## Packaging recommendation

- **Free follower:** public announcements and previews; no hosted Pocket Chronicle world.
- **Supporter ($5):** creative posts, D&D releases, chapters, development notes, and polls; no hosted Pocket Chronicle world.
- **Chronicle Keeper ($10):** Pocket Chronicle app and Bridge access for one active Foundry world and up to eight player accounts, plus Supporter benefits.

Exact pricing should be chosen only after testing real hosting, support, media-storage, and Foundry-version maintenance costs.
