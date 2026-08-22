import {
  MODULE_ID,
  SOCKET_NAME,
  clamp,
  debounce,
  documentIsVisible,
  formatModifier,
  isPhoneDevice,
  makeDiceFormula,
  normalizePrice,
  primaryActiveGM,
  safeArraySetting
} from "./utils.js";

const TEMPLATE = `modules/${MODULE_ID}/templates/pocket-chronicle.hbs`;
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
let pocketApp;

function applyDeviceMode() {
  const phone = isPhoneDevice();
  document.body.classList.toggle("pc-phone-device", phone);
  return phone;
}

function getProperty(object, path) {
  return foundry.utils.getProperty(object, path);
}

function escapeHTML(value) {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}

function stripHTML(value, maximum = 180) {
  const div = document.createElement("div");
  div.innerHTML = String(value ?? "");
  const text = (div.textContent ?? "").replace(/\s+/g, " ").trim();
  return text.length > maximum ? `${text.slice(0, maximum - 1).trim()}…` : text;
}

function removeJournalSecrets(value) {
  const div = document.createElement("div");
  div.innerHTML = String(value ?? "");
  div.querySelectorAll("section.secret, .secret").forEach((element) => element.remove());
  return div.innerHTML;
}

function ownedCharacters() {
  const owner = CONST.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;
  return Array.from(game.actors ?? [])
    .filter((actor) => actor.type === "character" && (game.user.isGM || actor.testUserPermission(game.user, owner)))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function actorSummary(actor) {
  const race = getProperty(actor, "system.details.race.name") ?? getProperty(actor, "system.details.race") ?? "";
  const background = getProperty(actor, "system.details.background.name") ?? "";
  const classes = Array.from(actor.items ?? [])
    .filter((item) => item.type === "class")
    .map((item) => `${item.name} ${getProperty(item, "system.levels") ?? ""}`.trim())
    .join(" · ");
  return [race, classes, background].filter(Boolean).join(" · ") || actor.type || "Character";
}

function itemDetail(item) {
  const quantity = getProperty(item, "system.quantity");
  const level = getProperty(item, "system.level");
  const uses = getProperty(item, "system.uses");
  if (item.type === "spell") return level === 0 ? "Cantrip" : `Level ${level ?? "—"}`;
  if (uses?.max) return `${uses.value ?? 0} / ${uses.max} uses`;
  if (quantity != null && quantity !== 1) return `Quantity ${quantity}`;
  return CONFIG.Item?.typeLabels?.[item.type] ? game.i18n.localize(CONFIG.Item.typeLabels[item.type]) : item.type;
}

function itemCanUse(item) {
  if (typeof item.use === "function") return true;
  const activities = Array.from(getProperty(item, "system.activities") ?? []);
  return activities.some((activity) => typeof activity?.use === "function" && activity.type !== "passive");
}

function prepareActor(actor) {
  if (!actor) return null;
  const hpValue = Number(getProperty(actor, "system.attributes.hp.value")) || 0;
  const hpMax = Number(getProperty(actor, "system.attributes.hp.max")) || 0;
  const hpTemp = Number(getProperty(actor, "system.attributes.hp.temp")) || 0;
  const abilities = Object.entries(getProperty(actor, "system.abilities") ?? {}).map(([key, ability]) => ({
    key,
    abbr: (CONFIG.DND5E?.abilities?.[key]?.abbreviation ?? key).toUpperCase(),
    score: ability.value ?? "—",
    modifier: formatModifier(ability.mod),
    save: formatModifier(ability.save ?? ability.mod)
  }));
  const skills = Object.entries(getProperty(actor, "system.skills") ?? {}).map(([key, skill]) => ({
    key,
    label: CONFIG.DND5E?.skills?.[key]?.label ? game.i18n.localize(CONFIG.DND5E.skills[key].label) : key,
    modifier: formatModifier(skill.total ?? skill.mod)
  })).sort((a, b) => a.label.localeCompare(b.label));
  const items = Array.from(actor.items ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    img: item.img,
    type: item.type,
    detail: itemDetail(item),
    canUse: itemCanUse(item)
  }));
  const definitions = [
    ["ACTIONS", "Actions & Equipment", ["weapon", "equipment", "consumable", "tool"]],
    ["FEATURES", "Features", ["feat", "class", "subclass", "background"]],
    ["SPELLBOOK", "Spells", ["spell"]],
    ["POSSESSIONS", "Inventory", ["loot", "container", "backpack"]]
  ];
  const claimed = new Set(definitions.flatMap(([, , types]) => types));
  const itemSections = definitions.map(([eyebrow, label, types]) => ({
    eyebrow,
    label,
    items: items.filter((item) => types.includes(item.type))
  }));
  const other = items.filter((item) => !claimed.has(item.type));
  if (other.length) itemSections.push({ eyebrow: "MORE", label: "Other Features", items: other });
  const movement = getProperty(actor, "system.attributes.movement");
  const speedValue = movement?.walk ?? movement?.fly ?? movement?.swim ?? "—";
  const speedUnits = movement?.units && movement.units !== "ft" ? ` ${movement.units}` : speedValue === "—" ? "" : " ft";
  return {
    id: actor.id,
    uuid: actor.uuid,
    name: actor.name,
    img: actor.img,
    summary: actorSummary(actor),
    hp: { value: hpValue, max: hpMax, temp: hpTemp },
    ac: getProperty(actor, "system.attributes.ac.value") ?? "—",
    speed: `${speedValue}${speedUnits}`,
    proficiency: formatModifier(getProperty(actor, "system.attributes.prof")),
    abilities,
    skills,
    itemSections
  };
}

