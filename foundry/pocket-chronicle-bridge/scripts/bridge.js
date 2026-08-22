/* global Hooks, game, ui, fromUuid, CONFIG, Roll, ChatMessage, foundry */
const MODULE_ID = "pocket-chronicle-bridge";
const SHOP_FLAG = "shop";
const SHARED_FLAG = "shared";

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "enabled", {
    name: "POCKET.Enable.Name", hint: "POCKET.Enable.Hint", scope: "world", config: true, type: Boolean, default: false,
  });
  game.settings.register(MODULE_ID, "relayUrl", {
    name: "POCKET.RelayUrl.Name", hint: "POCKET.RelayUrl.Hint", scope: "world", config: true, type: String, default: "",
  });
  game.settings.register(MODULE_ID, "campaignId", {
    name: "POCKET.CampaignId.Name", hint: "POCKET.CampaignId.Hint", scope: "world", config: true, type: String, default: "",
  });
  game.settings.register(MODULE_ID, "bridgeKey", {
    name: "POCKET.BridgeKey.Name", hint: "POCKET.BridgeKey.Hint", scope: "world", config: true, type: String, default: "",
  });
  game.settings.register(MODULE_ID, "pollMs", {
    name: "POCKET.PollMs.Name", hint: "POCKET.PollMs.Hint", scope: "world", config: true, type: Number, default: 2000, range: { min: 1000, max: 10000, step: 500 },
  });
});

Hooks.once("ready", () => {
  const moduleRecord = game.modules.get(MODULE_ID);
  moduleRecord.api = {
    createPairing,
    pushNow: pushAllSnapshots,
    shareJournal: async (uuid, shared = true) => {
      const journal = await fromUuid(uuid);
      if (!journal || journal.documentName !== "JournalEntry") throw new Error("Choose a Journal Entry.");
      await journal.setFlag(MODULE_ID, SHARED_FLAG, shared);
      await pushAllSnapshots();
      return shared;
    },
    shareShopItem: async (uuid, shared = true) => {
      const item = await fromUuid(uuid);
      if (!item || item.documentName !== "Item") throw new Error("Choose an Item.");
      await item.setFlag(MODULE_ID, SHOP_FLAG, shared);
      await pushAllSnapshots();
      return shared;
    },
  };

  if (!shouldRun()) return;
  startBridge();
});

Hooks.on("updateActor", () => scheduleSnapshot());
Hooks.on("updateItem", () => scheduleSnapshot());
Hooks.on("createChatMessage", () => scheduleSnapshot());
Hooks.on("updateJournalEntry", () => scheduleSnapshot());
Hooks.on("updateJournalEntryPage", () => scheduleSnapshot());

function shouldRun() {
  if (!game.user?.isGM || !game.settings.get(MODULE_ID, "enabled")) return false;
  const activeGms = game.users.filter((user) => user.active && user.isGM).sort((a, b) => a.id.localeCompare(b.id));
  return activeGms[0]?.id === game.user.id;
}

function config() {
  return {
    relayUrl: String(game.settings.get(MODULE_ID, "relayUrl") || "").replace(/\/$/, ""),
    campaignId: String(game.settings.get(MODULE_ID, "campaignId") || ""),
    bridgeKey: String(game.settings.get(MODULE_ID, "bridgeKey") || ""),
    pollMs: Math.max(1000, Number(game.settings.get(MODULE_ID, "pollMs")) || 2000),
  };
}

function startBridge() {
  const current = config();
  if (!current.relayUrl || !current.campaignId || !current.bridgeKey) {
    ui.notifications.warn("Pocket Chronicle Bridge needs its app address, campaign ID, and bridge key in Module Settings.");
    return;
  }
  sendHeartbeat(true);
  pushAllSnapshots();
  window.setInterval(sendHeartbeat, 10000);
  window.setInterval(pollActions, current.pollMs);
  window.setInterval(pushAllSnapshots, 30000);
  console.info(`${MODULE_ID} | Active GM bridge started`);
}

