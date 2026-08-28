/* Pocket Chronicle Bridge v0.14.5 */
/* global Hooks, game, ui, fromUuid, CONFIG, Roll, ChatMessage, foundry, Dialog */
const MODULE_ID = "pocket-chronicle-bridge";
const SHOP_FLAG = "shop";
const SHARED_FLAG = "shared";
const REST_RATIONS_FLAG = "restRations";
const LEGACY_REST_RATIONS_ID = "pocket-chronicle-rest-rations";
const PROVISION_FOLDER_NAME = "Pocket Chronicle — Rest & Rations";
const BUILT_IN_PROVISIONS = [
  { key: "hearty-feast", name: "Hearty Feast", kind: "food", tier: "great", price: { value: 1, denomination: "gp" }, image: "icons/consumables/food/plate-ribs-gravy.webp", effect: "Short rest: add proficiency bonus to every Hit Die spent. Long rest: gain 25 temporary HP." },
  { key: "trail-rations", name: "Trail Rations", kind: "food", tier: "regular", price: { value: 5, denomination: "sp" }, image: "icons/consumables/food/berries-ration-round-red.webp", effect: "A dependable serving with no additional benefit or penalty." },
  { key: "spoiled-provisions", name: "Spoiled Provisions", kind: "food", tier: "spoiled", price: { value: 1, denomination: "cp" }, image: "icons/consumables/food/meat-carcass-bone-brown.webp", effect: "After the rest, gain 2 levels of exhaustion." },
  { key: "fresh-water", name: "Fresh Water", kind: "water", tier: "drinkable", price: { value: 1, denomination: "sp" }, image: "icons/consumables/potions/bottle-bulb-corked-blue.webp", effect: "Clean drinking water with no additional benefit or penalty." },
  { key: "tainted-water", name: "Tainted Water", kind: "water", tier: "contaminated", price: { value: 1, denomination: "cp" }, image: "icons/consumables/potions/bottle-bulb-corked-green.webp", effect: "After the rest, gain 1 level of exhaustion." },
];
const REQUEST_TIMEOUT_MS = 10000;
let bridgeOnline = false;
let bridgeLastError = "";
let bridgeStarted = false;
let bridgeTimers = [];
let bridgeLifecycleListenersBound = false;
let activePhoneUserId = "";
let activePhoneActorId = "";
const displayedAccessRequests = new Set();
const bridgeExtensions = new Map();

function integratedRestRationsFlags(document) {
  const flags = document?.flags || document?._source?.flags || {};
  return flags?.[MODULE_ID]?.[REST_RATIONS_FLAG] || {};
}

function restRationsFlag(document, key) {
  const integrated = integratedRestRationsFlags(document);
  if (integrated[key] !== undefined) return integrated[key];
  const flags = document?.flags || document?._source?.flags || {};
  return flags?.[LEGACY_REST_RATIONS_ID]?.[key];
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "mapFree", {
    name: "POCKET.MapFree.Name", hint: "POCKET.MapFree.Hint", scope: "client", config: true, type: Boolean, default: true, requiresReload: true,
    onChange: (value) => void game.settings.set("core", "noCanvas", Boolean(value)),
  });
  game.settings.register(MODULE_ID, "relayUrl", {
    name: "POCKET.RelayUrl.Name", hint: "POCKET.RelayUrl.Hint", scope: "world", config: true, type: String, default: "",
  });
  game.settings.register(MODULE_ID, "campaignId", {
    name: "POCKET.CampaignId.Name", hint: "POCKET.CampaignId.Hint", scope: "world", config: true, type: String, default: "",
  });
  game.settings.register(MODULE_ID, "campaignCode", {
    name: "POCKET.CampaignCode.Name", hint: "POCKET.CampaignCode.Hint", scope: "world", config: true, type: String, default: "",
  });
  game.settings.register(MODULE_ID, "bridgeKey", {
    name: "POCKET.BridgeKey.Name", hint: "POCKET.BridgeKey.Hint", scope: "world", config: true, type: String, default: "",
  });
  game.settings.register(MODULE_ID, "pollMs", {
    name: "POCKET.PollMs.Name", hint: "POCKET.PollMs.Hint", scope: "world", config: true, type: Number, default: 15000, range: { min: 10000, max: 60000, step: 5000 },
  });
  game.settings.register(MODULE_ID, "worldActive", {
    scope: "world", config: false, type: Boolean, default: false,
  });
  if (game.settings.get(MODULE_ID, "mapFree") && !game.settings.get("core", "noCanvas")) {
    void game.settings.set("core", "noCanvas", true);
  }
});