function canSeePage(page) {
  return documentIsVisible(page) || documentIsVisible(page.parent);
}

function prepareJournals() {
  return Array.from(game.journal ?? [])
    .filter((entry) => documentIsVisible(entry))
    .map((entry) => {
      const pages = Array.from(entry.pages ?? []).filter(canSeePage).map((page) => ({ uuid: page.uuid, name: page.name }));
      const first = Array.from(entry.pages ?? []).find(canSeePage);
      const source = first?.type === "text" ? getProperty(first, "text.content") : "";
      return {
        uuid: entry.uuid,
        name: entry.name,
        img: first?.type === "image" ? first.src : null,
        summary: stripHTML(source) || `${pages.length} readable page${pages.length === 1 ? "" : "s"}`,
        searchText: `${entry.name} ${stripHTML(source, 500)}`.toLocaleLowerCase(),
        pageCount: pages.length,
        multiplePages: pages.length !== 1,
        pages: pages.length ? pages : [{ uuid: entry.uuid, name: "Open entry" }]
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function resolveJournalPage(uuid) {
  let document = await fromUuid(uuid);
  if (!document || !documentIsVisible(document)) return null;
  if (document.documentName === "JournalEntry") {
    document = Array.from(document.pages ?? []).find(canSeePage) ?? document;
  }
  const title = document.name ?? document.parent?.name ?? "Journal";
  if (document.documentName !== "JournalEntryPage") {
    return { title, image: null, html: "<p>This journal has no readable pages yet.</p>" };
  }
  if (document.type === "image") return { title, image: document.src, html: "" };
  if (document.type === "video") return { title, image: null, html: `<p><a href="${escapeHTML(document.src)}" target="_blank" rel="noopener">Open video handout</a></p>` };
  if (document.type === "pdf") return { title, image: null, html: `<p><a href="${escapeHTML(document.src)}" target="_blank" rel="noopener">Open PDF handout</a></p>` };
  const source = getProperty(document, "text.content") ?? "";
  const html = await TextEditor.enrichHTML(source, {
    async: true,
    secrets: game.user.isGM,
    documents: true,
    relativeTo: document
  });
  return { title, image: null, html };
}

async function prepareShared() {
  const prepared = [];
  for (const entry of safeArraySetting("sharedFeed")) {
    if (entry.kind === "image") {
      prepared.push({ ...entry, kindLabel: "IMAGE" });
      continue;
    }
    if (entry.kind === "snapshot") {
      prepared.push({ ...entry, kindLabel: "JOURNAL" });
      continue;
    }
    const document = await fromUuid(entry.uuid).catch(() => null);
    if (!document || !documentIsVisible(document)) continue;
    let page = document;
    if (document.documentName === "JournalEntry") page = Array.from(document.pages ?? []).find(canSeePage) ?? document;
    prepared.push({
      ...entry,
      title: entry.title || page.name || document.name,
      image: page.type === "image" ? page.src : entry.image,
      caption: entry.caption || (page.type === "text" ? stripHTML(getProperty(page, "text.content")) : "Tap to open"),
      kindLabel: "JOURNAL"
    });
  }
  return prepared;
}

function prepareShop() {
  return safeArraySetting("shopCatalog").map((entry) => ({
    ...entry,
    typeLabel: String(entry.type ?? "item").toUpperCase(),
    priceLabel: Number(entry.price) === 0 ? "Free" : `${entry.price} ${String(entry.denomination ?? "gp").toUpperCase()}`
  }));
}

async function renderChatMessage(message) {
  try {
    if (typeof message.getHTML === "function") {
      const rendered = await message.getHTML();
      const element = rendered instanceof HTMLElement ? rendered : rendered?.[0];
      if (element) return element.outerHTML;
    }
  } catch (error) {
    console.debug(`${MODULE_ID} | Falling back to compact chat rendering`, error);
  }
  const speaker = message.alias ?? message.speaker?.alias ?? game.users.get(message.user?.id ?? message.user)?.name ?? "Foundry";
  const content = await TextEditor.enrichHTML(message.content ?? "", { async: true, secrets: game.user.isGM });
  const rolls = [];
  for (const roll of message.rolls ?? []) {
    try { rolls.push(await roll.render()); } catch (_error) { /* The message content still contains the result. */ }
  }
  return `<article class="message"><header class="message-header"><strong>${escapeHTML(speaker)}</strong></header><div class="message-content">${content}${rolls.join("")}</div></article>`;
}

async function prepareMessages() {
  const limit = clamp(game.settings.get(MODULE_ID, "chatLimit"), 10, 100);
  const messages = Array.from(game.messages ?? []).slice(-limit);
  return Promise.all(messages.map(async (message) => ({ id: message.id, html: await renderChatMessage(message) })));
}

async function sendPurchaseResult(userId, payload) {
  game.socket.emit(SOCKET_NAME, { type: "purchase-result", targetUserId: userId, ...payload });
}

async function whisperPurchase(text, buyer) {
  const recipients = Array.from(game.users ?? []).filter((user) => user.isGM || user.id === buyer.id).map((user) => user.id);
  await ChatMessage.create({
    user: game.user.id,
    whisper: recipients,
    content: `<div class="pc-purchase-message"><strong>Pocket Shop</strong><p>${text}</p></div>`
  });
}

async function fulfillPurchase(request) {
  const buyer = game.users.get(request.userId);
  const actor = await fromUuid(request.actorUuid).catch(() => null);
  const catalogEntry = safeArraySetting("shopCatalog").find((entry) => entry.id === request.shopId);
  const owner = CONST.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;
  if (!buyer || !actor || actor.documentName !== "Actor" || !actor.testUserPermission(buyer, owner)) {
    return sendPurchaseResult(request.userId, { ok: false, message: "That character is no longer available for this purchase." });
  }
  if (!catalogEntry) return sendPurchaseResult(request.userId, { ok: false, message: "That shop item is no longer available." });
  const sourceItem = await fromUuid(catalogEntry.uuid).catch(() => null);
  if (!sourceItem || sourceItem.documentName !== "Item") {
    return sendPurchaseResult(request.userId, { ok: false, message: "The GM needs to restock that item." });
  }
  const price = normalizePrice(catalogEntry.price, catalogEntry.denomination);
  const currencyPath = `system.currency.${price.denomination}`;
  const balance = Number(getProperty(actor, currencyPath)) || 0;
  if (balance < price.value) {
    const message = `${escapeHTML(actor.name)} does not have enough ${price.denomination.toUpperCase()} for ${escapeHTML(catalogEntry.title)}.`;
    await whisperPurchase(message, buyer);
    return sendPurchaseResult(request.userId, { ok: false, message: stripHTML(message) });
  }
  const itemData = sourceItem.toObject();
  delete itemData._id;
  delete itemData.folder;
  delete itemData.ownership;
  delete itemData.sort;
  let created;
  try {
    created = await actor.createEmbeddedDocuments("Item", [itemData]);
    if (price.value > 0) await actor.update({ [currencyPath]: balance - price.value });
  } catch (error) {
    if (created?.[0]) await created[0].delete().catch(() => undefined);
    console.error(`${MODULE_ID} | Purchase failed`, error);
    return sendPurchaseResult(request.userId, { ok: false, message: "Foundry could not complete that purchase. The GM has been notified." });
  }
  const message = `${escapeHTML(actor.name)} purchased <strong>${escapeHTML(catalogEntry.title)}</strong> for ${price.value} ${price.denomination.toUpperCase()}.`;
  await whisperPurchase(message, buyer);
  return sendPurchaseResult(request.userId, { ok: true, message: stripHTML(message) });
}

class PocketChronicleApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "pocket-chronicle-app",
    tag: "section",
    classes: ["pocket-chronicle-app"],
    window: { frame: false },
    position: { width: 480, height: 820 }
  };

  static PARTS = { main: { template: TEMPLATE } };

  constructor(options = {}) {
    super(options);
    this.activeTab = "home";
    this.journalUuid = null;
    this.sharedId = null;
  }

  get activeActorDocument() {
    const actors = ownedCharacters();
    const selected = game.settings.get(MODULE_ID, "activeActorId");
    return actors.find((actor) => actor.id === selected) ?? actors.find((actor) => actor.id === game.user.character?.id) ?? actors[0] ?? null;
  }

  async _prepareContext(options) {
    const actors = ownedCharacters();
    const activeActor = this.activeActorDocument;
    const shared = await prepareShared();
    const settings = game.settings.settings;
    const hasNoCanvasSetting = settings.has("core.noCanvas");
    const mapFreeEnabled = hasNoCanvasSetting ? Boolean(game.settings.get("core", "noCanvas")) : false;
    const tabs = Object.fromEntries(["home", "sheet", "journals", "shared", "shop", "chat", "gm"].map((tab) => [tab, this.activeTab === tab]));
    return {
      tabs,
      isGM: game.user.isGM,
      actors: actors.map((actor) => ({ id: actor.id, name: actor.name, selected: actor.id === activeActor?.id })),
      activeActor: prepareActor(activeActor),
      journals: this.activeTab === "journals" ? prepareJournals() : [],
      journalView: this.journalUuid ? await resolveJournalPage(this.journalUuid) : null,
      shared,
      sharedPreview: shared.slice(0, 4),
      sharedView: this.sharedId ? await this._resolveSharedView(this.sharedId) : null,
      shop: prepareShop(),
      messages: this.activeTab === "chat" ? await prepareMessages() : [],
      dice: [4, 6, 8, 10, 12, 20, 100],
      mapFreeEnabled,
      canEnableMapFree: hasNoCanvasSetting && !mapFreeEnabled
    };
  }

  async _resolveSharedView(id) {
    const entry = safeArraySetting("sharedFeed").find((candidate) => candidate.id === id);
    if (!entry) return null;
    if (entry.kind === "image") return { title: entry.title, image: entry.image, html: entry.caption ? `<p>${escapeHTML(entry.caption)}</p>` : "" };
    if (entry.kind === "snapshot") {
      const html = await TextEditor.enrichHTML(entry.content ?? "", { async: true, secrets: false, documents: true });
      return { title: entry.title, image: entry.image, html };
    }
    return resolveJournalPage(entry.uuid);
  }

  _onRender(context, options) {
    super._onRender(context, options);
    applyDeviceMode();
    document.body.classList.add("pc-interface-open");
    const root = this.element;
    root.querySelectorAll("[data-action]").forEach((element) => element.addEventListener("click", (event) => this._handleAction(event)));
    root.querySelector("[data-action='select-actor']")?.addEventListener("change", (event) => this._selectActor(event));
    root.querySelector("[data-journal-search]")?.addEventListener("input", (event) => this._filterJournals(event));
    root.querySelector("[data-chat-form]")?.addEventListener("submit", (event) => this._sendChat(event));
    root.querySelector("[data-formula-form]")?.addEventListener("submit", (event) => this._rollFormula(event));
    root.querySelector("[data-image-form]")?.addEventListener("submit", (event) => this._publishImage(event));
    root.querySelectorAll("[data-dropzone]").forEach((zone) => {
      zone.addEventListener("dragover", (event) => { event.preventDefault(); zone.classList.add("is-dragging"); });
      zone.addEventListener("dragleave", () => zone.classList.remove("is-dragging"));
      zone.addEventListener("drop", (event) => this._handleDrop(event, zone.dataset.dropzone));
    });
    root.querySelectorAll(".pc-chat-message .dice-total").forEach((total) => total.addEventListener("click", () => total.closest(".dice-roll")?.classList.toggle("expanded")));
    if (this.activeTab === "chat") requestAnimationFrame(() => {
      const log = root.querySelector("[data-chat-log]");
      if (log) log.scrollTop = log.scrollHeight;
    });
  }

  async close(options = {}) {
    document.body.classList.remove("pc-interface-open");
    return super.close(options);
  }

  async _handleAction(event) {
    const button = event.currentTarget;
    const action = button.dataset.action;
    try {
      if (action === "close") return this.close();
      if (action === "go") {
        this.activeTab = button.dataset.tab;
        this.journalUuid = null;
        this.sharedId = null;
        return this.render({ force: true });
      }
      if (action === "native-sheet") return this._openNativeSheet();
      if (action === "adjust-hp") return this._adjustHP(Number(button.dataset.delta));
      if (action === "actor-roll") return this._actorRoll(button.dataset.kind, button.dataset.key);
      if (action === "rest") return this._rest(button.dataset.rest);
      if (action === "open-item") return this._openItem(button.dataset.itemId);
      if (action === "use-item") return this._useItem(button.dataset.itemId, event);
      if (action === "open-journal") { this.journalUuid = button.dataset.uuid; return this.render({ force: true }); }
      if (action === "close-journal") { this.journalUuid = null; return this.render({ force: true }); }
      if (action === "open-shared") { this.activeTab = "shared"; this.sharedId = button.dataset.id; return this.render({ force: true }); }
      if (action === "close-shared") { this.sharedId = null; return this.render({ force: true }); }
      if (action === "purchase") return this._purchase(button.dataset.id, button);
      if (action === "roll-die") return this._rollDie(Number(button.dataset.faces));
      if (action === "refresh-chat") return this.render({ force: true });
      if (action === "enable-map-free") return this._enableMapFree();
      if (action === "pick-image") return this._pickImage();
      if (action === "remove-shared") return this._removeSettingEntry("sharedFeed", button.dataset.id);
      if (action === "remove-shop") return this._removeSettingEntry("shopCatalog", button.dataset.id);
    } catch (error) {
      console.error(`${MODULE_ID} | Action failed`, error);
      ui.notifications.error(`Pocket Chronicle: ${error.message ?? "That action could not be completed."}`);
    }
  }

  async _selectActor(event) {
    await game.settings.set(MODULE_ID, "activeActorId", event.currentTarget.value);
    this.render({ force: true });
  }

  _filterJournals(event) {
    const query = event.currentTarget.value.trim().toLocaleLowerCase();
    this.element.querySelectorAll("[data-search-text]").forEach((card) => card.hidden = query && !card.dataset.searchText.includes(query));
  }

  async _openNativeSheet() {
    const actor = this.activeActorDocument;
    if (!actor) return ui.notifications.warn("Pocket Chronicle: Select a character first.");
    document.body.classList.add("pc-native-sheet-mode");
    try { actor.sheet.render({ force: true }); } catch (_error) { actor.sheet.render(true); }
    for (const delay of [0, 100, 350]) setTimeout(() => {
      const candidate = actor.sheet.element;
      const element = candidate instanceof HTMLElement ? candidate : candidate?.[0];
      element?.classList.add("pc-mobile-native-sheet");
    }, delay);
  }

  async _adjustHP(delta) {
    const actor = this.activeActorDocument;
    if (!actor?.isOwner && !game.user.isGM) return;
    const value = Number(getProperty(actor, "system.attributes.hp.value")) || 0;
    const maximum = Math.max(value, Number(getProperty(actor, "system.attributes.hp.max")) || 0);
    await actor.update({ "system.attributes.hp.value": clamp(value + delta, 0, maximum) });
  }

  async _actorRoll(kind, key) {
    const actor = this.activeActorDocument;
    if (!actor) return;
    if (kind === "skill" && typeof actor.rollSkill === "function") return actor.rollSkill(key);
    if (kind === "save" && typeof actor.rollAbilitySave === "function") return actor.rollAbilitySave(key);
    if (kind === "ability" && typeof actor.rollAbilityCheck === "function") return actor.rollAbilityCheck(key);
    const ability = getProperty(actor, `system.abilities.${key}`);
    if (typeof ability?.roll === "function") return ability.roll({ type: kind });
    ui.notifications.info("Pocket Chronicle opened the full sheet because this game system handles that roll there.");
    return this._openNativeSheet();
  }

  async _rest(type) {
    const actor = this.activeActorDocument;
    const method = type === "long" ? actor?.longRest : actor?.shortRest;
    if (typeof method === "function") return method.call(actor);
    ui.notifications.info("This game system handles rests on its full character sheet.");
    return this._openNativeSheet();
  }

  _findItem(id) {
    return this.activeActorDocument?.items?.get(id) ?? null;
  }

  _openItem(id) {
    const item = this._findItem(id);
    if (!item) return;
    try { return item.sheet.render({ force: true }); } catch (_error) { return item.sheet.render(true); }
  }

  async _useItem(id, event) {
    const item = this._findItem(id);
    if (!item) return;
    const activities = Array.from(getProperty(item, "system.activities") ?? []);
    const activity = activities.find((candidate) => typeof candidate?.use === "function" && candidate.type !== "passive");
    if (activity) return activity.use({ event });
    if (typeof item.use === "function") return item.use({}, { event });
    return this._openItem(id);
  }

  async _sendChat(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const message = new FormData(form).get("message")?.trim();
    if (!message) return;
    form.querySelector("textarea").value = "";
    if (typeof ui.chat?.processMessage === "function") await ui.chat.processMessage(message);
    else await ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor: this.activeActorDocument }),
      content: escapeHTML(message)
    });
  }

  async _rollDie(faces) {
    const count = this.element.querySelector("[data-dice-count]")?.value ?? 1;
    const modifier = this.element.querySelector("[data-dice-modifier]")?.value ?? 0;
    const mode = this.element.querySelector("[data-dice-mode]")?.value ?? "normal";
    return this._roll(makeDiceFormula(faces, count, modifier, mode), `Pocket d${faces}`);
  }

  async _rollFormula(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formula = new FormData(form).get("formula")?.trim();
    if (!formula) return;
    await this._roll(formula, "Pocket dice");
    form.reset();
  }

  async _roll(formula, flavor) {
    const actor = this.activeActorDocument;
    const roll = await new Roll(formula, actor?.getRollData?.() ?? {}).evaluate();
    return roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor
    });
  }

  async _purchase(shopId, button) {
    const actor = this.activeActorDocument;
    if (!actor) return ui.notifications.warn("Pocket Chronicle: Select a character first.");
    const gm = primaryActiveGM();
    if (!gm) return ui.notifications.warn("Pocket Shop needs an active GM to complete purchases.");
    button.disabled = true;
    game.socket.emit(SOCKET_NAME, {
      type: "purchase-request",
      userId: game.user.id,
      actorUuid: actor.uuid,
      shopId
    });
    ui.notifications.info("Purchase sent to the GM…");
    setTimeout(() => { if (button.isConnected) button.disabled = false; }, 2500);
  }

  async _enableMapFree() {
    if (!game.settings.settings.has("core.noCanvas")) return;
    await game.settings.set("core", "noCanvas", true);
    window.location.reload();
  }

  _pickImage() {
    const input = this.element.querySelector("[data-image-form] input[name='image']");
    if (!input || typeof FilePicker !== "function") return;
    new FilePicker({ type: "image", current: input.value, callback: (path) => { input.value = path; } }).browse();
  }

  async _publishImage(event) {
    event.preventDefault();
    if (!game.user.isGM) return;
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    const entries = safeArraySetting("sharedFeed");
    entries.push({
      id: foundry.utils.randomID(),
      kind: "image",
      title: String(data.title).trim(),
      image: String(data.image).trim(),
      caption: String(data.caption ?? "").trim()
    });
    await game.settings.set(MODULE_ID, "sharedFeed", entries);
    form.reset();
    this.render({ force: true });
  }

  async _handleDrop(event, target) {
    event.preventDefault();
    event.currentTarget.classList.remove("is-dragging");
    if (!game.user.isGM) return;
    const data = TextEditor.getDragEventData(event);
    const uuid = data.uuid;
    const document = uuid ? await fromUuid(uuid).catch(() => null) : null;
    if (!document) return ui.notifications.warn("Pocket Chronicle could not read that dropped document.");
    if (target === "shared") {
      if (!["JournalEntry", "JournalEntryPage"].includes(document.documentName)) return ui.notifications.warn("Drop a Journal Entry or Journal page here.");
      let page = document;
      if (document.documentName === "JournalEntry") page = Array.from(document.pages ?? [])[0] ?? document;
      const content = page.documentName === "JournalEntryPage" && page.type === "text" ? removeJournalSecrets(getProperty(page, "text.content")) : "";
      const image = page.documentName === "JournalEntryPage" && page.type === "image" ? page.src : null;
      const entries = safeArraySetting("sharedFeed");
      const snapshot = {
        id: foundry.utils.randomID(),
        kind: "snapshot",
        uuid: document.uuid,
        title: page.name ?? document.name,
        image,
        content,
        caption: stripHTML(content) || "Shared journal handout"
      };
      const existing = entries.findIndex((entry) => entry.uuid === document.uuid);
      if (existing >= 0) snapshot.id = entries[existing].id;
      if (existing >= 0) entries.splice(existing, 1, snapshot);
      else entries.push(snapshot);
      await game.settings.set(MODULE_ID, "sharedFeed", entries);
    }
    if (target === "shop") {
      if (document.documentName !== "Item") return ui.notifications.warn("Drop an Item here.");
      const listed = getProperty(document, "system.price") ?? {};
      const price = normalizePrice(listed.value ?? 0, listed.denomination ?? "gp");
      const entries = safeArraySetting("shopCatalog");
      if (!entries.some((entry) => entry.uuid === document.uuid)) entries.push({
        id: foundry.utils.randomID(),
        uuid: document.uuid,
        title: document.name,
        img: document.img,
        type: document.type,
        description: stripHTML(getProperty(document, "system.description.value") ?? "", 220),
        price: price.value,
        denomination: price.denomination
      });
      await game.settings.set(MODULE_ID, "shopCatalog", entries);
    }
    this.render({ force: true });
  }

  async _removeSettingEntry(key, id) {
    if (!game.user.isGM) return;
    await game.settings.set(MODULE_ID, key, safeArraySetting(key).filter((entry) => entry.id !== id));
    this.render({ force: true });
  }
}

