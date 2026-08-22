# Pocket Chronicle

Pocket Chronicle is an installable phone companion for Foundry VTT. It gives players the table tools they actually need—character actions, shared journals, chat, dice, and a GM-curated shop—without loading Foundry's Scene canvas or desktop interface.

The old in-browser phone panel has been removed from the main branch. Its releases remain preserved in Git history. The only Foundry-side component now is a small, GM-controlled bridge that moves approved data between Foundry and the standalone app.

## Product shape

One codebase supports two editions:

- **Personal:** a self-hosted edition for one DM. Billing is bypassed intentionally.
- **Commercial:** a multi-DM edition with tenant isolation and subscription entitlements. A payment provider can be added through the billing boundary without mixing payment code into character data.

The current build includes the phone UI, installable PWA shell, private pairing codes, D1-backed campaign relay, action queue, Foundry bridge, and personal/commercial data boundaries. A customer account dashboard and live payment checkout are intentionally reserved for the commercial release phase.

## Player experience

- portrait-first phone layout with a clear blue, restrained fantasy style
- character HP, ability scores, actions, spells, and level-up requests
- GM-shared journal entries and images
- table chat and d4/d6/d8/d10/d12/d20 rolls
- GM-curated shop requests
- installable from Safari or Chrome using the phone's home-screen flow
- no Scene canvas, map rendering, or Foundry desktop controls

Use pairing code `DEMO24` to explore the built-in preview without a running Foundry world.

## Local development

Requires Node.js 22.13 or newer.

```text
npm install
npm run db:generate
npm run dev
```

The local app opens at `http://localhost:3000`. The D1 binding is declared as `DB` in `.openai/hosting.json`.

## Connect a personal Foundry campaign

1. Deploy the app and configure a long `POCKET_BOOTSTRAP_TOKEN` server secret.
2. Apply the generated migration in `drizzle/` to the site's D1 database.
3. Call `POST /api/admin/bootstrap` once with the secret to create your tenant and campaign. Save the returned bridge key; it is shown only once.
4. Install `foundry/pocket-chronicle-bridge` in Foundry and enter the app address, campaign ID, and bridge key in Module Settings.
5. Enable the bridge and reload the world as the active GM.
6. From a GM macro, create a ten-minute player code:

```js
await game.modules.get("pocket-chronicle-bridge").api.createPairing(
  "Actor.xKNwG0YjGiFC4nOo",
  "Amara"
);
```

The player opens the app, chooses **Pair another campaign**, and enters the code. To share content, use the bridge API from a GM macro:

```js
await game.modules.get("pocket-chronicle-bridge").api.shareJournal("JournalEntry.YOUR_UUID");
await game.modules.get("pocket-chronicle-bridge").api.shareShopItem("Item.YOUR_UUID");
```

## Repository map

- `app/` — installable phone interface and relay API
- `db/` and `drizzle/` — tenant, campaign, session, snapshot, and action storage
- `foundry/pocket-chronicle-bridge/` — lightweight Foundry bridge
- `lib/` — shared protocol, security, and edition boundaries
- `docs/` — architecture, privacy, and commercialization notes

See [Architecture](docs/ARCHITECTURE.md), [Security](docs/SECURITY.md), and [Commercial Edition](docs/COMMERCIAL-EDITION.md) before operating this for players outside your own campaign.
