/* global Hooks, game, ui, fromUuid, CONFIG, Roll, ChatMessage, foundry, Dialog */
const MODULE_ID = "pocket-chronicle-bridge";
const SHOP_FLAG = "shop";
const SHARED_FLAG = "shared";
const REQUEST_TIMEOUT_MS = 10000;
let bridgeOnline = false;
const displayedAccessRequests = new Set();

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
  game.settings.register(MODULE_ID, "campaignPassword", {
    name: "POCKET.CampaignPassword.Name", hint: "POCKET.CampaignPassword.Hint", scope: "world", config: true, type: String, default: "",
  });
  game.settings.register(MODULE_ID, "bridgeKey", {
    name: "POCKET.BridgeKey.Name", hint: "POCKET.BridgeKey.Hint", scope: "world", config: true, type: String, default: "",
  });
  game.settings.register(MODULE_ID, "pollMs", {
    name: "POCKET.PollMs.Name", hint: "POCKET.PollMs.Hint", scope: "world", config: true, type: Number, default: 5000, range: { min: 2000, max: 10000, step: 500 },
  });
});

Hooks.once("ready", () => {
  const moduleRecord = game.modules.get(MODULE_ID);
  moduleRecord.api = {
    createPairing,
    createAccountPairing,
    checkPhoneRequests: pollAccessRequests,
    syncCampaignPassword,
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

  if (!isActiveBridgeHost()) return;
  startBridge();
});

Hooks.on("updateActor", () => scheduleSnapshot());
Hooks.on("updateItem", () => scheduleSnapshot());
Hooks.on("createChatMessage", () => scheduleSnapshot());
Hooks.on("updateJournalEntry", () => scheduleSnapshot());
Hooks.on("updateJournalEntryPage", () => scheduleSnapshot());
Hooks.on("updateUser", () => scheduleSnapshot());
Hooks.on("renderSettingsConfig", (_application, html) => configureSettingsUi(html));
Hooks.on("updateSetting", (setting) => {
  if (setting?.key === `${MODULE_ID}.campaignPassword` && shouldRun()) window.setTimeout(() => void syncCampaignPassword(true), 250);
});

function isActiveBridgeHost() {
  if (!game.user?.isGM || !game.settings.get(MODULE_ID, "enabled")) return false;
  const activeGms = game.users.filter((user) => user.active && user.isGM).sort((a, b) => a.id.localeCompare(b.id));
  return activeGms[0]?.id === game.user.id;
}

function shouldRun() {
  return isActiveBridgeHost() && hasCompleteConfig();
}

function config() {
  return {
    relayUrl: String(game.settings.get(MODULE_ID, "relayUrl") || "").replace(/\/$/, ""),
    campaignId: String(game.settings.get(MODULE_ID, "campaignId") || ""),
    campaignPassword: String(game.settings.get(MODULE_ID, "campaignPassword") || ""),
    bridgeKey: String(game.settings.get(MODULE_ID, "bridgeKey") || ""),
    pollMs: Math.max(2000, Number(game.settings.get(MODULE_ID, "pollMs")) || 5000),
  };
}

function hasCompleteConfig() {
  const current = config();
  if (!current.relayUrl || !current.campaignId || !current.bridgeKey) return false;
  try {
    const relay = new URL(current.relayUrl);
    return relay.protocol === "https:" || ["localhost", "127.0.0.1"].includes(relay.hostname);
  } catch {
    return false;
  }
}

function startBridge() {
  if (!hasCompleteConfig()) {
    ui.notifications.warn("Pocket Chronicle Bridge is staying offline until its HTTPS app address, campaign ID, and bridge key are complete.");
    return;
  }
  const current = config();
  void sendHeartbeat(true).then(async (connected) => {
    if (!connected) return;
    await syncCampaignPassword();
    await pushAllSnapshots();
    await pollAccessRequests();
  });
  window.setInterval(() => void sendHeartbeat(), 10000);
  window.setInterval(() => void pollActions(), current.pollMs);
  window.setInterval(() => void pollAccessRequests(), current.pollMs);
  window.setInterval(() => void pushAllSnapshots(), 30000);
  console.info(`${MODULE_ID} | Active GM bridge started`);
}

async function sendHeartbeat(announce = false) {
  if (!shouldRun() || sendHeartbeat.pending) return false;
  sendHeartbeat.pending = true;
  try {
    await bridgeFetch("/api/bridge/heartbeat", { method: "POST", body: "{}" });
    bridgeOnline = true;
    if (announce) ui.notifications.info(`Pocket Chronicle connected to ${game.world.title}.`);
    return true;
  } catch (error) {
    bridgeOnline = false;
    console.debug(`${MODULE_ID} | Heartbeat paused`, error);
    return false;
  } finally {
    sendHeartbeat.pending = false;
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
  if (!hasCompleteConfig()) throw new Error("Pocket Chronicle Bridge is not fully configured.");
  const current = config();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${current.relayUrl}${path}`, {
      ...options,
      signal: controller.signal,
      headers: { ...headers(), ...(options.headers || {}) },
    });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || `Pocket Chronicle returned ${response.status}.`);
    return response.json();
  } finally {
    window.clearTimeout(timeout);
  }
}

async function syncCampaignPassword(announce = false) {
  if (!shouldRun()) return false;
  const password = config().campaignPassword;
  if (password.length < 8 || password.length > 128) {
    if (announce) ui.notifications.warn("Set a Campaign password of at least eight characters before players connect.");
    return false;
  }
  try {
    const result = await bridgeFetch("/api/bridge/campaign-password", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
    if (announce || result.changed) ui.notifications.info("Pocket Chronicle Campaign password is ready.");
    return true;
  } catch (error) {
    if (announce) ui.notifications.error(error.message || "Pocket Chronicle could not save the Campaign password.");
    return false;
  }
}

function scheduleSnapshot() {
  if (!shouldRun()) return;
  window.clearTimeout(scheduleSnapshot.pending);
  scheduleSnapshot.pending = window.setTimeout(pushAllSnapshots, 900);
}

async function pushAllSnapshots() {
  if (!shouldRun() || !bridgeOnline || pushAllSnapshots.pending) return;
  pushAllSnapshots.pending = true;
  try {
    const actors = game.actors.filter((actor) => actor.type === "character");
    for (const actor of actors) {
      try {
        await bridgeFetch("/api/bridge/snapshot", { method: "POST", body: JSON.stringify(await buildSnapshot(actor)) });
      } catch (error) {
        console.warn(`${MODULE_ID} | Snapshot failed for ${actor.name}`, error);
      }
    }
  } finally {
    pushAllSnapshots.pending = false;
  }
}

function actorOwners(actor) {
  return game.users
    .filter((user) => !user.isGM && Number(actor.ownership?.[user.id] || 0) >= 3)
    .map((user) => ({ userId: user.id, name: user.name }));
}

function playerRoster() {
  return game.users
    .filter((user) => !user.isGM)
    .map((user) => ({
      userId: user.id,
      name: user.name,
      actorUuids: game.actors
        .filter((actor) => actor.type === "character" && Number(actor.ownership?.[user.id] || 0) >= 3)
        .map((actor) => actor.uuid),
    }))
    .filter((user) => user.actorUuids.length > 0);
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
      owners: actorOwners(actor),
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
  if (!shouldRun() || !bridgeOnline || pollActions.pending) return;
  pollActions.pending = true;
  try {
    const result = await bridgeFetch("/api/bridge/actions");
    for (const action of result.actions || []) await executeAction(action);
  } catch (error) {
    console.debug(`${MODULE_ID} | Action poll paused`, error);
  } finally {
    pollActions.pending = false;
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

function configureSettingsUi(html) {
  if (!game.user?.isGM) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root || root.querySelector("[data-pocket-chronicle-pair]")) return;
  const passwordInput = root.querySelector(`[name="${MODULE_ID}.campaignPassword"]`);
  const bridgeKeyInput = root.querySelector(`[name="${MODULE_ID}.bridgeKey"]`);
  if (passwordInput) {
    passwordInput.type = "password";
    passwordInput.autocomplete = "new-password";
  }
  if (bridgeKeyInput) {
    bridgeKeyInput.type = "password";
    bridgeKeyInput.autocomplete = "off";
  }
  const anchor = passwordInput?.closest(".form-group");
  if (!anchor) return;

  const group = document.createElement("div");
  group.className = "form-group pocket-chronicle-pairing-control";
  group.dataset.pocketChroniclePair = "true";
  const label = document.createElement("label");
  label.textContent = "Player phone approvals";
  const fields = document.createElement("div");
  fields.className = "form-fields";
  const button = document.createElement("button");
  button.type = "button";
  button.innerHTML = '<i class="fa-solid fa-mobile-screen-button"></i> Check Phone Requests';
  button.addEventListener("click", () => void pollAccessRequests(true));
  fields.append(button);
  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent = "Players enter the Campaign ID and Campaign password in the app, choose their Foundry account, then ask you to approve the phone.";
  group.append(label, fields, hint);
  anchor.insertAdjacentElement("afterend", group);
}

async function chooseAccessDecision(accessRequest) {
  const content = document.createElement("div");
  content.className = "pocket-chronicle-player-picker";
  const intro = document.createElement("p");
  intro.textContent = `${accessRequest.playerLabel} wants to connect a phone to ${accessRequest.characterCount} owned character${accessRequest.characterCount === 1 ? "" : "s"}. Approve only if this player is currently asking to connect.`;
  content.append(intro);

  const DialogV2 = foundry.applications?.api?.DialogV2;
  if (DialogV2) {
    return DialogV2.wait({
      window: { title: "Pocket Chronicle Phone Request" },
      content: content.outerHTML,
      modal: true,
      rejectClose: false,
      buttons: [
        { action: "later", label: "Later", callback: () => "later" },
        { action: "deny", label: "Deny", icon: "fa-solid fa-ban", callback: () => "deny" },
        { action: "approve", label: "Approve Phone", icon: "fa-solid fa-mobile-screen-button", default: true, callback: () => "approve" },
      ],
    });
  }

  return new Promise((resolve) => {
    new Dialog({
      title: "Pocket Chronicle Phone Request",
      content: content.outerHTML,
      buttons: {
        later: { label: "Later", callback: () => resolve("later") },
        deny: { label: "Deny", callback: () => resolve("deny") },
        approve: { label: "Approve Phone", callback: () => resolve("approve") },
      },
      default: "approve",
      close: () => resolve("later"),
    }).render(true);
  });
}

async function pollAccessRequests(announceEmpty = false) {
  if (!shouldRun() || !bridgeOnline || pollAccessRequests.pending) return;
  if (config().campaignPassword.length < 8) {
    if (announceEmpty) ui.notifications.warn("Set and save a Campaign password of at least eight characters first.");
    return;
  }
  pollAccessRequests.pending = true;
  try {
    const result = await bridgeFetch("/api/bridge/access-requests");
    const requests = (result.requests || []).filter((entry) => !displayedAccessRequests.has(entry.id));
    if (announceEmpty && requests.length === 0) ui.notifications.info("No phones are waiting for approval.");
    for (const accessRequest of requests) {
      displayedAccessRequests.add(accessRequest.id);
      const decision = await chooseAccessDecision(accessRequest);
      if (decision === "approve" || decision === "deny") {
        await bridgeFetch(`/api/bridge/access-requests/${encodeURIComponent(accessRequest.id)}`, {
          method: "POST",
          body: JSON.stringify({ decision }),
        });
        ui.notifications.info(decision === "approve"
          ? `${accessRequest.playerLabel}'s phone was approved.`
          : `${accessRequest.playerLabel}'s phone request was denied.`);
      } else {
        displayedAccessRequests.delete(accessRequest.id);
      }
    }
  } catch (error) {
    if (announceEmpty) ui.notifications.error(error.message || "Pocket Chronicle could not check phone requests.");
  } finally {
    pollAccessRequests.pending = false;
  }
}

async function createAccountPairing(foundryUserId) {
  const player = playerRoster().find((entry) => entry.userId === foundryUserId);
  if (!player) throw new Error("Choose a Foundry player who owns at least one character.");
  return bridgeFetch("/api/bridge/account-pairing-codes", {
    method: "POST",
    body: JSON.stringify({ foundryUserId: player.userId, playerLabel: player.name, actorUuids: player.actorUuids }),
  });
}