function registerSettings() {
  game.settings.register(MODULE_ID, "showLauncher", {
    name: "POCKET_CHRONICLE.Settings.ShowLauncher.Name",
    hint: "POCKET_CHRONICLE.Settings.ShowLauncher.Hint",
    scope: "client", config: true, type: Boolean, default: true,
    onChange: () => installLauncher()
  });
  game.settings.register(MODULE_ID, "chatLimit", {
    name: "POCKET_CHRONICLE.Settings.CompactChat.Name",
    hint: "POCKET_CHRONICLE.Settings.CompactChat.Hint",
    scope: "client", config: true, type: Number, default: 30,
    range: { min: 10, max: 100, step: 10 }
  });
  game.settings.register(MODULE_ID, "activeActorId", { scope: "client", config: false, type: String, default: "" });
  game.settings.register(MODULE_ID, "sharedFeed", { scope: "world", config: false, type: Object, default: [] });
  game.settings.register(MODULE_ID, "shopCatalog", { scope: "world", config: false, type: Object, default: [] });
}

function getPocketApp() {
  pocketApp ??= new PocketChronicleApp();
  return pocketApp;
}

function togglePocket() {
  const app = getPocketApp();
  if (app.rendered) app.close();
  else app.render({ force: true });
}

function installLauncher() {
  document.getElementById("pc-launcher")?.remove();
  if (!game.settings.get(MODULE_ID, "showLauncher")) return;
  const button = document.createElement("button");
  button.id = "pc-launcher";
  button.type = "button";
  button.title = "Open Pocket Chronicle";
  button.setAttribute("aria-label", "Open Pocket Chronicle");
  button.innerHTML = '<i class="fa-solid fa-mobile-screen-button" aria-hidden="true"></i>';
  button.addEventListener("click", togglePocket);
  document.body.append(button);
}