async function sendHeartbeat(announce = false) {
  try {
    await bridgeFetch("/api/bridge/heartbeat", { method: "POST", body: "{}" });
    if (announce) ui.notifications.info(`Pocket Chronicle connected to ${game.world.title}.`);
  } catch (error) {
    console.debug(`${MODULE_ID} | Heartbeat paused`, error);
  }
}

function headers() {
  const current = config();
  return {
    "authorization": `Bearer ${current.bridgeKey}`,
    "x-pocket-campaign": current.campaignId,
    "content-type": "application/json",
  };
}

async function bridgeFetch(path, options = {}) {
  const current = config();
  const response = await fetch(`${current.relayUrl}${path}`, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || `Pocket Chronicle returned ${response.status}.`);
  return response.json();
}

function scheduleSnapshot() {
  if (!shouldRun()) return;
  window.clearTimeout(scheduleSnapshot.pending);
  scheduleSnapshot.pending = window.setTimeout(pushAllSnapshots, 900);
}

async function pushAllSnapshots() {
  if (!shouldRun()) return;
  const actors = game.actors.filter((actor) => actor.type === "character" && hasPlayerOwner(actor));
  for (const actor of actors) {
    try {
      await bridgeFetch("/api/bridge/snapshot", { method: "POST", body: JSON.stringify(await buildSnapshot(actor)) });
    } catch (error) {
      console.warn(`${MODULE_ID} | Snapshot failed for ${actor.name}`, error);
    }
  }
}

function hasPlayerOwner(actor) {
  return game.users.some((user) => !user.isGM && Number(actor.ownership?.[user.id] || 0) >= 3);
}

function plainText(html = "") {
  const element = document.createElement("div");
  element.innerHTML = String(html);
  return (element.textContent || "").trim();
}

async function buildSnapshot(actor) {
  const system = actor.system || {};
  const classes = actor.items.filter((item) => item.type === "class");
  const level = classes.reduce((total, item) => total + Number(item.system?.levels || 0), Number(system.details?.level || 0));
  const abilities = Object.entries(system.abilities || {}).map(([key, ability]) => ({
    key,
    label: CONFIG.DND5E?.abilities?.[key]?.label || key.toUpperCase(),
    score: Number(ability.value || 10),
    modifier: Number(ability.mod || Math.floor((Number(ability.value || 10) - 10) / 2)),
  }));
  const journals = game.journal.filter((journal) => journal.getFlag(MODULE_ID, SHARED_FLAG));
  const shop = game.items.filter((item) => item.getFlag(MODULE_ID, SHOP_FLAG));
  const messages = game.messages.contents.slice(-25).map((message) => ({
    id: message.id,
    author: message.author?.name || message.speaker?.alias || "The Table",
    content: plainText(message.content),
    rollTotal: message.rolls?.[0]?.total,
    timestamp: Number(message.timestamp || Date.now()),
  }));

  return {
    campaign: { id: config().campaignId, name: game.world.title, edition: "personal" },
    actor: {
      uuid: actor.uuid,
      name: actor.name,
      portrait: actor.img,
      ancestry: system.details?.race || system.details?.species || "Adventurer",
      classLabel: classes.map((item) => item.name).join(" / ") || "Adventurer",
      level,
      hp: { value: Number(system.attributes?.hp?.value || 0), max: Number(system.attributes?.hp?.max || 0), temp: Number(system.attributes?.hp?.temp || 0) },
      ac: Number(system.attributes?.ac?.value || 10),
      speed: Number(system.attributes?.movement?.walk || 0),
      abilities,
      resources: Object.entries(system.resources || {}).filter(([, value]) => value?.label).map(([key, value]) => ({ key, label: value.label, value: Number(value.value || 0), max: Number(value.max || 0) })),
      actions: actor.items.filter((item) => ["weapon", "spell", "feat", "consumable"].includes(item.type)).slice(0, 60).map((item) => ({ uuid: item.uuid, name: item.name, type: item.type, uses: item.system?.uses?.max ? `${item.system.uses.value}/${item.system.uses.max}` : undefined })),
      biography: plainText(system.details?.biography?.value || system.details?.biography || ""),
    },
    journals: await Promise.all(journals.map(async (journal) => {
      const pages = journal.pages?.contents || [];
      const content = pages.map((page) => plainText(page.text?.content || "")).filter(Boolean).join("\n\n");
      return { uuid: journal.uuid, title: journal.name, summary: content.slice(0, 180), content, image: pages.find((page) => page.src)?.src, updatedAt: Number(journal._stats?.modifiedTime || Date.now()) };
    })),
    messages,
    shop: shop.map((item) => ({ uuid: item.uuid, name: item.name, description: plainText(item.system?.description?.value || ""), price: Number(item.system?.price?.value || item.system?.price || 0), currency: item.system?.price?.denomination || "gp", image: item.img })),
    session: { title: game.world.title, subtitle: "Shared from Foundry" },
    revision: 0,
    generatedAt: Date.now(),
  };
}

