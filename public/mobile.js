(function () {
  "use strict";

  var ACCOUNT_STORAGE = "pocket-chronicle-account";
  var CHARACTER_STORAGE = "pocket-chronicle-character";
  var state = {
    tab: "home",
    snapshot: null,
    characters: [],
    account: readStoredAccount(),
    bridgeOnline: false,
    selectedJournal: null,
    sheetCategory: "action",
    campaignId: "",
    campaignCode: "",
    campaignName: "",
    accounts: [],
    selectedAccountId: "",
    accessRequest: null,
    approvalTimer: 0,
    installPrompt: null,
    refreshTimer: 0
  };

  var elements = {};

  document.addEventListener("DOMContentLoaded", start);

  function start() {
    elements.shell = document.getElementById("chronicle");
    elements.gate = document.getElementById("gate");
    elements.gateTitle = document.getElementById("gate-title");
    elements.gateCopy = document.getElementById("gate-copy");
    elements.gateContent = document.getElementById("gate-content");
    elements.gateFooter = document.getElementById("gate-footer");
    elements.appView = document.getElementById("app-view");
    elements.viewContent = document.getElementById("view-content");
    elements.statusStrip = document.getElementById("status-strip");
    elements.statusLabel = document.getElementById("status-label");
    elements.accountButton = document.getElementById("account-button");
    elements.brandHome = document.getElementById("brand-home");
    elements.modal = document.getElementById("modal");
    elements.modalContent = document.getElementById("modal-content");
    elements.modalCloseArea = document.getElementById("modal-close-area");
    elements.modalDone = document.getElementById("modal-done");
    elements.toast = document.getElementById("toast");

    elements.brandHome.addEventListener("click", function () { selectTab("home"); });
    elements.accountButton.addEventListener("click", openSettings);
    elements.modalCloseArea.addEventListener("click", closeSettings);
    elements.modalDone.addEventListener("click", closeSettings);
    elements.appView.addEventListener("click", handleAppClick);
    elements.appView.addEventListener("submit", handleAppSubmit);
    elements.appView.addEventListener("change", handleAppChange);
    elements.gateContent.addEventListener("submit", handleGateSubmit);
    elements.gateContent.addEventListener("click", handleGateClick);

    window.addEventListener("beforeinstallprompt", function (event) {
      event.preventDefault();
      state.installPrompt = event;
    });
    window.addEventListener("online", loadState);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") loadState(true);
    });
    window.addEventListener("error", function () {
      showToast("Pocket Chronicle hit a screen error. Your campaign data is safe; tap Home to refresh this view.", 6500);
    });
    window.addEventListener("unhandledrejection", function () {
      showToast("The phone could not finish that request. Check the connection and try once more.", 6500);
    });

    loadState();
    state.refreshTimer = window.setInterval(function () {
      if (document.visibilityState === "visible") loadState(true);
    }, 30000);
  }

  function readStoredAccount() {
    try {
      return JSON.parse(window.localStorage.getItem(ACCOUNT_STORAGE) || "null");
    } catch {
      window.localStorage.removeItem(ACCOUNT_STORAGE);
      return null;
    }
  }

  function setStoredAccount(account) {
    state.account = account;
    if (account) window.localStorage.setItem(ACCOUNT_STORAGE, JSON.stringify(account));
    else window.localStorage.removeItem(ACCOUNT_STORAGE);
  }

  async function api(path, options) {
    var response;
    try {
      response = await fetch(path, Object.assign({ cache: "no-store", credentials: "same-origin" }, options || {}));
    } catch {
      return { ok: false, status: 0, data: { error: "This phone could not reach Pocket Chronicle." } };
    }
    var data = {};
    try { data = await response.json(); } catch { data = {}; }
    return { ok: response.ok, status: response.status, data: data };
  }

  function post(path, body) {
    return api(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
  }

  async function loadState(silent) {
    var storedActor = window.localStorage.getItem(CHARACTER_STORAGE) || "";
    var path = storedActor ? "/api/state?actorUuid=" + encodeURIComponent(storedActor) : "/api/state";
    if (!silent) showChecking();
    var result = await api(path);

    if (result.ok && result.data.snapshot) {
      state.snapshot = result.data.snapshot;
      state.bridgeOnline = Boolean(result.data.bridgeOnline);
      state.characters = result.data.characters || [actorChoice(result.data.snapshot.actor)];
      if (result.data.account) {
        setStoredAccount({
          id: result.data.account.id,
          playerLabel: result.data.account.playerLabel,
          campaignName: result.data.snapshot.campaign.name
        });
      }
      window.localStorage.setItem(CHARACTER_STORAGE, result.data.snapshot.actor.uuid);
      showApp();
      return;
    }

    if (silent && state.snapshot) {
      state.bridgeOnline = false;
      updateStatus();
      return;
    }
    if (result.status === 401 && state.account) {
      showSignIn();
      return;
    }
    if (result.status === 404) {
      showMessageGate("Waiting for your character", result.data.error || "This account is connected, but Foundry has not sent its character yet.", "Check again", loadState);
      return;
    }
    if (result.status === 503 || result.status === 0) {
      showMessageGate("Pocket Chronicle is offline", result.data.error || "This phone could not reach the Pocket Chronicle service.", "Try again", loadState);
      return;
    }
    showCampaignConnect();
  }

  function actorChoice(actor) {
    return {
      uuid: actor.uuid,
      name: actor.name,
      portrait: actor.portrait,
      ancestry: actor.ancestry,
      classLabel: actor.classLabel,
      level: actor.level
    };
  }

  function showChecking() {
    showGate("Checking your table…", "Looking for your saved Pocket Chronicle account.");
    elements.gateContent.replaceChildren(create("div", "loading-line"));
  }

  function showGate(title, copy) {
    elements.gate.hidden = false;
    elements.gateFooter.hidden = false;
    elements.appView.hidden = true;
    elements.statusStrip.hidden = true;
    elements.accountButton.hidden = true;
    elements.gateTitle.textContent = title;
    elements.gateCopy.textContent = copy;
  }

  function showMessageGate(title, copy, buttonLabel, action) {
    showGate(title, copy);
    var button = create("button", "primary-button full-button", buttonLabel);
    button.type = "button";
    button.addEventListener("click", action);
    elements.gateContent.replaceChildren(button);
  }

  function showCampaignConnect(error) {
    stopApprovalPoll();
    showGate("Connect your campaign", "Enter the Campaign ID and permanent six-character Campaign code your GM saved in Foundry.");
    var form = create("form", "field-stack");
    form.dataset.form = "campaign";
    form.appendChild(labelledInput("Campaign ID", "campaign-id", "text", state.campaignId, "salt-and-sacrifice"));
    var codeField = labelledInput("Campaign code", "campaign-code", "text", state.campaignCode, "ABC123");
    codeField.querySelector("input").className = "campaign-code";
    codeField.querySelector("input").maxLength = 6;
    codeField.querySelector("input").setAttribute("autocapitalize", "characters");
    codeField.querySelector("input").setAttribute("autocomplete", "off");
    form.appendChild(codeField);
    appendError(form, error);
    form.appendChild(submitButton("Find my campaign"));
    elements.gateContent.replaceChildren(form);
  }

  function showAccountPicker(error) {
    showGate("Choose your account", "Select the Foundry player account you use in " + (state.campaignName || "this campaign") + ".");
    var form = create("form", "field-stack");
    form.dataset.form = "account";
    var list = create("div", "account-list");
    state.accounts.forEach(function (account, index) {
      var wrapper = create("div", "account-option");
      var input = document.createElement("input");
      input.type = "radio";
      input.name = "account";
      input.id = "account-" + index;
      input.value = account.id;
      input.checked = account.id === state.selectedAccountId;
      var label = document.createElement("label");
      label.htmlFor = input.id;
      var copy = document.createElement("span");
      copy.appendChild(create("strong", "", account.playerLabel));
      copy.appendChild(create("small", "", account.characterCount + (account.characterCount === 1 ? " character" : " characters")));
      label.appendChild(copy);
      label.appendChild(create("small", "", account.hasPassword ? "Password ready" : "First setup"));
      wrapper.appendChild(input);
      wrapper.appendChild(label);
      list.appendChild(wrapper);
    });
    form.appendChild(list);
    appendError(form, error);
    form.appendChild(submitButton("Continue"));
    form.appendChild(textButton("Use a different campaign", "restart-pairing"));
    elements.gateContent.replaceChildren(form);
  }

  function showSignIn(error) {
    var name = state.account && state.account.playerLabel ? state.account.playerLabel : "adventurer";
    showGate("Welcome back, " + name, "Enter this Foundry account’s Pocket Chronicle password. No new GM approval is needed.");
    var form = create("form", "field-stack");
    form.dataset.form = "signin";
    form.appendChild(labelledInput("Account password", "account-password", "password", "", "Your password"));
    appendError(form, error);
    form.appendChild(submitButton("Sign in"));
    form.appendChild(textButton("Forgot or reset this password", "reset-password"));
    form.appendChild(textButton("Use a different campaign", "restart-pairing"));
    elements.gateContent.replaceChildren(form);
  }

  function showPasswordResetConnect(error) {
    var name = state.account && state.account.playerLabel ? state.account.playerLabel : "this account";
    showGate("Reset " + name + "’s password", "Re-enter the Campaign ID and six-character Campaign code. A reset request will be sent to your GM in Foundry.");
    var form = create("form", "field-stack");
    form.dataset.form = "password-reset-campaign";
    form.appendChild(labelledInput("Campaign ID", "reset-campaign-id", "text", state.campaignId, "salt-and-sacrifice"));
    var codeField = labelledInput("Campaign code", "reset-campaign-code", "text", state.campaignCode, "ABC123");
    codeField.querySelector("input").className = "campaign-code";
    codeField.querySelector("input").maxLength = 6;
    codeField.querySelector("input").setAttribute("autocapitalize", "characters");
    codeField.querySelector("input").setAttribute("autocomplete", "off");
    form.appendChild(codeField);
    appendError(form, error);
    form.appendChild(submitButton("Ask GM to reset password"));
    form.appendChild(textButton("Back to sign in", "back-to-signin"));
    elements.gateContent.replaceChildren(form);
  }

  function showApprovalWaiting() {
    var label = state.accessRequest ? state.accessRequest.playerLabel : "this account";
    var isReset = state.accessRequest && state.accessRequest.kind === "password-reset";
    showGate("Waiting for your GM", "The " + (isReset ? "password reset" : "phone setup") + " request for " + label + " is in Foundry. Keep this screen open while the GM approves it.");
    var panel = create("div", "sheet-panel");
    panel.appendChild(create("strong", "", isReset ? "Password reset requested" : "Approval request sent"));
    panel.appendChild(create("small", "", "This request stays active for ten minutes."));
    elements.gateContent.replaceChildren(panel, textButton("Cancel and start again", "restart-pairing"));
    startApprovalPoll();
  }

  function showCreatePassword(error) {
    stopApprovalPoll();
    var isReset = state.accessRequest && state.accessRequest.kind === "password-reset";
    showGate("Create your new password", "Your GM approved " + (isReset ? "the password reset" : "this first setup") + ". Create a new password for this Foundry account on Pocket Chronicle.");
    var form = create("form", "field-stack");
    form.dataset.form = "create-password";
    form.appendChild(labelledInput("New password", "new-password", "password", "", "At least 6 characters"));
    form.appendChild(labelledInput("Confirm password", "confirm-password", "password", "", "Enter it again"));
    appendError(form, error);
    form.appendChild(submitButton("Finish setup"));
    elements.gateContent.replaceChildren(form);
  }

  function labelledInput(labelText, id, type, value, placeholder) {
    var label = create("label", "field-label", labelText);
    label.htmlFor = id;
    var input = document.createElement("input");
    input.id = id;
    input.name = id;
    input.type = type;
    input.value = value || "";
    input.placeholder = placeholder || "";
    input.required = true;
    if (type === "password") input.autocomplete = id === "account-password" ? "current-password" : "new-password";
    label.appendChild(input);
    return label;
  }

  function submitButton(text) {
    var button = create("button", "primary-button full-button", text);
    button.type = "submit";
    return button;
  }

  function textButton(text, action) {
    var button = create("button", "text-button full-button", text);
    button.type = "button";
    button.dataset.action = action;
    return button;
  }

  function appendError(parent, error) {
    if (error) parent.appendChild(create("p", "form-error", error));
  }

  async function handleGateSubmit(event) {
    event.preventDefault();
    var form = event.target;
    var kind = form.dataset.form;
    disableSubmit(form, true);
    if (kind === "campaign") await connectCampaign(form);
    else if (kind === "account") await chooseAccount(form);
    else if (kind === "signin") await signIn(form);
    else if (kind === "password-reset-campaign") await requestPasswordReset(form);
    else if (kind === "create-password") await completeApproval(form);
    if (form.isConnected) disableSubmit(form, false);
  }

  function handleGateClick(event) {
    var button = event.target.closest("button[data-action]");
    if (!button) return;
    if (button.dataset.action === "restart-pairing") restartPairing();
    else if (button.dataset.action === "reset-password") {
      if (state.campaignId && state.campaignCode) requestPasswordReset();
      else showPasswordResetConnect();
    } else if (button.dataset.action === "back-to-signin") showSignIn();
  }

  function disableSubmit(form, disabled) {
    var button = form.querySelector("button[type=submit]");
    if (button) button.disabled = disabled;
  }

  function normalizeCode(value) {
    return value.replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase().replace(/O/g, "0").replace(/[IL]/g, "1");
  }

  async function connectCampaign(form) {
    state.campaignId = form.querySelector("#campaign-id").value.trim();
    state.campaignCode = normalizeCode(form.querySelector("#campaign-code").value);
    if (state.campaignCode.length !== 6) {
      showCampaignConnect("Enter the complete six-character Campaign code.");
      return;
    }
    var result = await post("/api/campaign/connect", { campaignId: state.campaignId, campaignCode: state.campaignCode });
    if (!result.ok || !result.data.campaign || !result.data.accounts || !result.data.accounts.length) {
      showCampaignConnect(result.data.error || "That campaign could not be connected.");
      return;
    }
    state.campaignId = result.data.campaign.id;
    state.campaignName = result.data.campaign.name;
    state.accounts = result.data.accounts;
    state.selectedAccountId = result.data.accounts[0].id;
    showAccountPicker();
  }

  async function chooseAccount(form) {
    var selected = form.querySelector("input[name=account]:checked");
    if (!selected) {
      showAccountPicker("Choose your own Foundry player account.");
      return;
    }
    state.selectedAccountId = selected.value;
    var account = state.accounts.find(function (item) { return item.id === state.selectedAccountId; });
    if (!account) {
      showAccountPicker("That account is no longer available.");
      return;
    }
    setStoredAccount({ id: account.id, playerLabel: account.playerLabel, campaignName: state.campaignName });
    if (account.hasPassword) {
      showSignIn();
      return;
    }
    var result = await post("/api/campaign/access-requests", {
      campaignId: state.campaignId,
      campaignCode: state.campaignCode,
      accountId: account.id
    });
    if (!result.ok || !result.data.requestId || !result.data.requestToken) {
      showAccountPicker(result.data.error || "That phone request could not be sent.");
      return;
    }
    state.accessRequest = {
      id: result.data.requestId,
      token: result.data.requestToken,
      kind: result.data.requestKind || "first-time",
      playerLabel: result.data.playerLabel,
      campaignName: result.data.campaignName
    };
    state.campaignCode = "";
    showApprovalWaiting();
  }

  async function signIn(form) {
    var password = form.querySelector("#account-password").value;
    if (!state.account || !state.account.id) {
      restartPairing();
      return;
    }
    var result = await post("/api/sign-in", { accountId: state.account.id, password: password });
    if (!result.ok || !result.data.account) {
      showSignIn(result.data.error || "That account could not be signed in.");
      return;
    }
    setStoredAccount(result.data.account);
    await loadState();
  }

  async function requestPasswordReset(form) {
    if (!state.account || !state.account.id) {
      restartPairing();
      return;
    }
    if (form) {
      state.campaignId = form.querySelector("#reset-campaign-id").value.trim();
      state.campaignCode = normalizeCode(form.querySelector("#reset-campaign-code").value);
    }
    if (!state.campaignId || state.campaignCode.length !== 6) {
      showPasswordResetConnect("Enter the complete Campaign ID and six-character Campaign code.");
      return;
    }
    var result = await post("/api/campaign/access-requests", {
      campaignId: state.campaignId,
      campaignCode: state.campaignCode,
      accountId: state.account.id
    });
    if (!result.ok || !result.data.requestId || !result.data.requestToken) {
      showPasswordResetConnect(result.data.error || "That password reset request could not be sent.");
      return;
    }
    state.accessRequest = {
      id: result.data.requestId,
      token: result.data.requestToken,
      kind: "password-reset",
      playerLabel: result.data.playerLabel,
      campaignName: result.data.campaignName
    };
    state.campaignCode = "";
    showApprovalWaiting();
  }

  function startApprovalPoll() {
    stopApprovalPoll();
    pollApproval();
  }

  async function pollApproval() {
    if (!state.accessRequest) return;
    var result = await post("/api/campaign/access-requests/" + encodeURIComponent(state.accessRequest.id), {
      requestToken: state.accessRequest.token
    });
    if (result.ok && result.data.status === "approved") {
      showCreatePassword();
      return;
    }
    if (result.ok && (result.data.status === "denied" || result.data.status === "expired")) {
      var message = result.data.status === "denied" ? "The GM denied this request." : "That request expired. Please start again.";
      state.accessRequest = null;
      showCampaignConnect(message);
      return;
    }
    state.approvalTimer = window.setTimeout(pollApproval, 2500);
  }

  function stopApprovalPoll() {
    if (state.approvalTimer) window.clearTimeout(state.approvalTimer);
    state.approvalTimer = 0;
  }

  async function completeApproval(form) {
    var password = form.querySelector("#new-password").value;
    var confirm = form.querySelector("#confirm-password").value;
    if (password.length < 6) {
      showCreatePassword("Use at least six characters.");
      return;
    }
    if (password !== confirm) {
      showCreatePassword("Those passwords do not match.");
      return;
    }
    if (!state.accessRequest) {
      showCampaignConnect("That approval request is no longer available.");
      return;
    }
    var result = await post("/api/campaign/access-requests/" + encodeURIComponent(state.accessRequest.id) + "/complete", {
      requestToken: state.accessRequest.token,
      password: password
    });
    if (!result.ok || !result.data.account) {
      showCreatePassword(result.data.error || "The account setup could not be completed.");
      return;
    }
    setStoredAccount(result.data.account);
    state.accessRequest = null;
    await loadState();
  }

  function restartPairing() {
    stopApprovalPoll();
    setStoredAccount(null);
    window.localStorage.removeItem(CHARACTER_STORAGE);
    state.snapshot = null;
    state.characters = [];
    state.campaignId = "";
    state.campaignCode = "";
    state.accounts = [];
    state.accessRequest = null;
    closeSettings();
    showCampaignConnect();
  }

  function showApp() {
    elements.gate.hidden = true;
    elements.gateFooter.hidden = true;
    elements.appView.hidden = false;
    elements.statusStrip.hidden = false;
    elements.accountButton.hidden = false;
    updateStatus();
    renderCurrentView();
  }

  function updateStatus() {
    if (!state.snapshot) return;
    elements.statusStrip.classList.toggle("offline", !state.bridgeOnline);
    elements.statusLabel.textContent = state.bridgeOnline
      ? "Connected to " + state.snapshot.campaign.name
      : state.snapshot.campaign.name + " · saved data · Foundry sleeping";
  }

  function selectTab(tab) {
    if (!state.snapshot) return;
    state.tab = tab;
    if (tab !== "journal") state.selectedJournal = null;
    elements.appView.querySelectorAll(".bottom-nav button").forEach(function (button) {
      button.classList.toggle("active", button.dataset.tab === tab);
    });
    renderCurrentView();
  }

  function renderCurrentView() {
    if (!state.snapshot) return;
    if (state.tab === "home") renderHome();
    else if (state.tab === "character") renderCharacter();
    else if (state.tab === "journal") renderJournal();
    else if (state.tab === "chat") renderChat();
    else if (state.tab === "shop") renderShop();
    elements.viewContent.scrollTop = 0;
  }

  function pageTitle(eyebrow, title, copy) {
    var section = create("section", "page-title");
    section.appendChild(create("p", "eyebrow", eyebrow));
    section.appendChild(create("h2", "", title));
    if (copy) section.appendChild(create("p", "", copy));
    return section;
  }

  function characterPicker() {
    if (state.characters.length < 2) return null;
    var label = create("label", "field-label character-picker", "Current character");
    var select = document.createElement("select");
    select.id = "character-picker";
    state.characters.forEach(function (character) {
      var option = document.createElement("option");
      option.value = character.uuid;
      option.textContent = character.name + " · Level " + character.level;
      option.selected = character.uuid === state.snapshot.actor.uuid;
      select.appendChild(option);
    });
    label.appendChild(select);
    return label;
  }

  function portrait(actor) {
    if (actor.portrait) {
      var image = document.createElement("img");
      image.className = "portrait";
      image.src = actor.portrait;
      image.alt = "";
      image.loading = "lazy";
      image.addEventListener("error", function () {
        image.replaceWith(create("div", "portrait-fallback", initials(actor.name)));
      }, { once: true });
      return image;
    }
    return create("div", "portrait-fallback", initials(actor.name));
  }

  function heroCard() {
    var actor = state.snapshot.actor;
    var card = create("section", "hero-card");
    card.appendChild(portrait(actor));
    var copy = document.createElement("div");
    copy.appendChild(create("small", "eyebrow", "Current character"));
    copy.appendChild(create("h3", "", actor.name));
    copy.appendChild(create("p", "", actor.ancestry + " · " + actor.classLabel + " · Level " + actor.level));
    card.appendChild(copy);
    return card;
  }

  function renderHome() {
    var snapshot = state.snapshot;
    var fragment = document.createDocumentFragment();
    fragment.appendChild(pageTitle("Welcome back", "Your adventure, close at hand", "A clear view of what matters at the table."));
    var picker = characterPicker();
    if (picker) fragment.appendChild(picker);
    fragment.appendChild(heroCard());

    var session = create("section", "card session-card");
    session.appendChild(create("p", "eyebrow", snapshot.session.dateLabel || "Current session"));
    session.appendChild(create("h3", "", snapshot.session.title));
    session.appendChild(create("p", "", snapshot.session.subtitle));
    fragment.appendChild(session);

    fragment.appendChild(sectionHeading("Recently shared", snapshot.journals.length + " entries"));
    var recent = create("div", "journal-list");
    snapshot.journals.slice(0, 3).forEach(function (journal, index) {
      recent.appendChild(journalCard(journal, index));
    });
    if (!snapshot.journals.length) recent.appendChild(emptyState("Nothing has been shared here yet."));
    fragment.appendChild(recent);
    elements.viewContent.replaceChildren(fragment);
  }

  function renderCharacter() {
    var actor = state.snapshot.actor;
    var identity = actor.identity || { species: actor.ancestry, className: actor.classLabel, languages: [] };
    var fragment = document.createDocumentFragment();
    fragment.appendChild(pageTitle("Character sheet", "Your character", "Everything your adventurer carries into the story."));
    var picker = characterPicker();
    if (picker) fragment.appendChild(picker);
    fragment.appendChild(heroCard());

    var identityCard = create("section", "identity-card");
    var identityGrid = create("div", "identity-grid");
    appendIdentity(identityGrid, "Species", identity.species || actor.ancestry);
    appendIdentity(identityGrid, "Background", identity.background);
    appendIdentity(identityGrid, "Class", identity.className || actor.classLabel);
    appendIdentity(identityGrid, "Subclass", identity.subclass);
    appendIdentity(identityGrid, "Alignment", identity.alignment);
    appendIdentity(identityGrid, "Size", identity.size);
    identityCard.appendChild(identityGrid);
    if ((identity.languages || []).length) {
      var languages = create("p", "identity-languages");
      languages.appendChild(create("strong", "", "Languages"));
      languages.appendChild(document.createTextNode((identity.languages || []).join(", ")));
      identityCard.appendChild(languages);
    }
    fragment.appendChild(identityCard);

    var stats = create("div", "stat-grid");
    stats.appendChild(stat("Hit points", actor.hp.value + "/" + actor.hp.max));
    stats.appendChild(stat("Armor", String(actor.ac)));
    stats.appendChild(stat("Speed", String(actor.speed)));
    fragment.appendChild(stats);

    var hp = create("div", "hp-controls");
    hp.appendChild(actionButton("− 1 HP", "adjust-hp", "-1"));
    hp.appendChild(actionButton("+ 1 HP", "adjust-hp", "1"));
    fragment.appendChild(hp);

    var quick = create("div", "character-quick-actions");
    var initiative = actionButton("Initiative " + signed(actor.initiative || 0), "roll-initiative", "");
    initiative.classList.add("initiative-button");
    quick.appendChild(initiative);
    var inspiration = actionButton(actor.inspiration ? "◆ Inspiration ready" : "◇ No inspiration", "toggle-inspiration", actor.inspiration ? "false" : "true");
    inspiration.classList.add(actor.inspiration ? "inspiration-ready" : "inspiration-empty");
    quick.appendChild(inspiration);
    fragment.appendChild(quick);

    var death = actor.deathSaves || { successes: 0, failures: 0 };
    var deathCard = create("section", "death-card");
    var deathCopy = document.createElement("div");
    deathCopy.appendChild(create("strong", "", "Death saving throws"));
    deathCopy.appendChild(create("small", "success-pips", "Successes  " + pips(death.successes)));
    deathCopy.appendChild(create("small", "failure-pips", "Failures  " + pips(death.failures)));
    deathCard.appendChild(deathCopy);
    var deathButton = actionButton("Roll", "roll-death-save", "");
    deathButton.disabled = Number(actor.hp.value) > 0;
    deathButton.title = deathButton.disabled ? "Death saves become available at 0 HP." : "Roll a death saving throw";
    deathCard.appendChild(deathButton);
    fragment.appendChild(deathCard);

    fragment.appendChild(sectionHeading("Abilities", "Tap to roll"));
    var abilities = create("div", "ability-grid");
    (actor.abilities || []).forEach(function (ability) {
      var button = create("button", "ability");
      button.type = "button";
      button.dataset.action = "roll-ability";
      button.dataset.value = ability.key;
      button.appendChild(create("span", "", ability.label));
      button.appendChild(create("strong", "", signed(ability.modifier)));
      button.appendChild(create("small", "", String(ability.score)));
      abilities.appendChild(button);
    });
    fragment.appendChild(abilities);

    fragment.appendChild(sectionHeading("Saving throws", "Tap to roll"));
    var saves = create("div", "save-grid");
    (actor.saves || []).forEach(function (save) {
      var button = create("button", "save-button");
      button.type = "button";
      button.dataset.action = "roll-save";
      button.dataset.value = save.key;
      button.appendChild(create("span", save.proficient ? "proficiency-mark proficient" : "proficiency-mark", save.proficient ? "●" : "○"));
      button.appendChild(create("span", "save-name", save.label));
      button.appendChild(create("strong", "", signed(save.modifier)));
      saves.appendChild(button);
    });
    if (!(actor.saves || []).length) saves.appendChild(emptyState("Saving throws will appear after the updated Foundry module syncs."));
    fragment.appendChild(saves);

    fragment.appendChild(sectionHeading("Skills", (actor.skills || []).length + " skills"));
    var skills = create("div", "skill-list");
    (actor.skills || []).forEach(function (skill) {
      var button = create("button", "skill-button");
      button.type = "button";
      button.dataset.action = "roll-skill";
      button.dataset.value = skill.key;
      button.appendChild(create("span", skill.proficiency > 0 ? "proficiency-mark proficient" : "proficiency-mark", skill.proficiency >= 2 ? "◆" : skill.proficiency > 0 ? "●" : "○"));
      var copy = document.createElement("span");
      copy.appendChild(create("strong", "", skill.label));
      copy.appendChild(create("small", "", String(skill.ability || "").toUpperCase() + " · Passive " + skill.passive));
      button.appendChild(copy);
      button.appendChild(create("strong", "skill-modifier", signed(skill.modifier)));
      skills.appendChild(button);
    });
    if (!(actor.skills || []).length) skills.appendChild(emptyState("Skills will appear after the updated Foundry module syncs."));
    fragment.appendChild(skills);

    fragment.appendChild(sectionHeading("Character features", (actor.actions || []).length + " entries"));
    var categories = create("div", "sheet-tabs");
    [["action", "Actions"], ["spell", "Spells"], ["feat", "Feats"]].forEach(function (entry) {
      var count = (actor.actions || []).filter(function (item) { return (item.category || (item.type === "spell" ? "spell" : item.type === "feat" ? "feat" : "action")) === entry[0]; }).length;
      var tab = create("button", state.sheetCategory === entry[0] ? "active" : "", entry[1] + " " + count);
      tab.type = "button";
      tab.dataset.action = "sheet-category";
      tab.dataset.value = entry[0];
      categories.appendChild(tab);
    });
    fragment.appendChild(categories);

    var actions = create("div", "action-list");
    var visibleItems = (actor.actions || []).filter(function (item) {
      var category = item.category || (item.type === "spell" ? "spell" : item.type === "feat" ? "feat" : "action");
      return category === state.sheetCategory;
    });
    visibleItems.forEach(function (item) {
      var row = create("div", "action-row");
      var info = create("button", "item-info-button");
      info.type = "button";
      info.dataset.action = "open-item";
      info.dataset.value = item.uuid;
      if (item.image) {
        var itemImage = document.createElement("img");
        itemImage.src = item.image;
        itemImage.alt = "";
        itemImage.loading = "lazy";
        info.appendChild(itemImage);
      } else info.appendChild(create("span", "item-image-fallback", "◇"));
      var copy = document.createElement("span");
      copy.appendChild(create("strong", "", item.name));
      copy.appendChild(create("small", "", (item.subtitle || item.type) + (item.uses ? " · " + item.uses : "")));
      info.appendChild(copy);
      info.appendChild(create("span", "item-chevron", "›"));
      row.appendChild(info);
      var button = create("button", "", "Use");
      button.type = "button";
      button.dataset.action = "use-item";
      button.dataset.value = item.uuid;
      button.dataset.label = item.name;
      row.appendChild(button);
      actions.appendChild(row);
    });
    if (!visibleItems.length) actions.appendChild(emptyState("No " + state.sheetCategory + " entries are available for this character."));
    fragment.appendChild(actions);

    var bio = create("form", "bio-form");
    bio.dataset.form = "biography";
    var bioLabel = create("label", "", "Biography and notes");
    bioLabel.htmlFor = "biography";
    var textarea = document.createElement("textarea");
    textarea.id = "biography";
    textarea.value = actor.biography || "";
    bio.appendChild(bioLabel);
    bio.appendChild(textarea);
    bio.appendChild(submitButton("Send biography update"));
    fragment.appendChild(bio);

    var levelButton = create("button", "secondary-button full-button", "Request edit or level up");
    levelButton.type = "button";
    levelButton.dataset.action = "level-up";
    fragment.appendChild(levelButton);
    elements.viewContent.replaceChildren(fragment);
  }

  function appendIdentity(parent, label, value) {
    if (!value) return;
    var field = create("div", "identity-field");
    field.appendChild(create("small", "", label));
    field.appendChild(create("strong", "", String(value)));
    parent.appendChild(field);
  }

  function pips(value) {
    var amount = Math.max(0, Math.min(3, Number(value) || 0));
    return "●".repeat(amount) + "○".repeat(3 - amount);
  }

  function renderJournal() {
    if (state.selectedJournal) {
      var journal = state.selectedJournal;
      var reader = create("article", "journal-reader");
      var back = create("button", "back-link", "‹ All journal entries");
      back.type = "button";
      back.dataset.action = "journal-back";
      reader.appendChild(back);
      reader.appendChild(create("p", "eyebrow", "Shared by your GM"));
      reader.appendChild(create("h2", "", journal.title));
      reader.appendChild(create("p", "summary", journal.summary || ""));
      if (journal.image) {
        var image = document.createElement("img");
        image.src = journal.image;
        image.alt = "";
        image.loading = "lazy";
        reader.appendChild(image);
      }
      reader.appendChild(create("div", "journal-body", journal.content || ""));
      elements.viewContent.replaceChildren(reader);
      return;
    }
    var fragment = document.createDocumentFragment();
    fragment.appendChild(pageTitle("Your record", "Journal", "Only notes your GM shared with you appear here."));
    var list = create("div", "journal-list");
    state.snapshot.journals.forEach(function (journal, index) { list.appendChild(journalCard(journal, index)); });
    if (!state.snapshot.journals.length) list.appendChild(emptyState("Nothing has been shared here yet."));
    fragment.appendChild(list);
    elements.viewContent.replaceChildren(fragment);
  }

  function journalCard(journal, index) {
    var button = create("button", "journal-card");
    button.type = "button";
    button.dataset.action = "open-journal";
    button.dataset.value = journal.uuid;
    button.appendChild(create("span", "journal-number", String(index + 1).padStart(2, "0")));
    var copy = document.createElement("span");
    copy.appendChild(create("strong", "", journal.title));
    copy.appendChild(create("small", "", journal.summary || "Open entry"));
    button.appendChild(copy);
    button.appendChild(create("span", "chevron", "›"));
    return button;
  }

  function renderChat() {
    var fragment = document.createDocumentFragment();
    fragment.appendChild(pageTitle("At the table", "Chat & dice", "Roll and post directly to Foundry while the world is awake."));
    var dice = create("div", "dice-row");
    [4, 6, 8, 10, 12, 20].forEach(function (sides) {
      var button = create("button", "", "d" + sides);
      button.type = "button";
      button.dataset.action = "roll-formula";
      button.dataset.value = "1d" + sides;
      dice.appendChild(button);
    });
    fragment.appendChild(dice);
    fragment.appendChild(sectionHeading("Table messages", "Newest first"));
    var messages = create("div", "message-list");
    state.snapshot.messages.forEach(function (message) {
      var card = create("article", "message");
      var header = document.createElement("header");
      header.appendChild(create("strong", "", message.author));
      header.appendChild(create("span", "", formatTime(message.timestamp)));
      card.appendChild(header);
      card.appendChild(create("p", "", message.content));
      if (message.rollTotal !== undefined && message.rollTotal !== null) card.appendChild(create("strong", "roll-total", String(message.rollTotal)));
      messages.appendChild(card);
    });
    if (!state.snapshot.messages.length) messages.appendChild(emptyState("No table messages yet."));
    fragment.appendChild(messages);
    var form = create("form", "chat-form");
    form.dataset.form = "chat";
    var input = document.createElement("input");
    input.id = "chat-message";
    input.placeholder = "Message the table…";
    input.setAttribute("aria-label", "Chat message");
    input.required = true;
    var send = create("button", "", "↑");
    send.type = "submit";
    send.setAttribute("aria-label", "Send message");
    form.appendChild(input);
    form.appendChild(send);
    fragment.appendChild(form);
    elements.viewContent.replaceChildren(fragment);
  }

  function renderShop() {
    var fragment = document.createDocumentFragment();
    fragment.appendChild(pageTitle("GM curated", "Campaign shop", "Purchases are sent to Foundry for delivery."));
    var list = create("div", "shop-list");
    state.snapshot.shop.forEach(function (item) {
      var card = create("article", "shop-card");
      var copy = document.createElement("div");
      copy.appendChild(create("h3", "", item.name));
      copy.appendChild(create("p", "", item.description));
      copy.appendChild(create("strong", "shop-price", item.price + " " + item.currency));
      card.appendChild(copy);
      var button = create("button", "", "Request");
      button.type = "button";
      button.dataset.action = "purchase";
      button.dataset.value = item.uuid;
      button.dataset.label = item.name;
      card.appendChild(button);
      list.appendChild(card);
    });
    if (!state.snapshot.shop.length) list.appendChild(emptyState("The campaign shop is empty right now."));
    fragment.appendChild(list);
    elements.viewContent.replaceChildren(fragment);
  }

  function stat(label, value) {
    var node = create("div", "stat");
    node.appendChild(create("small", "", label));
    node.appendChild(create("strong", "", value));
    return node;
  }

  function sectionHeading(title, detail) {
    var heading = create("div", "section-heading");
    heading.appendChild(create("h3", "", title));
    heading.appendChild(create("small", "", detail || ""));
    return heading;
  }

  function emptyState(text) { return create("div", "empty-state", text); }

  function actionButton(text, action, value) {
    var button = create("button", "action-button", text);
    button.type = "button";
    button.dataset.action = action;
    button.dataset.value = value || "";
    return button;
  }

  function signed(value) { return Number(value) >= 0 ? "+" + value : String(value); }

  function initials(name) {
    return String(name || "PC").replace(/[“”"']/g, "").split(/\s+/).slice(0, 2).map(function (part) { return part.charAt(0); }).join("").toUpperCase();
  }

  function formatTime(timestamp) {
    if (!timestamp) return "";
    try { return new Date(timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }
    catch { return ""; }
  }

  function handleAppClick(event) {
    var tabButton = event.target.closest("button[data-tab]");
    if (tabButton) {
      selectTab(tabButton.dataset.tab);
      return;
    }
    var button = event.target.closest("button[data-action]");
    if (!button) return;
    var action = button.dataset.action;
    if (action === "open-journal") {
      state.selectedJournal = state.snapshot.journals.find(function (journal) { return journal.uuid === button.dataset.value; }) || null;
      state.tab = "journal";
      elements.appView.querySelectorAll(".bottom-nav button").forEach(function (item) { item.classList.toggle("active", item.dataset.tab === "journal"); });
      renderJournal();
    } else if (action === "journal-back") {
      state.selectedJournal = null;
      renderJournal();
    } else if (action === "adjust-hp") {
      sendAction("adjustHp", { amount: Number(button.dataset.value) }, "Hit points updated in Foundry.");
    } else if (action === "roll-formula") {
      sendAction("roll", { formula: button.dataset.value }, button.dataset.value + " rolled in Foundry.");
    } else if (action === "roll-ability") {
      sendAction("rollAbility", { ability: button.dataset.value }, "Ability check rolled as your player account.");
    } else if (action === "roll-save") {
      sendAction("rollSave", { ability: button.dataset.value }, "Saving throw rolled as your player account.");
    } else if (action === "roll-skill") {
      sendAction("rollSkill", { skill: button.dataset.value }, "Skill check rolled as your player account.");
    } else if (action === "roll-initiative") {
      sendAction("rollInitiative", {}, "Initiative rolled as your player account.");
    } else if (action === "roll-death-save") {
      sendAction("rollDeathSave", {}, "Death saving throw completed in Foundry.");
    } else if (action === "toggle-inspiration") {
      sendAction("setInspiration", { value: button.dataset.value === "true" }, button.dataset.value === "true" ? "Inspiration marked in Foundry." : "Inspiration spent in Foundry.");
    } else if (action === "use-item") {
      sendAction("useItem", { itemUuid: button.dataset.value }, (button.dataset.label || "Item") + " completed in Foundry.");
    } else if (action === "sheet-category") {
      state.sheetCategory = button.dataset.value || "action";
      renderCharacter();
    } else if (action === "open-item") {
      openItemDetails(button.dataset.value);
    } else if (action === "level-up") {
      sendAction("requestLevelUp", {}, "Your character edit or level-up request was sent.");
    } else if (action === "purchase") {
      sendAction("purchase", { itemUuid: button.dataset.value, quantity: 1 }, (button.dataset.label || "Item") + " requested.");
    }
  }

  function handleAppSubmit(event) {
    event.preventDefault();
    var form = event.target;
    if (form.dataset.form === "chat") {
      var input = form.querySelector("#chat-message");
      var content = input.value.trim();
      if (!content) return;
      sendAction("chat", { content: content }, "Message sent to the table.").then(function (ok) { if (ok) input.value = ""; });
    } else if (form.dataset.form === "biography") {
      var biography = form.querySelector("#biography").value;
      sendAction("updateBiography", { biography: biography }, "Biography update sent to Foundry.");
    }
  }

  function handleAppChange(event) {
    if (event.target.id !== "character-picker") return;
    window.localStorage.setItem(CHARACTER_STORAGE, event.target.value);
    loadState();
  }

  async function sendAction(kind, payload, success) {
    if (!state.snapshot) return false;
    if (!state.bridgeOnline) {
      showToast("Foundry is sleeping. Saved sheets and journals still work; rolls and edits resume when the GM opens the world.", 5600);
      return false;
    }
    var result = await post("/api/actions", {
      actorUuid: state.snapshot.actor.uuid,
      kind: kind,
      payload: payload
    });
    if (!result.ok) {
      if (result.status === 503) {
        state.bridgeOnline = false;
        updateStatus();
      }
      showToast(result.data.error || "Foundry could not receive that action yet.", 5000);
      return false;
    }
    showToast("Waiting for Foundry to finish…", 14000);
    var actionId = result.data.id;
    for (var attempt = 0; attempt < 12; attempt += 1) {
      await delay(750);
      var status = await api("/api/actions/" + encodeURIComponent(actionId));
      if (!status.ok) {
        if (status.status === 401) break;
        continue;
      }
      if (status.data.status === "completed") {
        showToast(success, 3400);
        window.setTimeout(function () { loadState(true); }, 600);
        return true;
      }
      if (status.data.status === "failed") {
        showToast(status.data.result && status.data.result.error ? status.data.result.error : "Foundry could not complete that action.", 6000);
        return false;
      }
    }
    showToast("The action is queued, but Foundry is taking longer than expected. Check the table before trying it again.", 6500);
    window.setTimeout(function () { loadState(true); }, 1200);
    return true;
  }

  function delay(milliseconds) {
    return new Promise(function (resolve) { window.setTimeout(resolve, milliseconds); });
  }

  function openItemDetails(uuid) {
    var actor = state.snapshot && state.snapshot.actor;
    var item = actor && (actor.actions || []).find(function (entry) { return entry.uuid === uuid; });
    if (!item) return;
    document.getElementById("modal-title").textContent = item.name;
    var panel = create("article", "item-detail");
    if (item.image) {
      var image = document.createElement("img");
      image.src = item.image;
      image.alt = "";
      panel.appendChild(image);
    }
    panel.appendChild(create("p", "eyebrow", item.category || item.type));
    panel.appendChild(create("p", "item-detail-subtitle", (item.subtitle || item.type) + (item.uses ? " · " + item.uses : "")));
    panel.appendChild(create("p", "item-detail-copy", item.description || "No additional item details were provided in Foundry."));
    var use = create("button", "primary-button full-button", "Use " + item.name);
    use.type = "button";
    use.addEventListener("click", function () {
      closeSettings();
      sendAction("useItem", { itemUuid: item.uuid }, item.name + " completed in Foundry.");
    });
    elements.modalContent.replaceChildren(panel, use);
    elements.modal.hidden = false;
  }

  function openSettings() {
    if (!state.snapshot) return;
    document.getElementById("modal-title").textContent = "Phone settings";
    var panel = create("div", "sheet-panel");
    panel.appendChild(create("strong", "", state.account ? state.account.playerLabel : "Player account"));
    panel.appendChild(create("small", "", state.snapshot.campaign.name + " · " + state.characters.length + (state.characters.length === 1 ? " character" : " characters")));
    var install = create("button", "sheet-action", "Install on this phone");
    install.type = "button";
    install.addEventListener("click", installApp);
    var another = create("button", "sheet-action", "Connect a different campaign");
    another.type = "button";
    another.addEventListener("click", restartPairing);
    elements.modalContent.replaceChildren(panel, install, another);
    elements.modal.hidden = false;
  }

  function closeSettings() { elements.modal.hidden = true; }

  async function installApp() {
    if (state.installPrompt) {
      await state.installPrompt.prompt();
      state.installPrompt = null;
      closeSettings();
      return;
    }
    var isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    showToast(isIos
      ? "In Safari, tap Share, then Add to Home Screen. If it is already installed, remove the old icon first."
      : "In Chrome, open the browser menu and choose Add to Home screen or Install app.", 8500);
    closeSettings();
  }

  var toastTimer = 0;
  function showToast(message, duration) {
    window.clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.hidden = false;
    toastTimer = window.setTimeout(function () { elements.toast.hidden = true; }, duration || 3200);
  }

  function create(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }
})();
