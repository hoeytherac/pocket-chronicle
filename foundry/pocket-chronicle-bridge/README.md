# Pocket Chronicle Bridge

This is not a mobile Foundry interface. It is a small active-GM bridge for the standalone Pocket Chronicle phone app. It never renders the Scene canvas.

After installing it, set the app address, campaign ID, bridge key, and **Enable Pocket Chronicle bridge** under Foundry's Module Settings. Only the first active GM connects.

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
