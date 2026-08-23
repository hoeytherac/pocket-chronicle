/* global Hooks, game, ui, fromUuid, CONFIG, Roll, ChatMessage, foundry, Dialog */
const MODULE_ID = "pocket-chronicle-bridge";
const SHOP_FLAG = "shop";
const SHARED_FLAG = "shared";
const REQUEST_TIMEOUT_MS = 10000;
let bridgeOnline = false;
let bridgeLastError = "";
let bridgeStarted = false;
let activePhoneUserId = "";
let activePhoneActorId = "";
const displayedAccessRequests = new Set();

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
    name: "POCKET.PollMs.Name", hint: "POCKET.PollMs.Hint", scope: "world", config: true, type: Number, default: 5000, range: { min: 2000, max: 10000, step: 500 },
  });
  if (game.settings.get(MODULE_ID, "mapFree") && !game.settings.get("core", "noCanvas")) {
    void game.settings.set("core", "noCanvas", true);
  }
});

Hooks.once("ready", () => {
  const moduleRecord = game.modules.get(MODULE_ID);
  if (moduleRecord) moduleRecord.api = {
    createPairing,
    createAccountPairing,
    checkPhoneRequests: pollAccessRequests,
    syncCampaignCode,
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

  if (!game.user?.isGM) return;
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
  return isActiveBridgeHost() && hasCompleteConfig();
}

function config() {
  return {
    relayUrl: String(game.settings.get(MODULE_ID, "relayUrl") || "").replace(/\/$/, ""),
    campaignId: String(game.settings.get(MODULE_ID, "campaignId") || "").trim(),
    campaignCode: String(game.settings.get(MODULE_ID, "campaignCode") || "").trim().toUpperCase().replace(/O/g, "0").replace(/[IL]/g, "1"),
    bridgeKey: String(game.settings.get(MODULE_ID, "bridgeKey") || "").trim(),
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
  void sendHeartbeat(true).then(async (connected) => {
    if (!connected) return;
    await syncCampaignCode(true);
    await pushAllSnapshots();
    await pollAccessRequests();
  });
  window.setInterval(() => void sendHeartbeat(), 10000);
  window.setInterval(() => void pollActions(), current.pollMs);
  window.setInterval(() => void pollAccessRequests(), current.pollMs);
  window.setInterval(() => void pushAllSnapshots(), 30000);
  window.addEventListener("focus", wakeBridge);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void wakeBridge();
  });
  window.addEventListener("online", wakeBridge);
  console.info(`${MODULE_ID} | Active GM bridge started`);
}

async function wakeBridge() {
  if (!shouldRun()) return;
  const connected = await sendHeartbeat();
  if (!connected) return;
  await Promise.allSettled([pollActions(), pollAccessRequests(), pushAllSnapshots()]);
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

async function syncCampaignCode(announce = false) {
  if (!shouldRun()) return false;
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
    if (!shouldRun()) return;
    if (!bridgeOnline && !(await sendHeartbeat())) return;
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

function finiteNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return 0;
}

function itemCategory(item) {
  if (item.type === "spell") return "spell";
  if (item.type === "feat") return "feat";
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

function itemLocalRolls(item) {
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

function itemConsumesResources(item) {
  if (item.type === "consumable") return true;
  if (Number(item.system?.uses?.max || 0) > 0) return true;
  if (item.type === "spell" && Number(item.system?.level || 0) > 0) return true;
  return collectionValues(item.system?.activities).some((activity) => {
    const consumption = activity.consumption || {};
    return collectionValues(consumption.targets).length > 0 || Number(consumption.amount || 0) > 0;
  });
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
  const actionItems = actor.items.filter((item) => ["weapon", "spell", "feat", "consumable", "equipment", "tool"].includes(item.type));
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
      ac: Number(system.attributes?.ac?.value || 10),
      speed: Number(system.attributes?.movement?.walk || 0),
      initiative: finiteNumber(system.attributes?.init?.mod, system.attributes?.init?.total),
      inspiration: Boolean(system.attributes?.inspiration),
      deathSaves: {
        successes: finiteNumber(system.attributes?.death?.success),
        failures: finiteNumber(system.attributes?.death?.failure),
      },
      abilities,
      saves,
      skills,
      resources: Object.entries(system.resources || {}).filter(([, value]) => value?.label).map(([key, value]) => ({ key, label: value.label, value: Number(value.value || 0), max: Number(value.max || 0) })),
      actions: actionItems.slice(0, 160).map((item) => ({
        uuid: item.uuid,
        name: item.name,
        type: item.type,
        category: itemCategory(item),
        subtitle: itemSubtitle(item),
        description: plainText(item.system?.description?.value || item.system?.description || ""),
        image: assetUrl(item.img),
        uses: item.system?.uses?.max ? `${item.system.uses.value}/${item.system.uses.max}` : undefined,
        rolls: itemLocalRolls(item),
        canConsume: itemConsumesResources(item),
      })),
      owners: actorOwners(actor),
      biography: plainText(system.details?.biography?.value || system.details?.biography || ""),
    },
    journals: await Promise.all(journals.map(async (journal) => {
      const pages = journal.pages?.contents || [];
      const content = pages.map((page) => plainText(page.text?.content || "")).filter(Boolean).join("\n\n");
      return { uuid: journal.uuid, title: journal.name, summary: content.slice(0, 180), content, image: assetUrl(pages.find((page) => page.src)?.src), updatedAt: Number(journal._stats?.modifiedTime || Date.now()) };
    })),
    messages,
    shop: shop.map((item) => ({ uuid: item.uuid, name: item.name, description: plainText(item.system?.description?.value || ""), price: Number(item.system?.price?.value || item.system?.price || 0), currency: item.system?.price?.denomination || "gp", image: assetUrl(item.img) })),
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
    const noDialog = { configure: false };
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
      case "useItem":
      case "consumeItem": {
        const item = await fromUuid(action.payload.itemUuid);
        if (!item || item.parent?.uuid !== actor.uuid) throw new Error("That item does not belong to this character.");
        const usage = await item.use?.(
          { event: { shiftKey: true }, subsequentActions: false },
          noDialog,
          { create: false, data: messageData },
        );
        const hasActivities = collectionValues(item.system?.activities).length > 0;
        if (hasActivities && !usage) throw new Error(`${item.name} could not spend its resource. Check its charges, spell slots, or required choices in Foundry.`);
        result = { item: item.name, consumed: true };
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
      case "setInspiration": {
        const value = Boolean(action.payload.value);
        await actor.update({ "system.attributes.inspiration": value });
        result = { value };
        break;
      }
      case "chat":
        await ChatMessage.create({ ...messageData, content: foundry.utils.escapeHTML(String(action.payload.content || "").slice(0, 2000)) });
        break;
      case "purchase": {
        const item = await fromUuid(action.payload.itemUuid);
        if (!item || !item.getFlag(MODULE_ID, SHOP_FLAG)) throw new Error("That shop item is unavailable.");
        await actor.createEmbeddedDocuments("Item", [item.toObject()]);
        result = { item: item.name };
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
        throw new Error("Unsupported phone action.");
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

function configureSettingsUi(html) {
  if (!game.user?.isGM) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root || root.querySelector("[data-pocket-chronicle-pair]")) return;
  const codeInput = root.querySelector(`[name="${MODULE_ID}.campaignCode"]`);
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
  syncButton.addEventListener("click", () => void syncCampaignCode(true));
  fields.append(syncButton, button);
  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent = "Players use this code to connect. First-time phones and forgotten passwords appear here for your approval.";
  group.append(label, fields, hint);
  anchor.insertAdjacentElement("afterend", group);
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