const refreshPocket = debounce((reason) => {
  const app = pocketApp;
  if (!app?.rendered) return;
  const relevant = {
    actor: ["home", "sheet", "shop"],
    item: ["sheet", "shop", "gm"],
    journal: ["journals", "shared", "gm", "home"],
    chat: ["chat"]
  };
  if (relevant[reason]?.includes(app.activeTab)) app.render({ force: true });
}, 180);

Hooks.once("init", () => {
  registerSettings();
  game.keybindings.register(MODULE_ID, "toggle", {
    name: "Open or close Pocket Chronicle",
    hint: "A map-free phone interface for the current player.",
    editable: [{ key: "KeyP" }],
    onDown: () => { togglePocket(); return true; },
    restricted: false,
    precedence: CONST.KEYBINDING_PRECEDENCE?.NORMAL ?? 0
  });
});

Hooks.once("ready", () => {
  applyDeviceMode();
  installLauncher();
  game.socket.on(SOCKET_NAME, async (data) => {
    if (data?.type === "purchase-request" && game.user.isGM && primaryActiveGM()?.id === game.user.id) await fulfillPurchase(data);
    if (data?.type === "purchase-result" && data.targetUserId === game.user.id) {
      ui.notifications[data.ok ? "info" : "warn"](`Pocket Shop: ${data.message}`);
      refreshPocket("actor");
    }
  });
});

for (const hook of ["createActor", "updateActor", "deleteActor"]) Hooks.on(hook, () => refreshPocket("actor"));
for (const hook of ["createItem", "updateItem", "deleteItem"]) Hooks.on(hook, () => refreshPocket("item"));
for (const hook of ["createJournalEntry", "updateJournalEntry", "deleteJournalEntry", "createJournalEntryPage", "updateJournalEntryPage", "deleteJournalEntryPage"]) Hooks.on(hook, () => refreshPocket("journal"));
for (const hook of ["createChatMessage", "updateChatMessage", "deleteChatMessage"]) Hooks.on(hook, () => refreshPocket("chat"));
Hooks.on("updateSetting", (setting) => {
  if (setting.key === `${MODULE_ID}.sharedFeed`) refreshPocket("journal");
  if (setting.key === `${MODULE_ID}.shopCatalog`) refreshPocket("item");
});
Hooks.on("closeActorSheet", () => document.body.classList.remove("pc-native-sheet-mode"));

Hooks.once("ready", () => {
  game.modules.get(MODULE_ID).api = {
    open: () => getPocketApp().render({ force: true }),
    close: () => getPocketApp().close(),
    toggle: togglePocket
  };
});