async function pollActions() {
  if (!shouldRun()) return;
  try {
    const result = await bridgeFetch("/api/bridge/actions");
    for (const action of result.actions || []) await executeAction(action);
  } catch (error) {
    console.debug(`${MODULE_ID} | Action poll paused`, error);
  }
}

async function executeAction(action) {
  try {
    const actor = await fromUuid(action.actorUuid);
    if (!actor || actor.documentName !== "Actor") throw new Error("Character not found.");
    let result = {};
    switch (action.kind) {
      case "adjustHp": {
        const current = Number(actor.system.attributes.hp.value || 0);
        const max = Number(actor.system.attributes.hp.max || current);
        const value = Math.max(0, Math.min(max, current + Number(action.payload.amount || 0)));
        await actor.update({ "system.attributes.hp.value": value });
        result = { value };
        break;
      }
      case "useItem": {
        const item = await fromUuid(action.payload.itemUuid);
        if (!item || item.parent?.uuid !== actor.uuid) throw new Error("That item does not belong to this character.");
        await item.use?.();
        result = { item: item.name };
        break;
      }
      case "roll": {
        const formula = /^\d+d\d+(?:\s*[+-]\s*\d+)?$/i.test(action.payload.formula) ? action.payload.formula : "1d20";
        const roll = await new Roll(formula).evaluate();
        await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }) });
        result = { total: roll.total };
        break;
      }
      case "chat":
        await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: foundry.utils.escapeHTML(String(action.payload.content || "").slice(0, 2000)) });
        break;
      case "purchase": {
        const item = await fromUuid(action.payload.itemUuid);
        if (!item || !item.getFlag(MODULE_ID, SHOP_FLAG)) throw new Error("That shop item is unavailable.");
        await actor.createEmbeddedDocuments("Item", [item.toObject()]);
        result = { item: item.name };
        break;
      }
      case "updateBiography":
        await actor.update({ "system.details.biography.value": foundry.utils.escapeHTML(String(action.payload.content || "").slice(0, 12000)) });
        break;
      case "requestLevelUp":
        await ChatMessage.create({ whisper: ChatMessage.getWhisperRecipients("GM").map((user) => user.id), content: `<strong>${actor.name}</strong> requested a character edit or level up from Pocket Chronicle.` });
        ui.notifications.info(`${actor.name} requested a character edit or level up.`);
        break;
      default:
        throw new Error("Unsupported phone action.");
    }
    await completeAction(action.id, true, result);
    scheduleSnapshot();
  } catch (error) {
    await completeAction(action.id, false, {}, error.message || String(error));
  }
}

async function completeAction(id, ok, result = {}, error = "") {
  return bridgeFetch(`/api/bridge/actions/${encodeURIComponent(id)}/complete`, { method: "POST", body: JSON.stringify({ ok, result, error }) });
}

async function createPairing(actorUuid, playerLabel = "Player") {
  if (!shouldRun()) throw new Error("Only the active GM can create a pairing code.");
  const actor = await fromUuid(actorUuid);
  if (!actor || actor.documentName !== "Actor") throw new Error("Choose a valid Actor UUID.");
  const result = await bridgeFetch("/api/bridge/pairing-codes", { method: "POST", body: JSON.stringify({ actorUuid, playerLabel }) });
  ui.notifications.info(`Pocket Chronicle code for ${playerLabel}: ${result.code} (expires in 10 minutes)`);
  return result.code;
}
