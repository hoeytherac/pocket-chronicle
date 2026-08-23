# Pocket Chronicle

Pocket Chronicle is an installable phone companion for Foundry VTT. It gives players the table tools they actually need—character actions, shared journals, chat, dice, and a GM-curated shop—without loading Foundry's Scene canvas or desktop interface.

The old in-browser phone panel has been removed from the main branch. Its releases remain preserved in Git history. The only Foundry-side component now is a small, GM-controlled bridge that moves approved data between Foundry and the standalone app.

## Product shape

One codebase supports two editions:

- **Personal:** a self-hosted edition for one DM. Billing is bypassed intentionally.
- **Commercial:** a multi-DM edition with tenant isolation and subscription entitlements. A payment provider can be added through the billing boundary without mixing payment code into character data.

The current build includes the phone UI, installable PWA shell, permanent campaign-code access requests, GM phone approval, Foundry player-account sign-in, multi-character access, D1-backed campaign relay, action queue, Foundry bridge, and personal/commercial data boundaries. A customer account dashboard and live payment checkout are intentionally reserved for the commercial release phase.

## Player experience

- portrait-first phone layout with a clear blue, restrained fantasy style
- portrait and identity details for species, background, class, subclass, alignment, size, and languages
- character HP, abilities, saving throws, skills, initiative, inspiration, death saves, and level-up requests
- dedicated Spells tab grouped by cantrips and spell level, with live Foundry slot counts and a selectable casting slot
- separate Actions and Feats shelves with tap-to-read item details
- activity-aware local phone dice for abilities, skills, saves, initiative, spell attacks, scaled damage, healing, and death saves, with animated dice and device roll history
- separate positive-number controls for damage and healing, sent as one Foundry update
- spell activities expose their attack, save DC, damage, healing, activation, duration, and concentration details while intentionally omitting target and range
- chosen spell slots and limited-use charges are spent on the authoritative Foundry character sheet without a Foundry-authored roll card
- app-native dice are the primary roll display, with optional Dice So Nice mirroring in Foundry through its official no-chat API
- D&D 5e damage now uses the system HP handler so temporary HP is spent first and healing restores current HP correctly
- GM-shared journal entries and images
- table chat plus local d4/d6/d8/d10/d12/d20 rolls
- GM-curated shop requests
- installable from Safari or Chrome using the phone's home-screen flow
- no Scene canvas, map rendering, or Foundry desktop controls
- locked connection screen whenever the paired Foundry module is offline

There is no unconnected demo mode. A player can enter the app only while an authenticated Pocket Chronicle module is active in Foundry.

## Local development

Requires Node.js 22.13 or newer.

```text
npm install
npm run db:generate
npm run dev
```

The local app opens at `http://localhost:3000`. The D1 binding is declared as `DB` in `.openai/hosting.json`.

## Cloudflare deployment

The personal deployment is live at:

`https://pocket-chronicle.colesen.workers.dev`

Pocket Chronicle uses Cloudflare Workers rather than static Pages because its pairing, relay API, and D1 database all require server-side code. The free `workers.dev` address does not require a purchased domain.

After authenticating Wrangler and creating the D1 database named `pocket-chronicle`, deploy updates with:

```text
npm run db:migrate:cloudflare
npm run deploy:cloudflare
```

The direct Cloudflare settings live in `wrangler.cloudflare.jsonc`. Personal Foundry connection values belong only in the ignored `.pocket-chronicle.local.json`; never commit the bridge key.

## Connect a personal Foundry campaign

1. Deploy the app and configure a long `POCKET_BOOTSTRAP_TOKEN` server secret.
2. Apply the generated migration in `drizzle/` to the site's D1 database.
3. Call `POST /api/admin/bootstrap` once with the secret to create your tenant and campaign. Save the returned bridge key; it is shown only once.
4. Install the module using `https://raw.githubusercontent.com/hoeytherac/pocket-chronicle/main/foundry/pocket-chronicle-bridge/module.json`, then enter the app address, campaign ID, and bridge key in Foundry's Module Settings.
5. Under **Game Settings → Configure Settings → Pocket Chronicle Bridge**, choose a permanent six-character **Campaign code** using letters and numbers, enable the bridge, save, and reload the world as the active GM.
6. The player opens the app, enters the Campaign ID and Campaign code, and selects their existing Foundry user.
7. Foundry shows the active GM an approval prompt. After approval, the player creates a separate Pocket Chronicle password for future sign-ins. The account automatically receives every character it owns in Foundry. Foundry passwords are never requested, copied, or stored.

For a forgotten password, the player taps **Forgot or reset this password** and re-enters the Campaign ID and Campaign code. The GM clicks **Check Requests / Resets** in the Pocket Chronicle Bridge settings and approves the named player. The phone then prompts for a new password, and older Pocket Chronicle sessions for that player are signed out.

The bridge and every approval prompt use Foundry documents directly. They do not render or depend on the Scene canvas, so the canvas may remain disabled.

To share content, use the bridge API from a GM macro:

```js
await game.modules.get("pocket-chronicle-bridge").api.shareJournal("JournalEntry.YOUR_UUID");
await game.modules.get("pocket-chronicle-bridge").api.shareShopItem("Item.YOUR_UUID");
```

The module sends a heartbeat every ten seconds. The phone interface locks after thirty seconds without an authenticated heartbeat. Each DM can use the same module with their own Foundry HTTPS address and unique campaign credentials; the hosted app never logs into or pulls directly from their server.

## Repository map

- `app/` — installable phone interface and relay API
- `db/` and `drizzle/` — tenant, campaign, session, snapshot, and action storage
- `foundry/pocket-chronicle-bridge/` — lightweight Foundry bridge
- `lib/` — shared protocol, security, and edition boundaries
- `docs/` — architecture, privacy, and commercialization notes

See [Architecture](docs/ARCHITECTURE.md), [Security](docs/SECURITY.md), and [Commercial Edition](docs/COMMERCIAL-EDITION.md) before operating this for players outside your own campaign.