Hooks.once("ready", async () => {
  const moduleRecord = game.modules.get(MODULE_ID);
  if (moduleRecord) moduleRecord.api = {
    version: "0.14.5",
    startActiveWorld,
    endActiveWorld,
    syncNow: syncActiveWorld,
    isWorldActive: () => Boolean(game.settings.get(MODULE_ID, "worldActive") && bridgeOnline),
    createPairing,
    createAccountPairing,
    checkPhoneRequests: pollAccessRequests,
    syncCampaignCode,
    pushNow: pushAllSnapshots,
    registerExtension: (id, extension) => {
      const key = String(id || "").trim();
      if (!key || !extension || typeof extension !== "object") throw new Error("A Pocket Chronicle extension needs an ID and configuration object.");
      bridgeExtensions.set(key, extension);
      scheduleSnapshot();
      return () => {
        bridgeExtensions.delete(key);
        scheduleSnapshot();
      };
    },
    unregisterExtension: (id) => {
      const removed = bridgeExtensions.delete(String(id || ""));
      if (removed) scheduleSnapshot();
      return removed;
    },
    openShopManager,
    rebuildProvisions: async () => {
      const items = await ensureBuiltInProvisions();
      await pushAllSnapshots();
      return items;
    },
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

  Hooks.callAll("pocketChronicleBridgeReady", moduleRecord?.api);

  if (!game.user?.isGM) return;
  try { await ensureBuiltInProvisions(); }
  catch (error) {
    console.error(`${MODULE_ID} | Could not prepare Rest & Rations`, error);
    ui.notifications.warn(`Pocket Chronicle could not prepare Rest & Rations: ${error.message || error}`);
  }
  if (game.settings.get(MODULE_ID, "worldActive")) startBridge();
});

Hooks.on("updateActor", () => scheduleSnapshot());
Hooks.on("updateItem", () => scheduleSnapshot());
Hooks.on("updateJournalEntry", () => scheduleSnapshot());
Hooks.on("updateJournalEntryPage", () => scheduleSnapshot());
Hooks.on("updateUser", () => scheduleSnapshot());
Hooks.on("createCombat", () => scheduleSnapshot());
Hooks.on("updateCombat", () => scheduleSnapshot());
Hooks.on("deleteCombat", () => scheduleSnapshot());
Hooks.on("createCombatant", () => scheduleSnapshot());
Hooks.on("updateCombatant", () => scheduleSnapshot());
Hooks.on("deleteCombatant", () => scheduleSnapshot());
Hooks.on("renderSettingsConfig", (_application, html) => configureSettingsUi(html));
Hooks.on("updateSetting", (setting) => {
  if (setting?.key !== `${MODULE_ID}.campaignCode`) return;
  scheduleCampaignCodeSync();
});
Hooks.on("closeSettingsConfig", () => scheduleCampaignCodeSync());
Hooks.on("preCreateChatMessage", (message) => {
  if (!activePhoneUserId) return;
  if (activePhoneActorId && message.speaker?.actor !== activePhoneActorId) return;
  const player = game.users.get(activePhoneUserId);
  if (player && !player.isGM) message.updateSource({ user: player.id });
});

function isActiveBridgeHost() {
  // Enabling the module in Module Management is the on/off switch. Avoid a
  // second setting which can silently leave an otherwise active module offline.
  return Boolean(game.user?.isGM);
}

function shouldRun() {
  return isActiveBridgeHost() && hasCompleteConfig() && Boolean(game.settings.get(MODULE_ID, "worldActive"));
}

function normalizeRelayUrl(value) {
  const source = String(value || "").trim();
  if (!source) return "";
  try {
    const relay = new URL(source);
    relay.hash = "";
    relay.search = "";
    relay.pathname = relay.pathname.replace(/\/mobile\.html(?:\/.*)?$/i, "").replace(/\/+$/, "");
    return `${relay.origin}${relay.pathname}`;
  } catch {
    return source
      .replace(/[?#].*$/, "")
      .replace(/\/mobile\.html(?:\/.*)?$/i, "")
      .replace(/\/+$/, "");
  }
}

function config() {
  return {
    relayUrl: normalizeRelayUrl(game.settings.get(MODULE_ID, "relayUrl")),
    campaignId: String(game.settings.get(MODULE_ID, "campaignId") || "").trim(),
    campaignCode: String(game.settings.get(MODULE_ID, "campaignCode") || "").trim().toUpperCase().replace(/O/g, "0").replace(/[IL]/g, "1"),
    bridgeKey: String(game.settings.get(MODULE_ID, "bridgeKey") || "").trim(),
    pollMs: Math.max(10000, Number(game.settings.get(MODULE_ID, "pollMs")) || 15000),
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
  if (bridgeStarted) {
    void wakeBridge();
    return;
  }
  if (!hasCompleteConfig()) {
    ui.notifications.warn("Pocket Chronicle Bridge is staying offline until its HTTPS app address, campaign ID, and bridge key are complete.");
    return;
  }
  bridgeStarted = true;
  const current = config();
  void setRemoteWorldState(true).then(() => sendHeartbeat(true)).then(async (connected) => {
    if (!connected) return;
    await syncCampaignCode(true);
    await pushAllSnapshots();
    await pollAccessRequests();
  });
  bridgeTimers.push(window.setInterval(() => void sendHeartbeat(), 60000));
  bridgeTimers.push(window.setInterval(() => void pollActions(), current.pollMs));
  bridgeTimers.push(window.setInterval(() => void pollAccessRequests(), current.pollMs));
  if (!bridgeLifecycleListenersBound) {
    bridgeLifecycleListenersBound = true;
    window.addEventListener("focus", wakeBridge);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void wakeBridge();
    });
    window.addEventListener("online", wakeBridge);
  }
  console.info(`${MODULE_ID} | Active GM bridge started`);
}

function clearBridgeTimers() {
  for (const timer of bridgeTimers) window.clearInterval(timer);
  bridgeTimers = [];
  bridgeStarted = false;
}

async function setRemoteWorldState(active) {
  return bridgeFetch("/api/bridge/world-state", {
    method: "POST",
    body: JSON.stringify({ active: Boolean(active) }),
  });
}

async function startActiveWorld() {
  if (!game.user?.isGM) return false;
  if (!hasCompleteConfig()) {
    ui.notifications.error("Finish the Pocket Chronicle app address, Campaign ID, and bridge key before starting the session.");
    return false;
  }
  await game.settings.set(MODULE_ID, "worldActive", true);
  clearBridgeTimers();
  startBridge();
  return true;
}

async function syncActiveWorld(announce = true) {
  if (!shouldRun()) {
    if (announce) ui.notifications.warn("Start the Pocket Chronicle Active World before syncing.");
    return false;
  }
  if (!bridgeOnline && !(await sendHeartbeat())) return false;
  await Promise.allSettled([pushAllSnapshots(), pollActions(), pollAccessRequests()]);
  if (announce) ui.notifications.info("Pocket Chronicle Active World synchronized.");
  return true;
}

async function endActiveWorld() {
  if (!game.user?.isGM) return false;
  if (shouldRun() && bridgeOnline) await pushAllSnapshots();
  try { if (hasCompleteConfig()) await setRemoteWorldState(false); }
  catch (error) { console.debug(`${MODULE_ID} | Could not announce sleeping state`, error); }
  await game.settings.set(MODULE_ID, "worldActive", false);
  bridgeOnline = false;
  clearBridgeTimers();
  ui.notifications.info("Pocket Chronicle is sleeping. Shop, rests, and live character controls are closed.");
  return true;
}

async function wakeBridge() {
  if (!shouldRun()) return;
  const connected = await sendHeartbeat();
  if (!connected) return;
  await Promise.allSettled([pollActions(), pollAccessRequests()]);
}

async function sendHeartbeat(announce = false) {
  if (!shouldRun() || sendHeartbeat.pending) return false;
  sendHeartbeat.pending = true;
  try {
    await bridgeFetch("/api/bridge/heartbeat", {
      method: "POST",
      body: "{}",
    });
    bridgeOnline = true;
    bridgeLastError = "";
    if (announce) ui.notifications.info(`Pocket Chronicle connected to ${game.world.title}.`);
    return true;
  } catch (error) {
    bridgeOnline = false;
    bridgeLastError = error.message || String(error);
    if (announce) ui.notifications.error(`Pocket Chronicle is offline: ${bridgeLastError}`);
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
  const relay = new URL(current.relayUrl);
  relay.pathname = `${relay.pathname.replace(/\/+$/, "")}/${String(path || "").replace(/^\/+/, "")}`;
  relay.search = "";
  relay.hash = "";
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(relay.toString(), {
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

async function syncCampaignCode(announce = false) {
  if (!isActiveBridgeHost() || !hasCompleteConfig()) return false;
  const code = config().campaignCode;
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    if (announce) ui.notifications.warn("Set a permanent six-character Campaign code using letters and numbers.");
    return false;
  }
  try {
    const result = await bridgeFetch("/api/bridge/campaign-code", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
    if (announce || result.changed) ui.notifications.info("Pocket Chronicle Campaign code is ready.");
    return true;
  } catch (error) {
    if (announce) ui.notifications.error(error.message || "Pocket Chronicle could not save the Campaign code.");
    return false;
  }
}

function scheduleCampaignCodeSync() {
  window.clearTimeout(scheduleCampaignCodeSync.pending);
  scheduleCampaignCodeSync.pending = window.setTimeout(async () => {
    if (!isActiveBridgeHost() || !hasCompleteConfig()) return;
    await syncCampaignCode(true);
  }, 500);
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

function assetUrl(source = "") {
  if (!source) return "";
  try { return new URL(source, window.location.origin).href; }
  catch { return source; }
}

function localized(value, fallback = "") {
  const label = typeof value === "string" ? value : value?.label;
  if (!label) return fallback;
  const translated = game.i18n?.localize(label);
  return translated && translated !== label ? translated : label;
}

function detailText(value, fallback = "") {
  if (typeof value === "string") return value || fallback;
  if (!value || typeof value !== "object") return fallback;
  return value.name || value.label || value.custom || value.value || fallback;
}

function worldSessionSnapshot() {
  const title = game.world.title;
  const source = game.world.nextSession;
  if (!source) return { title, subtitle: "Schedule not set in Foundry" };

  const normalized = typeof source === "string" ? source.trim().replace(" ", "T") : source;
  const date = source instanceof Date ? source : new Date(normalized);
  if (Number.isNaN(date.getTime())) return { title, subtitle: String(source) };

  const dateText = date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const timeText = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const month = date.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
  return {
    title,
    subtitle: `${dateText} at ${timeText}`,
    dateLabel: `${date.getDate()} ${month}`,
  };
}

function finiteNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return 0;
}

const CURRENCY_IN_COPPER = { cp: 1, sp: 10, ep: 50, gp: 100, pp: 1000 };

function actorCurrency(actor) {
  return Object.fromEntries(Object.keys(CURRENCY_IN_COPPER).map((key) => [key, Math.max(0, Math.floor(finiteNumber(actor.system?.currency?.[key])))]));
}

function currencyTotal(currency) {
  return Object.entries(CURRENCY_IN_COPPER).reduce((total, [key, value]) => total + (Math.max(0, Math.floor(finiteNumber(currency?.[key]))) * value), 0);
}

function currencyFromCopper(total) {
  let remaining = Math.max(0, Math.floor(finiteNumber(total)));
  const result = {};
  for (const key of ["pp", "gp", "ep", "sp", "cp"]) {
    const value = CURRENCY_IN_COPPER[key];
    result[key] = Math.floor(remaining / value);
    remaining %= value;
  }
  return result;
}

function shopPrice(item) {
  const denomination = String(item.system?.price?.denomination || "gp").toLowerCase();
  const currency = CURRENCY_IN_COPPER[denomination] ? denomination : "gp";
  const value = Math.max(0, finiteNumber(item.system?.price?.value, item.system?.price));
  return { value, currency, copper: Math.round(value * CURRENCY_IN_COPPER[currency]) };
}

function itemCategory(item) {
  if (item.type === "spell") return "spell";
  if (item.type === "feat") return "feat";
  if (["consumable", "equipment", "tool", "loot", "container", "backpack"].includes(item.type)) return "item";
  return "action";
}

function itemSubtitle(item) {
  if (item.type === "spell") {
    const level = Number(item.system?.level || 0);
    const school = localized(CONFIG.DND5E?.spellSchools?.[item.system?.school], "");
    return [level ? `Level ${level}` : "Cantrip", school].filter(Boolean).join(" · ");
  }
  const activation = item.system?.activation?.type || item.labels?.activation;
  return [localized(CONFIG.Item?.typeLabels?.[item.type], item.type), localized(CONFIG.DND5E?.abilityActivationTypes?.[activation], activation || "")].filter(Boolean).join(" · ");
}

function collectionValues(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value.values === "function") return Array.from(value.values());
  if (typeof value[Symbol.iterator] === "function" && typeof value !== "string") return Array.from(value);
  if (typeof value === "object") return Object.values(value);
  return [];
}

function preparedFormula(value, item) {
  let formula = typeof value === "string" ? value : value?.formula || value?.label || "";
  if (!formula && value && Number(value.number) && Number(value.denomination)) formula = `${value.number}d${value.denomination}`;
  try {
    formula = Roll.replaceFormulaData(String(formula), item.getRollData?.() || item.parent?.getRollData?.() || {}, { missing: "0" });
  } catch { /* Fall back to the prepared label. */ }
  return String(formula).replace(/[−–—]/g, "-");
}

function resolvedRollFormula(formula, data, item) {
  let source = String(formula || "");
  try {
    source = Roll.replaceFormulaData(source, data || item?.getRollData?.() || item?.parent?.getRollData?.() || {}, { missing: "0" });
  } catch { /* Keep the prepared formula if custom roll data is unavailable. */ }
  return source
    .replace(/\[[^\]]*]/g, "")
    .replace(/Math\.(floor|ceil|round|abs|min|max)/gi, "$1")
    .replace(/[−–—]/g, "-")
    .replace(/\s+/g, "")
    .replace(/\+-/g, "-")
    .replace(/\+\+/g, "+")
    .replace(/--/g, "+");
}

function extractDiceFormula(value, item) {
  const source = preparedFormula(value, item);
  const match = source.match(/(?:\d*)d\d+(?:\s*[+-]\s*(?:(?:\d*)d\d+|\d+))*/i);
  if (!match) return "";
  return match[0].replace(/\s+/g, "").replace(/^d/i, "1d");
}

function attackFormula(value, item) {
  const source = preparedFormula(value, item);
  const dice = extractDiceFormula(source, item);
  if (dice && /d20/i.test(dice)) return dice;
  const modifier = source.match(/[+-]?\s*\d+/)?.[0]?.replace(/\s+/g, "");
  if (modifier === undefined) return "";
  const number = Number(modifier);
  if (!Number.isFinite(number)) return "";
  return `1d20${number > 0 ? `+${number}` : number < 0 ? number : ""}`;
}

function legacyItemLocalRolls(item) {
  const rolls = [];
  const seen = new Set();
  const add = (label, formula, kind) => {
    if (!formula || seen.has(`${kind}:${formula}`)) return;
    seen.add(`${kind}:${formula}`);
    rolls.push({ key: `${kind}-${rolls.length + 1}`, label, formula, kind });
  };

  const activities = collectionValues(item.system?.activities);
  const attackSources = [item.labels?.toHit, item.labels?.modifier];
  for (const activity of activities) attackSources.push(activity.labels?.toHit, activity.labels?.modifier);
  for (const source of attackSources) {
    const formula = attackFormula(source, item);
    if (formula) {
      add("Attack", formula, "attack");
      break;
    }
  }

  const damageSources = [];
  for (const damage of collectionValues(item.labels?.damages)) damageSources.push(damage);
  for (const part of collectionValues(item.system?.damage?.parts)) damageSources.push(Array.isArray(part) ? { formula: part[0], type: part[1] } : part);
  for (const activity of activities) {
    for (const damage of collectionValues(activity.labels?.damage)) damageSources.push(damage);
    for (const part of collectionValues(activity.damage?.parts)) damageSources.push(Array.isArray(part) ? { formula: part[0], type: part[1] } : part);
  }
  for (const damage of damageSources) {
    const formula = extractDiceFormula(damage, item);
    if (!formula) continue;
    const sourceLabel = String(damage?.type || damage?.damageType || damage?.label || "");
    const healing = /heal/i.test(sourceLabel);
    const typeLabel = localized(CONFIG.DND5E?.damageTypes?.[damage?.type || damage?.damageType], "");
    add(healing ? "Healing" : typeLabel ? `${typeLabel} damage` : "Damage", formula, healing ? "healing" : "damage");
  }
  return rolls.slice(0, 8);
}

function activityTypeLabel(activity) {
  const configured = CONFIG.DND5E?.activityTypes?.[activity.type];
  return localized(configured?.title || configured?.label, String(activity.type || "Activity").replace(/(^|\s)\S/g, (letter) => letter.toUpperCase()));
}

function activityCastOptions(item, activity, spellSlots) {
  const baseLevel = item.type === "spell" ? Math.max(0, Number(item.system?.level || 0)) : 0;
  const requiresSpellSlot = Boolean(item.type === "spell" && baseLevel > 0 && activity.requiresSpellSlot && activity.consumption?.spellSlot !== false);
  if (!requiresSpellSlot) return [{ slotKey: "", level: baseLevel, label: baseLevel ? `Level ${baseLevel} · no spell slot` : "At will" }];
  return spellSlots
    .filter((slot) => slot.level >= baseLevel)
    .map((slot) => ({
      slotKey: slot.key,
      level: slot.level,
      label: `${slot.label} · ${slot.value}/${slot.max}`,
      value: slot.value,
      max: slot.max,
      pact: slot.pact,
    }));
}

function activitySaveData(activity) {
  if (activity.type !== "save" || !activity.save) return undefined;
  const abilities = collectionValues(activity.save.ability).map(String);
  return {
    abilities,
    abilityLabels: abilities.map((ability) => localized(CONFIG.DND5E?.abilities?.[ability], ability.toUpperCase())),
    dc: Math.max(0, Number(activity.save.dc?.value || 0)),
    onSuccess: String(activity.damage?.onSave || ""),
  };
}

function activityRollsAtLevel(item, activity, castLevel) {
  const baseLevel = item.type === "spell" ? Math.max(0, Number(item.system?.level || 0)) : 0;
  const scaling = item.type === "spell"
    ? baseLevel === 0
      ? Math.max(0, Number(item.system?.scalingIncrease || 0))
      : Math.max(0, Number(castLevel || baseLevel) - baseLevel)
    : 0;
  // D&D 5e's damage activity prepares upcast/cantrip formulas from this numeric
  // scaling value. Avoid cloning and fully preparing an Item for every possible
  // spell level: large high-level spellbooks can otherwise stall Foundry during sync.
  const rollItem = item;
  const rollActivity = activity;
  const rolls = [];
  const seen = new Set();
  const add = (label, formula, kind) => {
    const normalized = resolvedRollFormula(formula, null, rollItem);
    if (!normalized || /^\(?0\)?$/.test(normalized) || normalized.includes("@") || !/[0-9]/.test(normalized)
      || seen.has(`${kind}:${normalized}`)) return;
    seen.add(`${kind}:${normalized}`);
    rolls.push({ key: `${rollActivity.id || rollActivity._id}-${kind}-${rolls.length + 1}`, label, formula: normalized, kind });
  };

  if (rollActivity.type === "attack") {
    let formula = "";
    try {
      const attack = rollActivity.getAttackData?.() || {};
      const modifier = resolvedRollFormula(collectionValues(attack.parts).join(" + "), attack.data, rollItem);
      if (modifier) formula = `1d20+(${modifier})`;
    } catch { /* Fall back to the prepared to-hit label. */ }
    if (!formula) formula = attackFormula(rollActivity.labels?.toHit || rollActivity.labels?.modifier, rollItem);
    add("Attack", formula || "1d20", "attack");
  }

  if (rollActivity.type === "check") {
    const associated = collectionValues(rollActivity.check?.associated);
    const actorSystem = rollItem.parent?.system || {};
    for (const key of associated) {
      const skill = actorSystem.skills?.[key];
      if (skill) {
        const modifier = finiteNumber(skill.total, skill.mod);
        add(localized(CONFIG.DND5E?.skills?.[key], String(key).toUpperCase()), `1d20${modifier >= 0 ? "+" : ""}${modifier}`, "item");
        continue;
      }
      const ability = actorSystem.abilities?.[key];
      if (ability) {
        const modifier = finiteNumber(ability.mod);
        add(`${localized(CONFIG.DND5E?.abilities?.[key], String(key).toUpperCase())} check`, `1d20${modifier >= 0 ? "+" : ""}${modifier}`, "item");
      }
    }
  }

  try {
    const damageConfig = rollActivity.getDamageConfig?.({ scaling }) || { rolls: [] };
    for (const roll of damageConfig.rolls || []) {
      const formula = resolvedRollFormula(collectionValues(roll.parts).join(" + "), roll.data, rollItem);
      const typeKeys = collectionValues(roll.options?.types).length
        ? collectionValues(roll.options.types)
        : roll.options?.type ? [roll.options.type] : [];
      const healing = rollActivity.type === "heal" || typeKeys.some((type) => Boolean(CONFIG.DND5E?.healingTypes?.[type]));
      const labels = typeKeys.map((type) => localized(
        CONFIG.DND5E?.damageTypes?.[type] || CONFIG.DND5E?.healingTypes?.[type],
        String(type),
      )).filter(Boolean);
      add(healing ? (labels.length ? `${labels.join(" + ")} healing` : "Healing") : (labels.length ? `${labels.join(" + ")} damage` : "Damage"), formula, healing ? "healing" : "damage");
    }
  } catch (error) {
    console.debug(`${MODULE_ID} | Could not prepare activity damage for ${item.name}`, error);
  }

  if (!rolls.some((roll) => ["damage", "healing"].includes(roll.kind)) && scaling === 0) {
    for (const damage of collectionValues(rollActivity.labels?.damage)) {
      const formula = resolvedRollFormula(damage?.formula || damage?.label || damage, null, rollItem);
      const type = damage?.damageType;
      const healing = rollActivity.type === "heal" || Boolean(CONFIG.DND5E?.healingTypes?.[type]);
      const typeLabel = localized(CONFIG.DND5E?.damageTypes?.[type] || CONFIG.DND5E?.healingTypes?.[type], "");
      add(healing ? (typeLabel ? `${typeLabel} healing` : "Healing") : (typeLabel ? `${typeLabel} damage` : "Damage"), formula, healing ? "healing" : "damage");
    }
  }
  return rolls.slice(0, 12);
}

function activityConsumesResources(item, activity) {
  if (item.type === "consumable") return true;
  if (Number(activity.uses?.max || 0) > 0 || Number(item.system?.uses?.max || 0) > 0) return true;
  if (item.type === "spell" && activity.requiresSpellSlot && activity.consumption?.spellSlot !== false) return true;
  return collectionValues(activity.consumption?.targets).length > 0;
}

function consumptionUsageConfig(item, activity, { slotKey = "", castLevel } = {}) {
  const baseLevel = item.type === "spell" ? Math.max(0, Number(item.system?.level || 0)) : 0;
  const resolvedLevel = Math.max(baseLevel, Number(castLevel ?? baseLevel));
  const input = {
    create: false,
    consume: {
      action: false,
      resources: true,
      spellSlot: Boolean(slotKey),
    },
    scaling: Math.max(0, resolvedLevel - baseLevel),
    concentration: { begin: false },
    subsequentActions: false,
    ...(slotKey ? { spell: { slot: slotKey } } : {}),
  };
  try {
    const prepared = activity?._prepareUsageConfig?.(input);
    if (prepared) {
      prepared.create = false;
      prepared.consume = { ...(prepared.consume || {}), action: false, resources: true, spellSlot: Boolean(slotKey) };
      prepared.concentration = { begin: false };
      prepared.subsequentActions = false;
      return prepared;
    }
  } catch (error) {
    console.debug(`${MODULE_ID} | Using the standard activity consumption configuration`, error);
  }
  return input;
}

function consumptionPreview(item, activity, castOption) {
  if (!activity) return [];
  const config = consumptionUsageConfig(item, activity, castOption);
  const entries = [];
  for (const target of collectionValues(activity.consumption?.targets)) {
    let labels = null;
    try { labels = target.getConsumptionLabels?.(config, { consumed: true }); }
    catch { /* Fall back to the raw target metadata. */ }
    const label = plainText(labels?.label || labels?.name || target.label || target.target || target.type || "Resource");
    const hint = plainText(labels?.hint || labels?.subtitle || "");
    const value = finiteNumber(labels?.value, target.value, target.amount);
    entries.push({
      type: String(target.type || "resource"),
      label: label || "Linked resource",
      hint,
      value,
      warning: Boolean(labels?.warning || labels?.warn),
    });
  }
  if (castOption?.slotKey) {
    entries.unshift({
      type: "spellSlot",
      label: castOption.label || `Level ${castOption.level} spell slot`,
      hint: `${finiteNumber(castOption.value)}/${finiteNumber(castOption.max)} available`,
      value: 1,
      warning: finiteNumber(castOption.value) < 1,
    });
  }
  return entries;
}

function activeIntegration(id, label) {
  const moduleRecord = game.modules.get(id);
  return { id, label, active: Boolean(moduleRecord?.active), version: String(moduleRecord?.version || "") };
}

function moduleIntegrations() {
  return [
    activeIntegration("midi-qol", "Midi-QOL"),
    activeIntegration("chris-premades", "CPR"),
    activeIntegration("cat", "CAT"),
    activeIntegration("dae", "DAE"),
  ];
}

async function extensionSnapshotData(actor) {
  const data = {};
  for (const [id, extension] of availableExtensions().entries()) {
    if (typeof extension.getSnapshotData !== "function") continue;
    try {
      const value = await extension.getSnapshotData(actor);
      if (value !== undefined) data[id] = value;
    } catch (error) {
      console.error(`${MODULE_ID} | Extension ${id} could not prepare phone data`, error);
    }
  }
  return data;
}

async function executeExtensionAction(action, context) {
  for (const extension of availableExtensions().values()) {
    const actionKinds = Array.isArray(extension.actionKinds) ? extension.actionKinds : [];
    const canHandle = actionKinds.includes(action.kind)
      || (typeof extension.canHandleAction === "function" && await extension.canHandleAction(action, context));
    if (!canHandle || typeof extension.executeAction !== "function") continue;
    return extension.executeAction(action, context);
  }
  throw new Error("Unsupported phone action.");
}

function availableExtensions() {
  const extensions = new Map(bridgeExtensions);
  if (!extensions.has("restRations")) {
    const restRations = game.modules.get(LEGACY_REST_RATIONS_ID);
    const api = restRations?.active ? restRations.api : null;
    if (typeof api?.getSnapshotData === "function" && typeof api?.executeAction === "function") {
      extensions.set("restRations", {
        actionKinds: ["takeRationsRest"],
        getSnapshotData: api.getSnapshotData,
        executeAction: api.executeAction,
      });
    }
  }
  if (!extensions.has("restRations")) {
    extensions.set("restRations", {
      actionKinds: ["takeRationsRest"],
      getSnapshotData: builtInRestSnapshot,
      executeAction: executeBuiltInRest,
    });
  }
  return extensions;
}

function activityAutomation(item, activity) {
  const flags = { ...(item.flags || {}), ...(activity.flags || {}) };
  const providers = [];
  if (game.modules.get("midi-qol")?.active && (flags["midi-qol"] || /^midi\b/i.test(String(activity.name || "")))) providers.push("Midi-QOL");
  if (game.modules.get("chris-premades")?.active && (flags["chris-premades"] || flags.chrisPremades)) providers.push("CPR");
  if (game.modules.get("cat")?.active && (flags.cat || flags["coven-automation-toolkit"])) providers.push("CAT");
  if (game.modules.get("dae")?.active && flags.dae) providers.push("DAE");
  return {
    providers,
    requiresFoundryWorkflow: providers.length > 0 || ["cast", "summon", "enchant", "transform"].includes(String(activity.type || "")),
  };
}

function activityEffectData(activity) {
  let effects = [];
  try { effects = collectionValues(activity.applicableEffects); }
  catch { /* Some contributed activity types do not expose applicableEffects. */ }
  return effects.filter(Boolean).map((effect) => ({
    id: String(effect.id || effect._id || ""),
    name: String(effect.name || "Effect"),
    image: assetUrl(effect.img),
  }));
}

function itemActivityData(item, spellSlots) {
  return collectionValues(item.system?.activities).map((activity) => {
    const castOptions = activityCastOptions(item, activity, spellSlots);
    const levels = [...new Set(castOptions.map((option) => option.level))];
    if (!levels.length) levels.push(Math.max(0, Number(item.system?.level || 0)));
    return {
      id: String(activity.id || activity._id),
      name: String(activity.name || activityTypeLabel(activity)),
      type: String(activity.type || "activity"),
      typeLabel: activityTypeLabel(activity),
      activation: String(activity.labels?.activation || item.labels?.activation || ""),
      duration: String(activity.labels?.duration || item.labels?.duration || ""),
      concentration: Boolean(activity.requiresConcentration),
      description: plainText(activity.description?.chatFlavor || ""),
      save: activitySaveData(activity),
      effects: activityEffectData(activity),
      castOptions,
      rollsByLevel: levels.map((level) => ({ level, rolls: activityRollsAtLevel(item, activity, level) })),
      consumptionByOption: castOptions.map((option) => ({
        slotKey: option.slotKey,
        level: option.level,
        entries: consumptionPreview(item, activity, option),
      })),
      automation: activityAutomation(item, activity),
      canConsume: activityConsumesResources(item, activity),
      requiresSpellSlot: Boolean(item.type === "spell" && activity.requiresSpellSlot && activity.consumption?.spellSlot !== false),
    };
  });
}

function itemLocalRolls(item, activities = []) {
  const activityRolls = activities.flatMap((activity) => activity.rollsByLevel?.[0]?.rolls || []);
  return activityRolls.length ? activityRolls.slice(0, 12) : legacyItemLocalRolls(item);
}

function itemConsumesResources(item) {
  if (item.type === "consumable") return true;
  if (Number(item.system?.uses?.max || 0) > 0) return true;
  return collectionValues(item.system?.activities).some((activity) => activityConsumesResources(item, activity));
}

function actorSpellSlots(system) {
  return Object.entries(system.spells || {}).flatMap(([key, slot]) => {
    if (!slot || typeof slot !== "object") return [];
    const pact = key === "pact";
    const match = key.match(/^spell(\d+)$/);
    if (!pact && !match) return [];
    const level = pact ? Number(slot.level || 0) : Number(match[1]);
    const max = Math.max(0, Number(slot.max || slot.override || 0));
    if (!level || !max) return [];
    return [{
      key,
      label: pact ? `Pact Magic · Level ${level}` : `Level ${level}`,
      level,
      value: Math.max(0, Number(slot.value || 0)),
      max,
      pact,
    }];
  }).sort((a, b) => a.level - b.level || Number(a.pact) - Number(b.pact));
}

function usesTracker(uses) {
  const max = Math.max(0, finiteNumber(uses?.max));
  if (!max) return null;
  const spent = Math.max(0, finiteNumber(uses?.spent));
  const value = Math.max(0, Math.min(max, finiteNumber(uses?.value, max - spent)));
  return { value, max, spent: Math.max(spent, max - value) };
}

function actorResourceTrackers(actor) {
  const trackers = [];
  const seen = new Set();
  const add = (tracker) => {
    if (!tracker?.key || !tracker.max || seen.has(tracker.key)) return;
    seen.add(tracker.key);
    trackers.push(tracker);
  };
  for (const [key, value] of Object.entries(actor.system?.resources || {})) {
    if (!value?.label || !Number(value.max || 0)) continue;
    add({ key: `actor:${key}`, label: value.label, value: Number(value.value || 0), max: Number(value.max || 0), kind: "actor" });
  }
  for (const item of actor.items) {
    const itemUses = usesTracker(item.system?.uses);
    if (itemUses) add({ key: `item:${item.id}`, label: item.name, ...itemUses, kind: "item", itemUuid: item.uuid });
    for (const activity of collectionValues(item.system?.activities)) {
      const activityUses = usesTracker(activity.uses);
      if (!activityUses) continue;
      add({
        key: `activity:${item.id}:${activity.id || activity._id}`,
        label: `${item.name} · ${activity.name || activityTypeLabel(activity)}`,
        ...activityUses,
        kind: "activity",
        itemUuid: item.uuid,
        activityId: String(activity.id || activity._id),
      });
    }
  }
  return trackers.sort((a, b) => a.label.localeCompare(b.label));
}

function actorEffectData(actor) {
  let effects = [];
  try { effects = collectionValues(actor.allApplicableEffects?.()); }
  catch { /* Fall through to the prepared or embedded effects collections. */ }
  if (!effects.length) effects = collectionValues(actor.appliedEffects);
  if (!effects.length) effects = collectionValues(actor.effects);
  const seen = new Set();
  return effects.flatMap((effect) => {
    const id = String(effect.uuid || effect.id || effect._id || "");
    if (!id || seen.has(id) || effect.disabled || effect.isSuppressed || effect.suppressed) return [];
    seen.add(id);
    const statuses = collectionValues(effect.statuses).map((status) => localized(CONFIG.statusEffects?.find((entry) => entry.id === status)?.name, String(status)));
    const remaining = Number(effect.duration?.remaining);
    const duration = plainText(effect.duration?.label || (Number.isFinite(remaining) && remaining >= 0 ? `${Math.ceil(remaining)} remaining` : ""));
    const parent = effect.parent && effect.parent.documentName === "Item" ? effect.parent.name : "";
    return [{
      id,
      name: String(effect.name || "Effect"),
      image: assetUrl(effect.img),
      statuses,
      duration,
      source: String(parent || ""),
      description: plainText(effect.description || effect.system?.description?.value || ""),
    }];
  }).sort((a, b) => a.name.localeCompare(b.name));
}

function combatSnapshot() {
  const combat = game.combat;
  if (!combat) return { active: false, round: 0, turn: 0, combatants: [] };
  const currentId = String(combat.combatant?.id || combat.current?.combatantId || "");
  const combatants = collectionValues(combat.combatants).flatMap((combatant) => {
    if (!combatant || combatant.hidden) return [];
    return [{
      id: String(combatant.id || combatant._id || ""),
      name: String(combatant.name || combatant.actor?.name || "Unknown combatant"),
      portrait: assetUrl(combatant.token?.texture?.src || combatant.actor?.img),
      initiative: Number.isFinite(Number(combatant.initiative)) ? Number(combatant.initiative) : undefined,
      active: String(combatant.id || combatant._id || "") === currentId,
      defeated: Boolean(combatant.defeated),
      actorUuid: combatant.actor?.uuid,
    }];
  });
  return {
    active: Boolean(combat.started),
    round: Math.max(0, Number(combat.round || 0)),
    turn: Math.max(0, Number(combat.turn || 0)),
    currentName: combatants.find((entry) => entry.active)?.name,
    combatants,
  };
}

async function buildSnapshot(actor) {
  const system = actor.system || {};
  const classes = actor.items.filter((item) => item.type === "class");
  const subclasses = actor.items.filter((item) => item.type === "subclass");
  const speciesItem = actor.items.find((item) => ["species", "race"].includes(item.type));
  const backgroundItem = actor.items.find((item) => item.type === "background");
  const level = classes.reduce((total, item) => total + Number(item.system?.levels || 0), Number(system.details?.level || 0));
  const abilities = Object.entries(system.abilities || {}).map(([key, ability]) => ({
    key,
    label: localized(CONFIG.DND5E?.abilities?.[key], key.toUpperCase()),
    score: Number(ability.value || 10),
    modifier: Number(ability.mod || Math.floor((Number(ability.value || 10) - 10) / 2)),
  }));
  const proficiencyBonus = finiteNumber(system.attributes?.prof);
  const saves = Object.entries(system.abilities || {}).map(([key, ability]) => {
    const proficient = Boolean(ability.saveProf?.hasProficiency ?? ability.proficient);
    return {
      key,
      label: localized(CONFIG.DND5E?.abilities?.[key], key.toUpperCase()),
      modifier: finiteNumber(ability.save?.mod, ability.save?.total, Number(ability.mod || 0) + (proficient ? proficiencyBonus : 0)),
      proficient,
    };
  });
  const skills = Object.entries(system.skills || {}).map(([key, skill]) => {
    const ability = skill.ability || CONFIG.DND5E?.skills?.[key]?.ability || "";
    const proficiency = finiteNumber(skill.value, skill.prof?.multiplier);
    const fallbackModifier = finiteNumber(system.abilities?.[ability]?.mod) + (proficiencyBonus * proficiency);
    const modifier = finiteNumber(skill.total, skill.mod, fallbackModifier);
    return {
      key,
      label: localized(CONFIG.DND5E?.skills?.[key], key.toUpperCase()),
      ability,
      modifier,
      passive: finiteNumber(skill.passive, 10 + modifier),
      proficiency,
    };
  }).sort((a, b) => a.label.localeCompare(b.label));
  const languageValues = Array.from(system.traits?.languages?.value || []).map((key) => localized(CONFIG.DND5E?.languages?.[key], key));
  const customLanguages = String(system.traits?.languages?.custom || "").split(/[;,]/).map((value) => value.trim()).filter(Boolean);
  const species = speciesItem?.name || detailText(system.details?.species) || detailText(system.details?.race) || "Adventurer";
  const className = classes.map((item) => item.name).join(" / ") || "Adventurer";
  const spellSlots = actorSpellSlots(system);
  const identityTypes = new Set(["class", "subclass", "background", "species", "race"]);
  const actionItems = actor.items.filter((item) => !identityTypes.has(item.type) && (
    collectionValues(item.system?.activities).length > 0
    || ["weapon", "spell", "feat", "consumable", "equipment", "tool", "loot", "container", "backpack"].includes(item.type)
  ));
  const journals = game.journal.filter((journal) => journal.getFlag(MODULE_ID, SHARED_FLAG));
  const shop = game.items.filter((item) => item.getFlag(MODULE_ID, SHOP_FLAG));
  return {
    campaign: { id: config().campaignId, name: game.world.title, edition: "personal" },
    actor: {
      uuid: actor.uuid,
      name: actor.name,
      portrait: assetUrl(actor.img),
      ancestry: species,
      classLabel: className,
      identity: {
        species,
        background: backgroundItem?.name || detailText(system.details?.background),
        className,
        subclass: subclasses.map((item) => item.name).join(" / "),
        alignment: detailText(system.details?.alignment),
        size: localized(CONFIG.DND5E?.actorSizes?.[system.traits?.size || system.details?.size], detailText(system.traits?.size || system.details?.size)),
        languages: [...languageValues, ...customLanguages],
      },
      level,
      hp: { value: Number(system.attributes?.hp?.value || 0), max: Number(system.attributes?.hp?.max || 0), temp: Number(system.attributes?.hp?.temp || 0) },
      currency: actorCurrency(actor),
      ac: Number(system.attributes?.ac?.value || 10),
      speed: Number(system.attributes?.movement?.walk || 0),
      initiative: finiteNumber(system.attributes?.init?.mod, system.attributes?.init?.total),
      inspiration: Boolean(system.attributes?.inspiration),
      exhaustion: Math.max(0, Math.min(6, finiteNumber(system.attributes?.exhaustion))),
      deathSaves: {
        successes: finiteNumber(system.attributes?.death?.success),
        failures: finiteNumber(system.attributes?.death?.failure),
      },
      abilities,
      saves,
      skills,
      resources: actorResourceTrackers(actor),
      effects: actorEffectData(actor),
      spellSlots,
      actions: actionItems.map((item) => {
        const activities = itemActivityData(item, spellSlots);
        return {
          uuid: item.uuid,
          name: item.name,
          type: item.type,
          category: itemCategory(item),
          subtitle: itemSubtitle(item),
          description: plainText(item.system?.description?.value || item.system?.description || ""),
          image: assetUrl(item.img),
          uses: item.system?.uses?.max ? `${item.system.uses.value}/${item.system.uses.max}` : undefined,
          quantity: Math.max(0, finiteNumber(item.system?.quantity, 1)),
          equipped: Boolean(item.system?.equipped),
          attuned: Boolean(item.system?.attuned || Number(item.system?.attunement) === 2),
          spellLevel: item.type === "spell" ? Number(item.system?.level || 0) : undefined,
          rolls: itemLocalRolls(item, activities),
          activities,
          canConsume: itemConsumesResources(item),
        };
      }),
      owners: actorOwners(actor),
      biography: plainText(system.details?.biography?.value || system.details?.biography || ""),
    },
    integrations: moduleIntegrations(),
    journals: await Promise.all(journals.map(async (journal) => {
      const pages = journal.pages?.contents || [];
      const content = pages.map((page) => plainText(page.text?.content || "")).filter(Boolean).join("\n\n");
      return { uuid: journal.uuid, title: journal.name, summary: content.slice(0, 180), content, image: assetUrl(pages.find((page) => page.src)?.src), updatedAt: Number(journal._stats?.modifiedTime || Date.now()) };
    })),
    messages: [],
    shop: shop.map((item) => {
      const price = shopPrice(item);
      return { uuid: item.uuid, name: item.name, description: plainText(item.system?.description?.value || ""), price: price.value, currency: price.currency, image: assetUrl(item.img) };
    }),
    combat: combatSnapshot(),
    extensions: await extensionSnapshotData(actor),
    session: worldSessionSnapshot(),
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
  let actingUser = null;
  try {
    const actor = await fromUuid(action.actorUuid);
    if (!actor || actor.documentName !== "Actor") throw new Error("Character not found.");
    const requestedUser = action.requestedByFoundryUserId ? game.users.get(action.requestedByFoundryUserId) : null;
    if (requestedUser && !requestedUser.isGM && Number(actor.ownership?.[requestedUser.id] || 0) >= 3) actingUser = requestedUser;
    activePhoneUserId = actingUser?.id || "";
    activePhoneActorId = actingUser ? actor.id : "";
    const messageData = {
      speaker: ChatMessage.getSpeaker({ actor }),
      ...(actingUser ? { user: actingUser.id } : {}),
    };
    let result = {};
    switch (action.kind) {
      case "adjustHp": {
        const change = Number(action.payload.amount || 0);
        if (!Number.isFinite(change) || change === 0) throw new Error("Enter a valid damage or healing amount.");
        const hp = actor.system.attributes.hp || {};
        const current = Number(hp.value || 0);
        const max = Math.max(current, Number(hp.max || 0));
        const temp = Math.max(0, Number(hp.temp || 0));
        const hpUpdate = {};
        if (change < 0) {
          const damage = Math.abs(change);
          const tempSpent = Math.min(temp, damage);
          hpUpdate["system.attributes.hp.temp"] = temp - tempSpent;
          hpUpdate["system.attributes.hp.value"] = Math.max(0, current - (damage - tempSpent));
        } else hpUpdate["system.attributes.hp.value"] = Math.min(max, current + change);
        // Pocket Chronicle adjusts only the two HP fields. It deliberately does
        // not call dnd5e.applyDamage or start a Midi-QOL workflow, so a phone HP
        // edit never creates an automated concentration check.
        await actor.update(hpUpdate, { pocketChronicle: true });
        result = {
          value: Number(actor.system.attributes.hp.value || 0),
          temp: Number(actor.system.attributes.hp.temp || 0),
        };
        break;
      }
      case "setTempHp": {
        const value = Number(action.payload.value);
        if (!Number.isInteger(value) || value < 0 || value > 999) throw new Error("Temporary HP must be a whole number from 0 to 999.");
        await actor.update({ "system.attributes.hp.temp": value }, { pocketChronicle: true });
        result = { value };
        break;
      }
      case "useItem":
      case "consumeItem": {
        const item = await fromUuid(action.payload.itemUuid);
        if (!item || item.parent?.uuid !== actor.uuid) throw new Error("That item does not belong to this character.");
        const activities = collectionValues(item.system?.activities);
        const activityId = String(action.payload.activityId || "");
        const activity = activities.find((entry) => String(entry.id || entry._id) === activityId) || activities[0];
        let castLevel = Math.max(0, Number(item.system?.level || 0));
        let slotKey = "";
        if (activity && item.type === "spell" && activity.requiresSpellSlot && activity.consumption?.spellSlot !== false) {
          slotKey = String(action.payload.slotKey || "");
          const slot = actorSpellSlots(actor.system).find((entry) => entry.key === slotKey);
          if (!slot || slot.level < castLevel) throw new Error("Choose an available spell slot for this casting.");
          if (slot.value < 1) throw new Error(`${slot.label} has no remaining spell slots.`);
          castLevel = slot.level;
        }
        const usageConfig = consumptionUsageConfig(item, activity, { slotKey, castLevel });
        if (activity?.consume) {
          const consumed = await activity.consume(usageConfig, {
            create: false,
            data: { ...messageData, flags: { dnd5e: activity.messageFlags || {} } },
            hasConsumption: true,
          });
          if (consumed === false) throw new Error(`${item.name} could not spend its linked resource. Check its remaining uses, quantity, materials, or spell slots in Foundry.`);
        } else if (Number(item.system?.uses?.max || 0) > 0) {
          const uses = usesTracker(item.system.uses);
          if (!uses || uses.value < 1) throw new Error(`${item.name} has no uses remaining.`);
          await item.update({ "system.uses.spent": Math.min(uses.max, uses.spent + 1) });
        } else if (item.type === "consumable" && Number(item.system?.quantity || 0) > 0) {
          await item.update({ "system.quantity": Math.max(0, Number(item.system.quantity) - 1) });
        } else throw new Error(`${item.name} does not expose a spendable native resource.`);
        result = { item: item.name, consumed: true, activity: activity?.name, castLevel, slotKey };
        break;
      }
      case "roll":
      case "rollAbility":
      case "rollSkill":
      case "rollSave":
      case "rollInitiative":
      case "rollDeathSave":
        throw new Error("Refresh Pocket Chronicle to roll on the phone. Foundry did not create a GM-authored roll card.");
      case "recordDeathSave": {
        const total = Math.max(1, Math.min(20, Number(action.payload.total || 0)));
        if (Number(actor.system.attributes.hp.value || 0) > 0) throw new Error("Death saves are only available at 0 HP.");
        const death = actor.system.attributes.death || {};
        let successes = Math.max(0, Math.min(3, Number(death.success || 0)));
        let failures = Math.max(0, Math.min(3, Number(death.failure || 0)));
        const update = {};
        if (total === 20) {
          successes = 0;
          failures = 0;
          update["system.attributes.hp.value"] = 1;
        } else if (total >= 10) {
          successes = Math.min(3, successes + 1);
          if (successes >= 3) {
            successes = 0;
            failures = 0;
          }
        } else {
          failures = Math.min(3, failures + (total === 1 ? 2 : 1));
        }
        update["system.attributes.death.success"] = successes;
        update["system.attributes.death.failure"] = failures;
        await actor.update(update);
        result = { total, successes, failures, revived: total === 20 };
        break;
      }
      case "showDice": {
        const dice = Array.isArray(action.payload.dice) ? action.payload.dice.slice(0, 100) : [];
        const safeDice = dice.flatMap((die) => {
          const sides = Math.max(2, Math.min(1000, Number(die?.sides || 0)));
          const value = Math.max(1, Math.min(sides, Number(die?.result || 0)));
          if (!Number.isInteger(sides) || !Number.isInteger(value)) return [];
          return [{ result: value, resultLabel: value, type: `d${sides}`, vectors: [], options: {} }];
        });
        let displayed = false;
        if (safeDice.length && game.modules.get("dice-so-nice")?.active && typeof game.dice3d?.show === "function") {
          try {
            displayed = Boolean(await game.dice3d.show(
              { throws: [{ dice: safeDice }] },
              actingUser || game.user,
              true,
              null,
              false,
            ));
          } catch (error) {
            console.debug(`${MODULE_ID} | Dice So Nice mirror skipped`, error);
          }
        }
        result = { displayed, diceSoNiceActive: Boolean(game.modules.get("dice-so-nice")?.active) };
        break;
      }
      case "setInspiration": {
        const value = Boolean(action.payload.value);
        await actor.update({ "system.attributes.inspiration": value });
        result = { value };
        break;
      }
      case "setExhaustion": {
        const value = Math.max(0, Math.min(6, Math.floor(Number(action.payload.value))));
        if (!Number.isInteger(value)) throw new Error("Stress must be a whole level from 0 to 6.");
        const update = { "system.attributes.exhaustion": value };
        if (value >= 6) update["system.attributes.hp.value"] = 0;
        await actor.update(update, { pocketChronicle: true });
        if (value >= 6 && typeof actor.toggleStatusEffect === "function") {
          try { await actor.toggleStatusEffect("dead", { active: true }); }
          catch (error) { console.debug(`${MODULE_ID} | Dead status marker was not available`, error); }
        }
        result = { value, penalty: value * -2, speedPenalty: value * -5, dead: value >= 6 };
        break;
      }
      case "chat":
        await ChatMessage.create({ ...messageData, content: foundry.utils.escapeHTML(String(action.payload.content || "").slice(0, 2000)) });
        break;
      case "purchase": {
        const item = await fromUuid(action.payload.itemUuid);
        if (!item || !item.getFlag(MODULE_ID, SHOP_FLAG)) throw new Error("That shop item is unavailable.");
        const quantity = Math.max(1, Math.min(99, Math.floor(Number(action.payload.quantity || 1))));
        const price = shopPrice(item);
        const totalPrice = price.copper * quantity;
        const beforeCurrency = actorCurrency(actor);
        const available = currencyTotal(beforeCurrency);
        if (available < totalPrice) throw new Error(`${actor.name} does not have enough currency for ${item.name}.`);
        const afterCurrency = currencyFromCopper(available - totalPrice);
        const currencyUpdate = Object.fromEntries(Object.entries(afterCurrency).map(([key, value]) => [`system.currency.${key}`, value]));
        await actor.update(currencyUpdate, { pocketChronicle: true });
        try {
          const provisionKey = restRationsFlag(item, "provisionKey");
          const stackable = ["consumable", "loot"].includes(item.type);
          const existing = stackable ? actor.items.find((owned) => provisionKey
            ? restRationsFlag(owned, "provisionKey") === provisionKey
            : owned.type === item.type && owned.name === item.name) : null;
          if (existing) await existing.update({ "system.quantity": Math.max(0, Number(existing.system?.quantity || 0)) + quantity });
          else {
            const itemData = item.toObject();
            delete itemData._id;
            if (itemData.system && "quantity" in itemData.system) itemData.system.quantity = quantity;
            await actor.createEmbeddedDocuments("Item", [itemData]);
          }
        } catch (error) {
          const rollback = Object.fromEntries(Object.entries(beforeCurrency).map(([key, value]) => [`system.currency.${key}`, value]));
          await actor.update(rollback, { pocketChronicle: true });
          throw error;
        }
        result = { item: item.name, quantity, spent: totalPrice, currency: price.currency, remainingCurrency: afterCurrency };
        break;
      }
      case "updateBiography":
        await actor.update({ "system.details.biography.value": foundry.utils.escapeHTML(String(action.payload.biography || "").slice(0, 12000)) });
        break;
      case "requestLevelUp":
        await ChatMessage.create({ ...messageData, whisper: ChatMessage.getWhisperRecipients("GM").map((user) => user.id), content: `<strong>${actor.name}</strong> requested a character edit or level up from Pocket Chronicle.` });
        ui.notifications.info(`${actor.name} requested a character edit or level up.`);
        break;
      default:
        result = await executeExtensionAction(action, { actor, actingUser, messageData });
    }
    await completeAction(action.id, true, result);
    scheduleSnapshot();
  } catch (error) {
    await completeAction(action.id, false, {}, error.message || String(error));
  } finally {
    activePhoneUserId = "";
    activePhoneActorId = "";
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

async function openShopManager() {
  if (!game.user?.isGM) throw new Error("Only a GM can manage the Pocket Chronicle shop.");
  const items = [...game.items].sort((a, b) => a.name.localeCompare(b.name));
  if (!items.length) {
    ui.notifications.warn("Create or import at least one world Item before opening the phone shop manager.");
    return false;
  }
  const rows = items.map((item) => {
    const permanent = Boolean(restRationsFlag(item, "permanentShop"));
    const checked = permanent || Boolean(item.getFlag(MODULE_ID, SHOP_FLAG));
    const price = shopPrice(item);
    return `<label class="pocket-chronicle-shop-row"><input type="checkbox" data-item-id="${item.id}" ${checked ? "checked" : ""} ${permanent ? "disabled" : ""}><span><strong>${foundry.utils.escapeHTML(item.name)}</strong><small>${foundry.utils.escapeHTML(item.type)} · ${price.value} ${price.currency}${permanent ? " · Rest & Rations fixture" : ""}</small></span></label>`;
  }).join("");
  const content = `<form class="pocket-chronicle-shop-manager"><p>Choose the world Items players can purchase in the phone app. Rest & Rations provisions remain permanent shop fixtures.</p><div class="pocket-chronicle-shop-list">${rows}</div></form>`;
  const readSelection = (button) => new Set(Array.from(button?.form?.querySelectorAll("input[data-item-id]:checked") || []).map((input) => input.dataset.itemId));
  const DialogV2 = foundry.applications?.api?.DialogV2;
  let selected = null;
  if (DialogV2) {
    selected = await DialogV2.wait({
      window: { title: "Pocket Chronicle Shop Manager" },
      content,
      modal: true,
      rejectClose: false,
      buttons: [
        { action: "cancel", label: "Cancel", callback: () => null },
        { action: "save", label: "Save Shop", icon: "fa-solid fa-store", default: true, callback: (_event, button) => readSelection(button) },
      ],
    });
  } else {
    selected = await new Promise((resolve) => {
      new Dialog({
        title: "Pocket Chronicle Shop Manager",
        content,
        buttons: {
          cancel: { label: "Cancel", callback: () => resolve(null) },
          save: { label: "Save Shop", callback: (html) => resolve(new Set(Array.from(html[0].querySelectorAll("input[data-item-id]:checked")).map((input) => input.dataset.itemId))) },
        },
        default: "save",
        close: () => resolve(null),
      }).render(true);
    });
  }
  if (!(selected instanceof Set)) return false;
  for (const item of items) {
    const permanent = Boolean(restRationsFlag(item, "permanentShop"));
    const shared = permanent || selected.has(item.id);
    if (Boolean(item.getFlag(MODULE_ID, SHOP_FLAG)) === shared) continue;
    if (shared) await item.setFlag(MODULE_ID, SHOP_FLAG, true);
    else await item.unsetFlag(MODULE_ID, SHOP_FLAG);
  }
  await pushAllSnapshots();
  ui.notifications.info("Pocket Chronicle shop updated.");
  return true;
}

function builtInProvisionFlags(provision) {
  return {
    provisionKey: provision.key,
    kind: provision.kind,
    tier: provision.tier,
    effect: provision.effect,
    permanentShop: true,
  };
}

function builtInProvisionData(provision) {
  return {
    name: provision.name,
    type: "consumable",
    img: provision.image,
    system: {
      description: { value: `<p><strong>${provision.name}</strong></p><p>${provision.effect}</p><p>One serving is consumed after a successful Pocket Chronicle rest.</p>`, chat: "" },
      quantity: 1,
      price: provision.price,
      weight: { value: 0, units: "lb" },
      rarity: "",
      identified: true,
      type: { value: "food", subtype: "" },
      uses: { max: "", spent: 0, recovery: [], autoDestroy: false },
      properties: [],
      activities: {},
    },
    flags: {
      [MODULE_ID]: {
        [SHOP_FLAG]: true,
        [REST_RATIONS_FLAG]: builtInProvisionFlags(provision),
      },
    },
  };
}

async function ensureBuiltInProvisions() {
  if (!game.user?.isGM) return [];
  let folder = game.folders.find((entry) => entry.type === "Item" && entry.getFlag(MODULE_ID, "provisionFolder"));
  if (!folder) {
    const FolderDocument = CONFIG.Folder?.documentClass;
    if (typeof FolderDocument?.create !== "function") throw new Error("Foundry's Folder document API is unavailable.");
    folder = await FolderDocument.create({
      name: PROVISION_FOLDER_NAME,
      type: "Item",
      sorting: "a",
      flags: { [MODULE_ID]: { provisionFolder: true } },
    });
  }
  const ItemDocument = CONFIG.Item?.documentClass;
  if (typeof ItemDocument?.create !== "function") throw new Error("Foundry's Item document API is unavailable.");
  const items = [];
  for (const provision of BUILT_IN_PROVISIONS) {
    let item = game.items.find((entry) => restRationsFlag(entry, "provisionKey") === provision.key);
    if (!item) item = await ItemDocument.create({ ...builtInProvisionData(provision), folder: folder.id }, { renderSheet: false });
    else {
      const update = {};
      if (!item.getFlag(MODULE_ID, SHOP_FLAG)) update[`flags.${MODULE_ID}.${SHOP_FLAG}`] = true;
      const integrated = integratedRestRationsFlags(item);
      for (const [key, value] of Object.entries(builtInProvisionFlags(provision))) {
        if (integrated[key] !== value) update[`flags.${MODULE_ID}.${REST_RATIONS_FLAG}.${key}`] = value;
      }
      if (item.folder?.id !== folder.id) update.folder = folder.id;
      if (Object.keys(update).length) await item.update(update, { pocketChronicle: true });
    }
    items.push(item);
  }
  return items;
}

function builtInHitDice(actor) {
  const bySize = actor.system?.attributes?.hd?.bySize || {};
  const maximums = {};
  for (const cls of actor.items.filter((item) => item.type === "class")) {
    const denomination = String(cls.system?.hd?.denomination || "");
    if (!denomination) continue;
    maximums[denomination] = (maximums[denomination] || 0) + Number(cls.system?.hd?.max || cls.system?.levels || 0);
  }
  return Object.entries(bySize).map(([denomination, value]) => ({
    denomination,
    value: Math.max(0, Number(value || 0)),
    max: Math.max(Number(value || 0), Number(maximums[denomination] || 0)),
  })).filter((pool) => pool.max > 0).sort((a, b) => Number(a.denomination.slice(1)) - Number(b.denomination.slice(1)));
}

function builtInRestSnapshot(actor) {
  const inventory = collectionValues(actor.items).flatMap((item) => {
    const key = restRationsFlag(item, "provisionKey");
    const quantity = Math.max(0, Number(item.system?.quantity || 0));
    if (!key || quantity < 1) return [];
    return [{
      uuid: item.uuid,
      key,
      name: item.name,
      kind: restRationsFlag(item, "kind"),
      tier: restRationsFlag(item, "tier"),
      quantity,
      effect: restRationsFlag(item, "effect") || "",
    }];
  });
  const exemptions = restRationsFlag(actor, "exemptions") || {};
  return {
    enabled: true,
    food: inventory.filter((item) => item.kind === "food"),
    water: inventory.filter((item) => item.kind === "water"),
    hitDice: builtInHitDice(actor),
    proficiencyBonus: Number(actor.system?.attributes?.prof || 0),
    exemptions: { food: Boolean(exemptions.food), water: Boolean(exemptions.water) },
  };
}

async function ownedBuiltInProvision(actor, uuid, expectedKind, exempt) {
  if (exempt) return null;
  const item = await fromUuid(String(uuid || ""));
  if (!item || item.parent?.uuid !== actor.uuid || restRationsFlag(item, "kind") !== expectedKind) throw new Error(`Choose a ${expectedKind} serving from this character's inventory.`);
  if (Number(item.system?.quantity || 0) < 1) throw new Error(`${item.name} has no servings remaining.`);
  return item;
}

function normalizedBuiltInHitDice(requested, actor) {
  const available = Object.fromEntries(builtInHitDice(actor).map((pool) => [pool.denomination, pool.value]));
  const combined = {};
  for (const entry of Array.isArray(requested) ? requested : []) {
    const denomination = String(entry?.denomination || "");
    const count = Number(entry?.count || 0);
    if (!/^d\d+$/i.test(denomination) || !Number.isInteger(count) || count < 0) throw new Error("Choose a valid number of Hit Dice.");
    combined[denomination] = (combined[denomination] || 0) + count;
  }
  for (const [denomination, count] of Object.entries(combined)) {
    if (count > Number(available[denomination] || 0)) throw new Error(`Only ${available[denomination] || 0} ${denomination} Hit Dice are available.`);
  }
  return combined;
}

async function executeBuiltInRest(action, context) {
  const { actor, messageData } = context;
  const restType = action.payload.restType === "long" ? "long" : "short";
  const exemptions = restRationsFlag(actor, "exemptions") || {};
  const food = await ownedBuiltInProvision(actor, action.payload.foodItemUuid, "food", Boolean(exemptions.food));
  const water = await ownedBuiltInProvision(actor, action.payload.waterItemUuid, "water", Boolean(exemptions.water));
  const foodKey = restRationsFlag(food, "provisionKey") || "exempt";
  const waterKey = restRationsFlag(water, "provisionKey") || "exempt";
  const hearty = foodKey === "hearty-feast";
  let diceSpent = 0;
  let heartyBonus = 0;
  if (restType === "short") {
    const requested = normalizedBuiltInHitDice(action.payload.hitDice, actor);
    for (const [denomination, count] of Object.entries(requested)) {
      for (let index = 0; index < count; index += 1) {
        const proficiencyBonus = Math.max(0, Number(actor.system?.attributes?.prof || 0));
        const config = { denomination, hookNames: ["pocketChronicleRestRations"] };
        if (hearty && proficiencyBonus) {
          config.rolls = [{ parts: [String(proficiencyBonus)], data: {} }];
          heartyBonus += proficiencyBonus;
        }
        const rolls = await actor.rollHitDie(config, { configure: false }, { data: { ...messageData, flavor: hearty ? `Hearty ${denomination} + PB` : `Rest ${denomination}` } });
        if (!rolls) throw new Error(`${denomination} could not be spent.`);
        diceSpent += 1;
      }
    }
  }
  const restConfig = { dialog: false, chat: false, autoHD: false, advanceTime: false, advanceBastionTurn: false, newDay: restType === "long" };
  const restResult = restType === "short" ? await actor.shortRest(restConfig) : await actor.longRest(restConfig);
  if (!restResult) throw new Error("The D&D rest did not complete.");
  for (const item of [food, water].filter(Boolean)) await item.update({ "system.quantity": Math.max(0, Number(item.system?.quantity || 0) - 1) }, { pocketChronicle: true });
  let tempHp = Number(actor.system?.attributes?.hp?.temp || 0);
  if (restType === "long" && hearty && tempHp < 25) {
    tempHp = 25;
    await actor.update({ "system.attributes.hp.temp": 25 }, { pocketChronicle: true });
  }
  const exhaustionAdded = (foodKey === "spoiled-provisions" ? 2 : 0) + (waterKey === "tainted-water" ? 1 : 0);
  const exhaustion = Math.max(0, Math.min(6, Number(actor.system?.attributes?.exhaustion || 0) + exhaustionAdded));
  if (exhaustionAdded) await actor.update({ "system.attributes.exhaustion": exhaustion }, { pocketChronicle: true });
  return { restType, food: food?.name || "Exempt", water: water?.name || "Exempt", diceSpent, heartyBonus, tempHp, exhaustionAdded, exhaustion };
}

function configureSettingsUi(html) {
  if (!game.user?.isGM) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root) return;
  const relayInput = root.querySelector(`[name="${MODULE_ID}.relayUrl"]`);
  if (relayInput && !relayInput.dataset.pocketChronicleNormalized) {
    relayInput.dataset.pocketChronicleNormalized = "true";
    const cleanRelayInput = () => {
      relayInput.value = normalizeRelayUrl(relayInput.value);
    };
    cleanRelayInput();
    relayInput.addEventListener("change", cleanRelayInput);
    relayInput.addEventListener("blur", cleanRelayInput);
  }
  if (root.querySelector("[data-pocket-chronicle-pair]")) return;
  const codeInput = root.querySelector(`[name="${MODULE_ID}.campaignCode"]`);
  const campaignIdInput = root.querySelector(`[name="${MODULE_ID}.campaignId"]`);
  const bridgeKeyInput = root.querySelector(`[name="${MODULE_ID}.bridgeKey"]`);
  if (codeInput) {
    codeInput.maxLength = 6;
    codeInput.minLength = 6;
    codeInput.pattern = "[A-Za-z0-9]{6}";
    codeInput.autocomplete = "off";
    codeInput.style.textTransform = "uppercase";
    codeInput.addEventListener("input", () => {
      codeInput.value = codeInput.value.replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase().replace(/O/g, "0").replace(/[IL]/g, "1");
    });
  }
  if (bridgeKeyInput) {
    bridgeKeyInput.type = "password";
    bridgeKeyInput.autocomplete = "off";
  }
  const anchor = codeInput?.closest(".form-group");
  if (!anchor) return;

  const sessionGroup = document.createElement("div");
  sessionGroup.className = "form-group pocket-chronicle-session-control";
  const sessionLabel = document.createElement("label");
  sessionLabel.textContent = "Pocket Chronicle world session";
  const sessionFields = document.createElement("div");
  sessionFields.className = "form-fields";
  const sessionToggle = document.createElement("button");
  sessionToggle.type = "button";
  const sessionSync = document.createElement("button");
  sessionSync.type = "button";
  sessionSync.innerHTML = '<i class="fa-solid fa-rotate"></i> Sync Now';
  const sessionHint = document.createElement("p");
  sessionHint.className = "hint";
  const refreshSessionControls = () => {
    const active = Boolean(game.settings.get(MODULE_ID, "worldActive"));
    sessionToggle.innerHTML = active
      ? '<i class="fa-solid fa-moon"></i> End Session'
      : '<i class="fa-solid fa-sun"></i> Start Active World';
    sessionSync.disabled = !active;
    sessionHint.textContent = active
      ? "ACTIVE — Shop, rests, stress, equipment, and live character controls are open on player phones."
      : "SLEEPING — Phones retain their records and local rolls, but live Foundry controls make no requests.";
  };
  sessionToggle.addEventListener("click", () => void (async () => {
    sessionToggle.disabled = true;
    if (game.settings.get(MODULE_ID, "worldActive")) await endActiveWorld();
    else await startActiveWorld();
    refreshSessionControls();
    sessionToggle.disabled = false;
  })());
  sessionSync.addEventListener("click", () => void syncActiveWorld(true));
  sessionFields.append(sessionToggle, sessionSync);
  sessionGroup.append(sessionLabel, sessionFields, sessionHint);
  refreshSessionControls();
  anchor.insertAdjacentElement("afterend", sessionGroup);

  const group = document.createElement("div");
  group.className = "form-group pocket-chronicle-pairing-control";
  group.dataset.pocketChroniclePair = "true";
  const label = document.createElement("label");
  label.textContent = "Player phone access";
  const fields = document.createElement("div");
  fields.className = "form-fields";
  const button = document.createElement("button");
  button.type = "button";
  button.innerHTML = '<i class="fa-solid fa-mobile-screen-button"></i> Check Requests / Resets';
  button.addEventListener("click", () => void pollAccessRequests(true));
  const syncButton = document.createElement("button");
  syncButton.type = "button";
  syncButton.innerHTML = '<i class="fa-solid fa-key"></i> Save Campaign Code';
  syncButton.addEventListener("click", () => void (async () => {
    syncButton.disabled = true;
    try {
      const visibleSettings = {
        relayUrl: normalizeRelayUrl(relayInput?.value),
        campaignId: String(campaignIdInput?.value || "").trim(),
        campaignCode: String(codeInput?.value || "").trim().toUpperCase().replace(/O/g, "0").replace(/[IL]/g, "1"),
        bridgeKey: String(bridgeKeyInput?.value || "").trim(),
      };
      for (const [key, value] of Object.entries(visibleSettings)) {
        if (String(game.settings.get(MODULE_ID, key) || "") === value) continue;
        await game.settings.set(MODULE_ID, key, value);
      }
      await syncCampaignCode(true);
    } finally {
      syncButton.disabled = false;
    }
  })());
  fields.append(syncButton, button);
  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent = "Players use this code to connect. First-time phones and forgotten passwords appear here for your approval.";
  group.append(label, fields, hint);
  sessionGroup.insertAdjacentElement("afterend", group);

  const shopGroup = document.createElement("div");
  shopGroup.className = "form-group pocket-chronicle-shop-control";
  const shopLabel = document.createElement("label");
  shopLabel.textContent = "Phone shop";
  const shopFields = document.createElement("div");
  shopFields.className = "form-fields";
  const shopButton = document.createElement("button");
  shopButton.type = "button";
  shopButton.innerHTML = '<i class="fa-solid fa-store"></i> Open Shop Manager';
  shopButton.addEventListener("click", () => void openShopManager().catch((error) => {
    console.error(`${MODULE_ID} | Shop Manager could not open`, error);
    ui.notifications.error(`Pocket Chronicle Shop Manager could not open: ${error.message || error}`);
  }));
  shopFields.append(shopButton);
  const shopHint = document.createElement("p");
  shopHint.className = "hint";
  shopHint.textContent = "Choose which world Items are sold in the Pocket Chronicle phone shop.";
  shopGroup.append(shopLabel, shopFields, shopHint);
  group.insertAdjacentElement("afterend", shopGroup);

}

async function chooseAccessDecision(accessRequest) {
  const content = document.createElement("div");
  content.className = "pocket-chronicle-player-picker";
  const intro = document.createElement("p");
  const isPasswordReset = accessRequest.kind === "password-reset";
  intro.textContent = isPasswordReset
    ? `${accessRequest.playerLabel} requested a Pocket Chronicle password reset. Approving lets this phone replace the saved app password and signs out older phones for this account.`
    : `${accessRequest.playerLabel} wants to connect a phone to ${accessRequest.characterCount} owned character${accessRequest.characterCount === 1 ? "" : "s"}. Approve only if this player is currently asking to connect.`;
  content.append(intro);

  const DialogV2 = foundry.applications?.api?.DialogV2;
  if (DialogV2) {
    return DialogV2.wait({
      window: { title: isPasswordReset ? "Pocket Chronicle Password Reset" : "Pocket Chronicle Phone Request" },
      content: content.outerHTML,
      modal: true,
      rejectClose: false,
      buttons: [
        { action: "later", label: "Later", callback: () => "later" },
        { action: "deny", label: "Deny", icon: "fa-solid fa-ban", callback: () => "deny" },
        { action: "approve", label: isPasswordReset ? "Approve Reset" : "Approve Phone", icon: "fa-solid fa-mobile-screen-button", default: true, callback: () => "approve" },
      ],
    });
  }

  return new Promise((resolve) => {
    new Dialog({
      title: isPasswordReset ? "Pocket Chronicle Password Reset" : "Pocket Chronicle Phone Request",
      content: content.outerHTML,
      buttons: {
        later: { label: "Later", callback: () => resolve("later") },
        deny: { label: "Deny", callback: () => resolve("deny") },
        approve: { label: isPasswordReset ? "Approve Reset" : "Approve Phone", callback: () => resolve("approve") },
      },
      default: "approve",
      close: () => resolve("later"),
    }).render(true);
  });
}

async function pollAccessRequests(announceEmpty = false) {
  if (!shouldRun() || !bridgeOnline || pollAccessRequests.pending) return;
  if (!/^[A-Z0-9]{6}$/.test(config().campaignCode)) {
    if (announceEmpty) ui.notifications.warn("Set and save a permanent six-character Campaign code first.");
    return;
  }
  pollAccessRequests.pending = true;
  try {
    const result = await bridgeFetch("/api/bridge/access-requests");
    const requests = (result.requests || []).filter((entry) => !displayedAccessRequests.has(entry.id));
    if (announceEmpty && requests.length === 0) ui.notifications.info("No phone connections or password resets are waiting for approval.");
    for (const accessRequest of requests) {
      displayedAccessRequests.add(accessRequest.id);
      const decision = await chooseAccessDecision(accessRequest);
      if (decision === "approve" || decision === "deny") {
        await bridgeFetch(`/api/bridge/access-requests/${encodeURIComponent(accessRequest.id)}`, {
          method: "POST",
          body: JSON.stringify({ decision }),
        });
        ui.notifications.info(decision === "approve"
          ? accessRequest.kind === "password-reset"
            ? `${accessRequest.playerLabel}'s password reset was approved.`
            : `${accessRequest.playerLabel}'s phone was approved.`
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
