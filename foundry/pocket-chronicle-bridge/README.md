# Pocket Chronicle Bridge

This is not a mobile Foundry interface. It is a small active-GM bridge for the standalone Pocket Chronicle phone app. It never renders the Scene canvas.

Install with this Foundry manifest URL:

```text
https://raw.githubusercontent.com/hoeytherac/pocket-chronicle/main/foundry/pocket-chronicle-bridge/module.json
```

Then set the app address, campaign ID, bridge key, and **Enable Pocket Chronicle bridge** under Foundry's Module Settings. Only the first active GM connects. The module sends an authenticated heartbeat; if it stops, the phone website locks automatically.

After saving and reloading, return to the module settings and click **Pair a Phone**. Choose an existing Foundry player account. Pocket Chronicle creates a ten-minute account code and automatically includes every character for which that user has Owner permission. The player creates a separate Pocket Chronicle password on first connection; the bridge never reads or transmits Foundry passwords.

Every DM uses their own campaign ID and private bridge key. The bridge pushes a sanitized allowlist to Pocket Chronicle over HTTPS—the hosted app never needs the Foundry server address, administrator password, or direct inbound access.

Create a ten-minute pairing code from a GM macro:

```js
await game.modules.get("pocket-chronicle-bridge").api.createPairing(
  "Actor.YOUR_CHARACTER_UUID",
  "Player name"
);
```

Share a journal or shop item:

```js
await game.modules.get("pocket-chronicle-bridge").api.shareJournal("JournalEntry.YOUR_UUID");
await game.modules.get("pocket-chronicle-bridge").api.shareShopItem("Item.YOUR_UUID");
```

Run either command again with `false` as the second argument to stop sharing that document.
