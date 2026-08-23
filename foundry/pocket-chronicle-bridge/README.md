# Pocket Chronicle Bridge

This is not a mobile Foundry interface. It is a small active-GM bridge for the standalone Pocket Chronicle phone app. It never renders the Scene canvas.

Install with this Foundry manifest URL:

```text
https://raw.githubusercontent.com/hoeytherac/pocket-chronicle/main/foundry/pocket-chronicle-bridge/module.json
```

Then set the app address, campaign ID, a permanent six-character Campaign code, and bridge key under Foundry's Module Settings. Any signed-in GM browser can keep the bridge connected. The module sends an authenticated heartbeat; if it stops, the phone website locks automatically.

**Use map-free mode on this browser** is enabled by default. It uses Foundry's official no-canvas setting and does not prevent characters, journals, chat, dice, or shops from syncing.

After saving and reloading, players enter the Campaign ID and the same permanent six-character Campaign code in the phone app, then select their existing Foundry account. The active GM receives an approve-or-deny prompt in Foundry. Once approved, the player creates a separate Pocket Chronicle password and automatically receives every character for which that Foundry user has Owner permission. The bridge never reads or transmits Foundry passwords.

If a player forgets that separate password, they can tap **Forgot or reset this password** on the phone. In Foundry, open the module settings and click **Check Requests / Resets**, confirm the player, and choose **Approve Reset**. Their phone then asks them to create a new password and signs older Pocket Chronicle sessions for that account out.

The bridge does not depend on the Scene canvas. Phone requests, approvals, character data, journals, chat, and actions continue to work when the canvas is disabled.

Version 0.11 exports the full modern D&D 5e activity and item surface, including activity uses, item uses, native consumption targets, spell slots, and local formulas. It uses D&D 5e's native activity-consumption path without launching Midi-QOL, CPR, or CAT target workflows. Ability, skill, save, initiative, attack, damage, death-save, and loose-die rolls remain local to the signed-in player's phone; Dice So Nice may mirror the exact result in Foundry without a chat card. Phone HP edits update temporary/current HP directly and do not initiate Midi-QOL concentration checks.

Every DM uses their own campaign ID and private bridge key. The bridge pushes a sanitized allowlist to Pocket Chronicle over HTTPS—the hosted app never needs the Foundry server address, administrator password, or direct inbound access.

Share a journal or shop item:

```js
await game.modules.get("pocket-chronicle-bridge").api.shareJournal("JournalEntry.YOUR_UUID");
await game.modules.get("pocket-chronicle-bridge").api.shareShopItem("Item.YOUR_UUID");
```

Run either command again with `false` as the second argument to stop sharing that document.
