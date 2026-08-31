# Colesen Patreon launch draft

## Memberships

### Free — Follow the Chronicle

Public announcements, Pocket Chronicle release news, previews of D&D material and Foundry modules, and occasional creative updates from Colesen.

### $5 — The Raccoon Den

Everything in Free, plus:

- D&D resources and worldbuilding posts
- chapters and previews from Colesen's books
- behind-the-scenes development notes
- Foundry module previews and release notes
- community polls and early looks

This is the creative-support tier. It does not include a hosted Pocket Chronicle world.

### $10 — Chronicle Keeper

Everything in The Raccoon Den, plus:

- Pocket Chronicle app and Bridge module access
- one active Foundry world
- up to eight imported player accounts
- setup and update guides
- beta builds and priority Pocket Chronicle release notes

Start this tier with a 25-member beta limit. Raise the limit only after reviewing a full month of Cloudflare and support usage.

## Launch sequence

1. Keep the Patreon page unpublished while tiers, welcome copy, and policies are reviewed.
2. Create Free, $5, and $10 memberships using the copy above.
3. Cap Chronicle Keeper at 25 beta members.
4. Publish a Pocket Chronicle installation guide and a Foundry Bridge manifest link.
5. Provision each Keeper with a unique tenant, one campaign, one private bridge key, and an eight-player seat limit.
6. Never ask members to share bridge keys or Foundry passwords.
7. Use one codebase and tenant settings instead of separate personal and public forks.
8. Review Cloudflare request and D1 usage weekly during beta.
9. Permanently exempt `grand-blooming` and `exodusters` from subscription and hosted-seat enforcement.

## Cloudflare safeguards in v0.15.0

- one combined Foundry pulse replaces three repeating requests
- the normal active-world pulse is every 30 seconds, with a temporary 10-second response window only after activity
- an edited character pushes only that character instead of the full party
- sleeping worlds make no recurring bridge requests
- unchanged snapshots do not rewrite D1
- hosted Keeper tenants default to one campaign and eight players

At the 25-member beta cap, an always-open world would create about 72,000 quiet pulse requests per day across all members. Real use should be much lower because sleeping worlds stop polling. This leaves room under the Workers Free daily request allowance for player actions, sign-ins, and mobile refreshes, but usage should still be monitored before raising the cap.
