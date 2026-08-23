(function () {
  "use strict";

  var ACCOUNT_STORAGE = "pocket-chronicle-account";
  var CHARACTER_STORAGE = "pocket-chronicle-character";
  var ROLL_STORAGE = "pocket-chronicle-local-rolls";
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
    refreshTimer: 0,
    revision: 0
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
      var previousActorUuid = state.snapshot && state.snapshot.actor && state.snapshot.actor.uuid;
      var nextActorUuid = result.data.snapshot.actor && result.data.snapshot.actor.uuid;
      var nextRevision = Number(result.data.revision || result.data.snapshot.revision || 0);
      var unchanged = Boolean(silent && state.snapshot && previousActorUuid === nextActorUuid && state.revision === nextRevision);
      state.snapshot = result.data.snapshot;
      state.revision = nextRevision;
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
      if (unchanged) updateStatus();
      else showApp(Boolean(silent && previousActorUuid === nextActorUuid));
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

  function hpActionForm(kind, labelText, buttonText, placeholder, options) {
    options = options || {};
    var form = create("form", "hp-action hp-action-" + kind);
    form.dataset.form = "hp-" + kind;
    var field = document.createElement("label");
    field.htmlFor = "hp-" + kind;
    field.appendChild(create("span", "hp-label", labelText));
    var input = document.createElement("input");
    input.id = "hp-" + kind;
    input.name = "amount";
    input.type = "number";
    input.inputMode = "numeric";
    input.step = "1";
    input.min = String(options.min === undefined ? 1 : options.min);
    input.max = "999";
    input.placeholder = placeholder;
    if (options.value !== undefined && options.value !== null) input.value = String(options.value);
    input.required = true;
    field.appendChild(input);
    form.appendChild(field);
    form.appendChild(submitButton(buttonText));
    return form;
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

  function showApp(preserveScroll) {
    elements.gate.hidden = true;
    elements.gateFooter.hidden = true;
    elements.appView.hidden = false;
    elements.statusStrip.hidden = false;
    elements.accountButton.hidden = false;
    updateStatus();
    renderCurrentView(!preserveScroll);
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
    renderCurrentView(true);
  }

  function renderCurrentView(resetScroll) {
    if (!state.snapshot) return;
    var previousScroll = elements.viewContent.scrollTop;
    if (state.tab === "home") renderHome();
    else if (state.tab === "character") renderCharacter();
    else if (state.tab === "spells") renderSpells();
    else if (state.tab === "effects") renderEffects();
    else if (state.tab === "journal") renderJournal();
    else if (state.tab === "chat") renderChat();
    else if (state.tab === "shop") renderShop();
    elements.viewContent.scrollTop = resetScroll === false ? previousScroll : 0;
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

  function restRationsData() {
    var extension = state.snapshot && state.snapshot.extensions && state.snapshot.extensions.restRations;
    return extension && extension.enabled ? extension : null;
  }

  function restLaunchCard(location) {
    var extension = restRationsData();
    if (!extension) return null;
    var card = create("section", "rest-launch-card " + (location === "home" ? "rest-launch-home" : "rest-launch-sheet"));
    var sigil = create("span", "rest-launch-sigil", "☾");
    var copy = document.createElement("div");
    copy.appendChild(create("small", "eyebrow", "Rest & Rations"));
    copy.appendChild(create("strong", "", "Make camp"));
    copy.appendChild(create("span", "", "Choose provisions, spend Hit Dice, and rest safely."));
    var button = create("button", "", "Rest");
    button.type = "button";
    button.dataset.action = "open-rest";
    card.append(sigil, copy, button);
    return card;
  }

  function provisionSelect(labelText, name, provisions, exempt) {
    var label = create("label", "field-label rest-provision-field", labelText);
    var select = document.createElement("select");
    select.name = name;
    select.required = !exempt;
    var empty = document.createElement("option");
    empty.value = "";
    empty.textContent = exempt ? "Not required for this character" : provisions.length ? "Choose one serving" : "No servings in inventory";
    select.appendChild(empty);
    provisions.forEach(function (provision) {
      var option = document.createElement("option");
      option.value = provision.uuid;
      option.textContent = provision.name + " · " + provision.quantity + " available";
      option.dataset.effect = provision.effect || "";
      select.appendChild(option);
    });
    select.disabled = exempt;
    label.appendChild(select);
    return label;
  }

  function openRestPanel() {
    var extension = restRationsData();
    if (!extension) return;
    document.getElementById("modal-title").textContent = "Rest & Rations";
    var form = create("form", "rest-form");
    form.dataset.form = "rations-rest";
    var intro = create("section", "rest-intro");
    intro.appendChild(create("span", "rest-intro-sigil", "☾"));
    var introCopy = document.createElement("div");
    introCopy.appendChild(create("strong", "", "Prepare the camp"));
    introCopy.appendChild(create("small", "", "One food and one water serving are consumed only after a successful rest."));
    intro.appendChild(introCopy);
    form.appendChild(intro);

    var typeLabel = create("label", "field-label", "Rest type");
    var restType = document.createElement("select");
    restType.name = "restType";
    [["short", "Short rest"], ["long", "Long rest"]].forEach(function (entry) {
      var option = document.createElement("option");
      option.value = entry[0];
      option.textContent = entry[1];
      restType.appendChild(option);
    });
    typeLabel.appendChild(restType);
    form.appendChild(typeLabel);

    var exemptions = extension.exemptions || {};
    var provisions = create("div", "rest-provisions");
    provisions.appendChild(provisionSelect("Food serving", "foodItemUuid", extension.food || [], Boolean(exemptions.food)));
    provisions.appendChild(provisionSelect("Water serving", "waterItemUuid", extension.water || [], Boolean(exemptions.water)));
    form.appendChild(provisions);

    var hitDice = create("section", "rest-hit-dice");
    hitDice.appendChild(create("strong", "", "Hit Dice to spend"));
    hitDice.appendChild(create("small", "", "Choose how many Hit Dice to spend during this short rest."));
    (extension.hitDice || []).forEach(function (pool) {
      var row = create("label", "rest-hit-die-row");
      var copy = document.createElement("span");
      copy.appendChild(create("strong", "", String(pool.denomination || "Hit Die").toUpperCase()));
      copy.appendChild(create("small", "", pool.value + " of " + pool.max + " available"));
      var input = document.createElement("input");
      input.type = "number";
      input.inputMode = "numeric";
      input.name = "hitDice";
      input.min = "0";
      input.max = String(Math.max(0, Number(pool.value || 0)));
      input.step = "1";
      input.value = "0";
      input.dataset.denomination = pool.denomination;
      row.append(copy, input);
      hitDice.appendChild(row);
    });
    if (!(extension.hitDice || []).length) hitDice.appendChild(create("p", "form-note", "No Hit Dice are currently available."));
    form.appendChild(hitDice);

    var preview = create("div", "rest-preview");
    preview.appendChild(create("strong", "", "Provision effects"));
    preview.appendChild(create("small", "", "Hearty Feast: proficiency bonus on every Hit Die spent; 25 temporary HP after a long rest. Spoiled food and tainted water add exhaustion after resting."));
    form.appendChild(preview);
    var confirm = submitButton("Complete short rest");
    confirm.classList.add("rest-submit");
    form.appendChild(confirm);
    var missingRequired = (!exemptions.food && !(extension.food || []).length) || (!exemptions.water && !(extension.water || []).length);
    confirm.disabled = missingRequired;
    if (missingRequired) form.appendChild(create("p", "form-error", "Purchase food and water from the Shop before resting."));

    restType.addEventListener("change", function () {
      var shortRest = restType.value === "short";
      hitDice.hidden = !shortRest;
      confirm.textContent = shortRest ? "Complete short rest" : "Complete long rest";
    });
    form.addEventListener("submit", submitRationsRest);
    elements.modalContent.replaceChildren(form);
    elements.modal.hidden = false;
  }

  async function submitRationsRest(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var restType = form.elements.restType.value;
    var hitDice = restType === "short" ? Array.from(form.querySelectorAll("input[name='hitDice']")).flatMap(function (input) {
      var count = Number(input.value || 0);
      return Number.isInteger(count) && count > 0 ? [{ denomination: input.dataset.denomination, count: count }] : [];
    }) : [];
    var submit = form.querySelector("button[type='submit']");
    submit.disabled = true;
    var ok = await sendAction("takeRationsRest", {
      restType: restType,
      foodItemUuid: form.elements.foodItemUuid ? form.elements.foodItemUuid.value : "",
      waterItemUuid: form.elements.waterItemUuid ? form.elements.waterItemUuid.value : "",
      hitDice: hitDice
    }, restType === "short" ? "Short rest completed." : "Long rest completed.");
    if (ok) closeSettings();
    else submit.disabled = false;
  }

  function renderHome() {
    var snapshot = state.snapshot;
    var fragment = document.createDocumentFragment();
    fragment.appendChild(pageTitle("Welcome back", "Your adventure, close at hand", "A clear view of what matters at the table."));
    var picker = characterPicker();
    if (picker) fragment.appendChild(picker);
    fragment.appendChild(heroCard());
    var homeRest = restLaunchCard("home");
    if (homeRest) fragment.appendChild(homeRest);

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

    var hp = create("section", "hp-controls hp-split-controls");
    hp.appendChild(hpActionForm("damage", "Damage taken", "Damage", "10"));
    hp.appendChild(hpActionForm("healing", "Hit points healed", "Heal", "15"));
    hp.appendChild(hpActionForm("temp", "Temporary HP", "Set temp HP", "0", { min: 0, value: actor.hp.temp || 0 }));
    hp.appendChild(create("small", "hp-help", "Enter positive whole numbers for damage and healing. Temporary HP may be set to 0."));
    fragment.appendChild(hp);

    var quick = create("div", "character-quick-actions");
    var initiative = actionButton("Initiative " + signed(actor.initiative || 0), "roll-initiative", "");
    initiative.classList.add("initiative-button");
    quick.appendChild(initiative);
    var inspiration = actionButton(actor.inspiration ? "◆ Inspiration ready" : "◇ No inspiration", "toggle-inspiration", actor.inspiration ? "false" : "true");
    inspiration.classList.add(actor.inspiration ? "inspiration-ready" : "inspiration-empty");
    quick.appendChild(inspiration);
    fragment.appendChild(quick);
    var sheetRest = restLaunchCard("sheet");
    if (sheetRest) fragment.appendChild(sheetRest);

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
      button.dataset.label = ability.label + " check";
      button.dataset.formula = d20Formula(ability.modifier);
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
      button.dataset.label = save.label + " saving throw";
      button.dataset.formula = d20Formula(save.modifier);
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
      button.dataset.label = skill.label;
      button.dataset.formula = d20Formula(skill.modifier);
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

    var characterFeatures = (actor.actions || []).filter(function (item) { return (item.category || item.type) !== "spell"; });
    fragment.appendChild(sectionHeading("Character features", characterFeatures.length + " entries"));
    var categories = create("div", "sheet-tabs");
    [["action", "Actions"], ["feat", "Feats"], ["item", "Items"]].forEach(function (entry) {
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
      actions.appendChild(itemRow(item));
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

    var resources = actor.resources || [];
    if (resources.length) fragment.appendChild(resourceDisclosure(resources));
    elements.viewContent.replaceChildren(fragment);
  }

  function resourceDisclosure(resources) {
    var details = create("details", "resource-disclosure");
    var summary = document.createElement("summary");
    var summaryCopy = document.createElement("span");
    summaryCopy.appendChild(create("strong", "", "Resources"));
    summaryCopy.appendChild(create("small", "", resources.length + " linked pools"));
    summary.appendChild(summaryCopy);
    summary.appendChild(create("span", "resource-chevron", "⌄"));
    details.appendChild(summary);
    var resourceGrid = create("div", "resource-grid");
    resources.forEach(function (resource) {
      var resourceCard = create("section", "resource-card");
      var resourceCopy = create("div", "resource-copy");
      resourceCopy.appendChild(create("strong", "", resource.label));
      resourceCopy.appendChild(create("small", "", resource.kind === "activity" ? "Activity uses" : resource.kind === "item" ? "Item uses" : "Character resource"));
      resourceCard.appendChild(resourceCopy);
      resourceCard.appendChild(create("span", "resource-value", resource.value + " / " + resource.max));
      var meter = create("span", "resource-meter");
      meter.style.setProperty("--resource-fill", Math.max(0, Math.min(100, (Number(resource.value || 0) / Math.max(1, Number(resource.max || 1))) * 100)) + "%");
      resourceCard.appendChild(meter);
      resourceGrid.appendChild(resourceCard);
    });
    details.appendChild(resourceGrid);
    return details;
  }

  function itemRow(item) {
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
    var firstRoll = (item.rolls || [])[0];
    var button;
    if ((item.activities || []).length) {
      button = create("button", "", item.category === "spell" ? "Cast" : "Open");
      button.type = "button";
      button.dataset.action = "open-item";
      button.dataset.value = item.uuid;
      row.appendChild(button);
    } else if (item.canConsume) {
      button = create("button", "", "Use");
      button.type = "button";
      button.dataset.action = "consume-item";
      button.dataset.value = item.uuid;
      button.dataset.label = item.name;
      row.appendChild(button);
    } else if (firstRoll) {
      button = create("button", "", "Roll");
      button.type = "button";
      button.dataset.action = "local-item-roll";
      button.dataset.label = item.name + " · " + firstRoll.label;
      button.dataset.formula = firstRoll.formula;
      button.dataset.kind = firstRoll.kind || "item";
      row.appendChild(button);
    }
    return row;
  }

  function renderSpells() {
    var actor = state.snapshot.actor;
    var fragment = document.createDocumentFragment();
    fragment.appendChild(pageTitle("Arcane resources", "Spellbook", "Spells arranged by level with your current Foundry spell slots."));
    var picker = characterPicker();
    if (picker) fragment.appendChild(picker);

    var slots = actor.spellSlots || [];
    fragment.appendChild(sectionHeading("Spell slots", slots.length ? "Updates after each cast" : "No slot pool"));
    var slotGrid = create("div", "spell-slot-grid");
    slots.forEach(function (slot) {
      var card = create("section", "spell-slot-card" + (slot.value > 0 ? " slot-ready" : " slot-empty"));
      var slotHead = create("div", "spell-slot-head");
      var emblem = create("span", "slot-level-emblem", slot.pact ? "P" : String(slot.level));
      emblem.setAttribute("aria-hidden", "true");
      slotHead.appendChild(emblem);
      var slotCopy = create("span", "spell-slot-copy");
      slotCopy.appendChild(create("small", "", slot.pact ? "Pact magic" : "Spell level"));
      slotCopy.appendChild(create("strong", "", slot.pact ? "Level " + slot.level : "Level " + slot.level));
      slotHead.appendChild(slotCopy);
      slotHead.appendChild(create("span", "slot-count", slot.value + "/" + slot.max));
      card.appendChild(slotHead);
      var pips = create("span", "slot-pips");
      pips.setAttribute("aria-label", slot.value + " of " + slot.max + " spell slots available");
      for (var index = 0; index < slot.max; index += 1) {
        var pip = create("i", index < slot.value ? "available" : "spent");
        pip.appendChild(create("b", "", "✦"));
        pips.appendChild(pip);
      }
      card.appendChild(pips);
      slotGrid.appendChild(card);
    });
    if (!slots.length) slotGrid.appendChild(emptyState("This character has no prepared spell-slot pool. Cantrips and innate spells still appear below."));
    fragment.appendChild(slotGrid);

    var spells = (actor.actions || []).filter(function (item) { return (item.category || item.type) === "spell"; }).sort(function (a, b) {
      return Number(a.spellLevel || 0) - Number(b.spellLevel || 0) || a.name.localeCompare(b.name);
    });
    var levels = Array.from(new Set(spells.map(function (spell) { return Number(spell.spellLevel || 0); })));
    levels.forEach(function (level) {
      var matchingSlots = slots.filter(function (slot) { return Number(slot.level) === level; });
      var slotDetail = matchingSlots.map(function (slot) { return slot.value + "/" + slot.max + (slot.pact ? " pact" : " slots"); }).join(" · ");
      fragment.appendChild(sectionHeading(level === 0 ? "Cantrips" : "Level " + level, level === 0 ? "At will" : slotDetail || "Spell level"));
      var list = create("div", "action-list spell-level-list");
      spells.filter(function (spell) { return Number(spell.spellLevel || 0) === level; }).forEach(function (spell) {
        list.appendChild(itemRow(spell));
      });
      fragment.appendChild(list);
    });
    if (!spells.length) fragment.appendChild(emptyState("No spells are available for this character yet."));
    elements.viewContent.replaceChildren(fragment);
  }

  function renderEffects() {
    var actor = state.snapshot.actor;
    var effects = actor.effects || [];
    var fragment = document.createDocumentFragment();
    fragment.appendChild(pageTitle("Character state", "Active effects", "Conditions, spell effects, and feature effects currently applied in Foundry."));
    var picker = characterPicker();
    if (picker) fragment.appendChild(picker);
    fragment.appendChild(sectionHeading("In effect now", effects.length + (effects.length === 1 ? " effect" : " effects")));
    var list = create("div", "effect-list");
    effects.forEach(function (effect) {
      var card = create("section", "effect-card");
      if (effect.image) {
        var image = document.createElement("img");
        image.src = effect.image;
        image.alt = "";
        image.loading = "lazy";
        card.appendChild(image);
      } else card.appendChild(create("span", "effect-mark", "◈"));
      var copy = create("div", "effect-copy");
      copy.appendChild(create("h3", "", effect.name || "Effect"));
      var meta = (effect.statuses || []).concat([effect.duration, effect.source].filter(Boolean));
      if (meta.length) copy.appendChild(create("p", "effect-meta", meta.join(" · ")));
      card.appendChild(copy);
      if (effect.description) card.appendChild(create("p", "effect-description", effect.description));
      list.appendChild(card);
    });
    if (!effects.length) list.appendChild(emptyState("No active effects are currently applied to this character."));
    fragment.appendChild(list);
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
    fragment.appendChild(pageTitle("At the table", "Chat & dice", "Dice roll privately on this phone; messages still travel to the table."));
    var dice = create("div", "dice-row");
    [4, 6, 8, 10, 12, 20].forEach(function (sides) {
      var button = create("button", "", "d" + sides);
      button.type = "button";
      button.dataset.action = "roll-formula";
      button.dataset.value = "1d" + sides;
      dice.appendChild(button);
    });
    fragment.appendChild(dice);
    var localRolls = readLocalRolls();
    fragment.appendChild(sectionHeading("Phone roll history", localRolls.length ? "Newest first" : "No rolls yet"));
    var messages = create("div", "message-list");
    localRolls.forEach(function (roll) {
      var card = create("article", "message mine local-roll-message");
      var header = document.createElement("header");
      header.appendChild(create("strong", "", roll.actorName || "Your character"));
      header.appendChild(create("span", "", formatTime(roll.timestamp)));
      card.appendChild(header);
      card.appendChild(create("p", "", roll.label));
      card.appendChild(create("small", "roll-breakdown-line", roll.formula + " · " + roll.breakdown));
      card.appendChild(create("strong", "roll-total", String(roll.total)));
      messages.appendChild(card);
    });
    if (!localRolls.length) messages.appendChild(emptyState("Your local skill, attack, damage, and dice results will be kept here on this phone."));
    fragment.appendChild(messages);

    fragment.appendChild(sectionHeading("Foundry messages", "Newest first"));
    var tableMessages = create("div", "message-list");
    state.snapshot.messages.forEach(function (message) {
      var card = create("article", "message");
      var header = document.createElement("header");
      header.appendChild(create("strong", "", message.author));
      header.appendChild(create("span", "", formatTime(message.timestamp)));
      card.appendChild(header);
      card.appendChild(create("p", "", message.content));
      if (message.rollTotal !== undefined && message.rollTotal !== null) card.appendChild(create("strong", "roll-total", String(message.rollTotal)));
      tableMessages.appendChild(card);
    });
    if (!state.snapshot.messages.length) tableMessages.appendChild(emptyState("No table messages yet."));
    fragment.appendChild(tableMessages);
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
    fragment.appendChild(pageTitle("GM curated", "Campaign shop", "Purchases deduct your character’s Foundry currency and arrive in inventory."));
    var wallet = create("section", "shop-wallet");
    wallet.appendChild(create("small", "eyebrow", "Current wallet"));
    wallet.appendChild(create("strong", "", formatCurrency(state.snapshot.actor.currency || {})));
    fragment.appendChild(wallet);
    var list = create("div", "shop-list");
    state.snapshot.shop.forEach(function (item) {
      var card = create("article", "shop-card");
      var copy = document.createElement("div");
      copy.appendChild(create("h3", "", item.name));
      copy.appendChild(create("p", "", item.description));
      copy.appendChild(create("strong", "shop-price", item.price + " " + item.currency));
      card.appendChild(copy);
      var button = create("button", "", "Buy");
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

  function formatCurrency(currency) {
    var values = ["pp", "gp", "ep", "sp", "cp"].flatMap(function (key) {
      var value = Number(currency[key] || 0);
      return value > 0 ? [value + " " + key] : [];
    });
    return values.length ? values.join(" · ") : "0 cp";
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

  async function handleAppClick(event) {
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
    } else if (action === "roll-formula") {
      rollLocalFormula(button.dataset.value, button.dataset.value, "die");
    } else if (action === "roll-ability") {
      rollLocalFormula(button.dataset.label, button.dataset.formula, "ability");
    } else if (action === "roll-save") {
      rollLocalFormula(button.dataset.label, button.dataset.formula, "save");
    } else if (action === "roll-skill") {
      rollLocalFormula(button.dataset.label, button.dataset.formula, "skill");
    } else if (action === "roll-initiative") {
      rollLocalFormula("Initiative", d20Formula(state.snapshot.actor.initiative || 0), "initiative");
    } else if (action === "roll-death-save") {
      var deathRoll = await rollLocalFormula("Death saving throw", "1d20", "death-save");
      if (deathRoll) sendAction("recordDeathSave", { total: deathRoll.total }, "Death save marked on your Foundry sheet.", { quiet: true });
    } else if (action === "toggle-inspiration") {
      sendAction("setInspiration", { value: button.dataset.value === "true" }, button.dataset.value === "true" ? "Inspiration marked in Foundry." : "Inspiration spent in Foundry.");
    } else if (action === "local-item-roll") {
      rollLocalFormula(button.dataset.label, button.dataset.formula, button.dataset.kind || "item");
    } else if (action === "consume-item") {
      sendAction("consumeItem", { itemUuid: button.dataset.value }, (button.dataset.label || "Item") + " resources updated in Foundry.");
    } else if (action === "sheet-category") {
      state.sheetCategory = button.dataset.value || "action";
      renderCharacter();
    } else if (action === "open-item") {
      openItemDetails(button.dataset.value);
    } else if (action === "level-up") {
      sendAction("requestLevelUp", {}, "Your character edit or level-up request was sent.");
    } else if (action === "open-rest") {
      openRestPanel();
    } else if (action === "purchase") {
      button.disabled = true;
      sendAction("purchase", { itemUuid: button.dataset.value, quantity: 1 }, (button.dataset.label || "Item") + " purchased and added to inventory.").then(function () { button.disabled = false; });
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
    } else if (form.dataset.form === "hp-damage" || form.dataset.form === "hp-healing") {
      var hpInput = form.querySelector("input[name='amount']");
      var amount = Number(hpInput.value);
      if (!Number.isInteger(amount) || amount < 1 || amount > 999) {
        showToast("Enter a positive whole number from 1 to 999.", 4200);
        return;
      }
      var isDamage = form.dataset.form === "hp-damage";
      var hpChange = isDamage ? -amount : amount;
      sendAction("adjustHp", { amount: hpChange }, amount + (isDamage ? " damage applied in Foundry." : " healing applied in Foundry.")).then(function (ok) {
        if (ok) hpInput.value = "";
      });
    } else if (form.dataset.form === "hp-temp") {
      var tempInput = form.querySelector("input[name='amount']");
      var tempValue = Number(tempInput.value);
      if (!Number.isInteger(tempValue) || tempValue < 0 || tempValue > 999) {
        showToast("Temporary HP must be a whole number from 0 to 999.", 4200);
        return;
      }
      sendAction("setTempHp", { value: tempValue }, "Temporary HP updated in Foundry.");
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

  async function sendAction(kind, payload, success, options) {
    options = options || {};
    if (!state.snapshot) return false;
    if (!state.bridgeOnline) {
      if (options.silentOffline) return false;
      showToast(options.quiet ? "The roll stays in your phone history, but Foundry is asleep so the sheet could not be updated." : "Foundry is sleeping. Saved sheets and journals still work; sheet edits resume when the GM opens the world.", 5600);
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
      if (!options.quiet) showToast(result.data.error || "Foundry could not receive that action yet.", 5000);
      return false;
    }
    if (!options.quiet) showToast("Waiting for Foundry to finish…", 14000);
    var actionId = result.data.id;
    for (var attempt = 0; attempt < 12; attempt += 1) {
      await delay(750);
      var status = await api("/api/actions/" + encodeURIComponent(actionId));
      if (!status.ok) {
        if (status.status === 401) break;
        continue;
      }
      if (status.data.status === "completed") {
        if (!options.quiet) showToast(success, 3400);
        if (!options.skipRefresh) window.setTimeout(function () { loadState(true); }, 1500);
        return true;
      }
      if (status.data.status === "failed") {
        if (!options.quiet) showToast(status.data.result && status.data.result.error ? status.data.result.error : "Foundry could not complete that action.", 6000);
        return false;
      }
    }
    if (!options.quiet) showToast("The action is queued, but Foundry is taking longer than expected. Check the table before trying it again.", 6500);
    if (!options.skipRefresh) window.setTimeout(function () { loadState(true); }, 1200);
    return true;
  }

  function delay(milliseconds) {
    return new Promise(function (resolve) { window.setTimeout(resolve, milliseconds); });
  }

  function d20Formula(modifier) {
    var value = Number(modifier) || 0;
    return "1d20" + (value > 0 ? "+" + value : value < 0 ? String(value) : "");
  }

  function randomDie(sides) {
    if (window.crypto && window.crypto.getRandomValues) {
      var numbers = new Uint32Array(1);
      var ceiling = Math.floor(4294967296 / sides) * sides;
      do { window.crypto.getRandomValues(numbers); } while (numbers[0] >= ceiling);
      return (numbers[0] % sides) + 1;
    }
    return Math.floor(Math.random() * sides) + 1;
  }

  function evaluateLocalFormula(formula, suppliedDice) {
    var normalized = String(formula || "").toLowerCase()
      .replace(/\[[^\]]*]/g, "")
      .replace(/math\.(floor|ceil|round|abs|min|max)/g, "$1")
      .replace(/\((\d+)\)d(\d+)/g, "$1d$2")
      .replace(/[−–—]/g, "-")
      .replace(/×/g, "*")
      .replace(/÷/g, "/")
      .replace(/\s+/g, "")
      .replace(/\+\+/g, "+")
      .replace(/\+-/g, "-")
      .replace(/--/g, "+");
    if (!normalized || normalized.length > 500) return null;
    var tokens = [];
    var cursor = 0;
    while (cursor < normalized.length) {
      var remaining = normalized.slice(cursor);
      var diceMatch = remaining.match(/^\d*d\d+(?:(?:kh|kl|dh|dl|k|d)\d*|(?:min|max)\d+|(?:rr|r|xo|x)\d*(?:(?:<=|>=|=|<|>)\d+)?)*/i);
      var numberMatch = remaining.match(/^\d+(?:\.\d+)?/);
      var nameMatch = remaining.match(/^[a-z]+/i);
      if (diceMatch) {
        tokens.push({ type: "dice", value: diceMatch[0] });
        cursor += diceMatch[0].length;
      } else if (numberMatch) {
        tokens.push({ type: "number", value: numberMatch[0] });
        cursor += numberMatch[0].length;
      } else if (nameMatch) {
        tokens.push({ type: "name", value: nameMatch[0] });
        cursor += nameMatch[0].length;
      } else if ("+-*/(),".indexOf(remaining.charAt(0)) >= 0) {
        tokens.push({ type: remaining.charAt(0), value: remaining.charAt(0) });
        cursor += 1;
      } else return null;
    }

    var rolledDice = [];
    var diceDetails = [];
    var suppliedPosition = 0;
    var position = 0;

    function peek(type) { return tokens[position] && tokens[position].type === type; }
    function take(type) {
      if (!peek(type)) return null;
      position += 1;
      return tokens[position - 1];
    }

    function rollDiceToken(source) {
      var match = source.match(/^(\d*)d(\d+)(.*)$/i);
      if (!match) throw new Error("dice");
      var count = Number(match[1] || 1);
      var sides = Number(match[2]);
      var modifiers = match[3] || "";
      if (!Number.isInteger(count) || !Number.isInteger(sides) || count < 1 || count > 100 || sides < 2 || sides > 1000) throw new Error("dice");
      var results = [];
      for (var die = 0; die < count; die += 1) {
        var supplied = suppliedDice && suppliedDice[suppliedPosition];
        var result = supplied && Number(supplied.sides) === sides && Number(supplied.result) >= 1 && Number(supplied.result) <= sides
          ? Number(supplied.result)
          : randomDie(sides);
        suppliedPosition += 1;
        results.push({ index: die, result: result, kept: true });
      }

      function comparison(value, operator, target) {
        if (operator === "<") return value < target;
        if (operator === "<=") return value <= target;
        if (operator === ">") return value > target;
        if (operator === ">=") return value >= target;
        return value === target;
      }

      var modifierPattern = /(kh|kl|dh|dl|k|d)(\d*)|(min|max)(\d+)|(rr|r|xo|x)(\d*)(?:(<=|>=|=|<|>)(\d+))?/gi;
      var modifier;
      var consumed = "";
      while ((modifier = modifierPattern.exec(modifiers))) {
        consumed += modifier[0];
        if (modifier[1]) {
          var mode = modifier[1].toLowerCase();
          if (mode === "k") mode = "kh";
          if (mode === "d") mode = "dl";
          var select = Math.max(1, Number(modifier[2] || 1));
          var active = results.filter(function (entry) { return entry.kept; });
          var ordered = active.slice().sort(function (a, b) { return a.result - b.result || a.index - b.index; });
          var keep = new Set(active.map(function (entry) { return entry.index; }));
          if (mode === "kh" || mode === "kl") {
            keep.clear();
            var kept = mode === "kh" ? ordered.slice(Math.max(0, ordered.length - select)) : ordered.slice(0, select);
            kept.forEach(function (entry) { keep.add(entry.index); });
          } else {
            var dropped = mode === "dh" ? ordered.slice(Math.max(0, ordered.length - select)) : ordered.slice(0, select);
            dropped.forEach(function (entry) { keep.delete(entry.index); });
          }
          results.forEach(function (entry) { if (entry.kept) entry.kept = keep.has(entry.index); });
        } else if (modifier[3]) {
          var boundary = Number(modifier[4]);
          results.forEach(function (entry) {
            if (!entry.kept) return;
            entry.result = modifier[3].toLowerCase() === "min" ? Math.max(boundary, entry.result) : Math.min(boundary, entry.result);
          });
        } else if (modifier[5]) {
          var rollMode = modifier[5].toLowerCase();
          var digits = modifier[6];
          var operator = modifier[7] || "=";
          var target = modifier[8] ? Number(modifier[8]) : digits ? Number(digits) : (rollMode.charAt(0) === "x" ? sides : 1);
          var cap = rollMode === "xo" ? 1 : rollMode.charAt(0) === "x" && modifier[8] && digits ? Math.max(1, Number(digits)) : 100;
          if (rollMode === "r" || rollMode === "rr") {
            results.slice().forEach(function (entry) {
              if (!entry.kept || !comparison(entry.result, operator, target)) return;
              entry.kept = false;
              var rerolls = 0;
              var next;
              do {
                next = { index: results.length, result: randomDie(sides), kept: true };
                results.push(next);
                rerolls += 1;
                if (rollMode === "r" || !comparison(next.result, operator, target)) break;
                next.kept = false;
              } while (rerolls < 100 && results.length < 100);
            });
          } else {
            var queue = results.filter(function (entry) { return entry.kept; });
            var explosions = 0;
            while (queue.length && explosions < cap && results.length < 100) {
              var current = queue.shift();
              if (!comparison(current.result, operator, target)) continue;
              var extra = { index: results.length, result: randomDie(sides), kept: true };
              results.push(extra);
              explosions += 1;
              if (rollMode === "x") queue.push(extra);
            }
          }
        }
      }
      if (consumed.length !== modifiers.length) throw new Error("modifier");
      results.forEach(function (entry) { rolledDice.push({ sides: sides, result: entry.result, kept: entry.kept }); });
      diceDetails.push(source + " [" + results.map(function (entry) { return entry.kept ? String(entry.result) : "(" + entry.result + ")"; }).join(", ") + "]");
      return results.filter(function (entry) { return entry.kept; }).reduce(function (sum, entry) { return sum + entry.result; }, 0);
    }

    function parsePrimary() {
      var token;
      if ((token = take("number"))) return Number(token.value);
      if ((token = take("dice"))) return rollDiceToken(token.value);
      if ((token = take("name"))) {
        if (!take("(")) throw new Error("function");
        var args = [parseExpression()];
        while (take(",")) args.push(parseExpression());
        if (!take(")")) throw new Error("function");
        if (token.value === "floor") return Math.floor(args[0]);
        if (token.value === "ceil") return Math.ceil(args[0]);
        if (token.value === "round") return Math.round(args[0]);
        if (token.value === "abs") return Math.abs(args[0]);
        if (token.value === "min") return Math.min.apply(Math, args);
        if (token.value === "max") return Math.max.apply(Math, args);
        throw new Error("function");
      }
      if (take("(")) {
        var value = parseExpression();
        if (!take(")")) throw new Error("parenthesis");
        return value;
      }
      throw new Error("formula");
    }

    function parseUnary() {
      if (take("+")) return parseUnary();
      if (take("-")) return -parseUnary();
      return parsePrimary();
    }

    function parseTerm() {
      var value = parseUnary();
      while (peek("*") || peek("/")) {
        var operator = tokens[position++].type;
        var right = parseUnary();
        value = operator === "*" ? value * right : value / right;
      }
      return value;
    }

    function parseExpression() {
      var value = parseTerm();
      while (peek("+") || peek("-")) {
        var operator = tokens[position++].type;
        var right = parseTerm();
        value = operator === "+" ? value + right : value - right;
      }
      return value;
    }

    try {
      var total = parseExpression();
      if (position !== tokens.length || !Number.isFinite(total)) return null;
      total = Math.trunc(total);
      return { total: total, breakdown: diceDetails.length ? diceDetails.join(" · ") : normalized + " = " + total, dice: rolledDice };
    } catch { return null; }
  }

  async function rollLocalFormula(label, formula, kind) {
    var result = evaluateLocalFormula(formula);
    if (!result) {
      showToast("That roll formula is not available on this phone yet.", 4200);
      return null;
    }
    var roll = makeLocalRoll(label, formula, kind, result);
    writeLocalRoll(roll);
    showRollResult(roll);
    mirrorRollToDiceSoNice(roll);
    if (state.tab === "chat") renderChat();
    return roll;
  }

  function makeLocalRoll(label, formula, kind, result) {
    var actor = state.snapshot && state.snapshot.actor;
    return {
      id: String(Date.now()) + "-" + Math.random().toString(36).slice(2, 8),
      campaignId: state.snapshot && state.snapshot.campaign.id,
      actorUuid: actor && actor.uuid,
      actorName: actor && actor.name,
      label: label || formula,
      formula: String(formula),
      kind: kind || "roll",
      total: result.total,
      breakdown: result.breakdown,
      dice: result.dice,
      timestamp: Date.now()
    };
  }

  function mirrorRollToDiceSoNice(roll) {
    mirrorDiceToDiceSoNice(roll.dice || []);
  }

  function mirrorDiceToDiceSoNice(dice) {
    if (!dice.length) return;
    void sendAction("showDice", { dice: dice }, "", { quiet: true, silentOffline: true, skipRefresh: true });
  }

  async function rollActivitySequence(label, entries) {
    var prepared = (entries || []).map(function (entry) {
      return { entry: entry, test: evaluateLocalFormula(entry.formula) };
    }).filter(function (row) { return row.test; });
    if (!prepared.length) {
      showToast("This activity does not have a usable phone roll formula. Its Foundry automation is still shown in the activity details.", 5200);
      return [];
    }
    var rolls = [];
    prepared.forEach(function (row) {
      var result = row.test;
      if (!result) return;
      var roll = makeLocalRoll(label + " · " + row.entry.label, row.entry.formula, row.entry.kind || "item", result);
      writeLocalRoll(roll);
      rolls.push(roll);
    });
    if (!rolls.length) return [];
    showActivityRollResult(label, rolls);
    mirrorDiceToDiceSoNice(rolls.flatMap(function (roll) { return roll.dice || []; }));
    if (state.tab === "chat") renderChat();
    return rolls;
  }

  function readLocalRolls() {
    var all = [];
    try { all = JSON.parse(window.localStorage.getItem(ROLL_STORAGE) || "[]"); } catch { all = []; }
    if (!Array.isArray(all)) return [];
    var campaignId = state.snapshot && state.snapshot.campaign.id;
    var actorUuid = state.snapshot && state.snapshot.actor.uuid;
    return all.filter(function (roll) { return roll.campaignId === campaignId && roll.actorUuid === actorUuid; }).slice(0, 50);
  }

  function writeLocalRoll(roll) {
    var all = [];
    try { all = JSON.parse(window.localStorage.getItem(ROLL_STORAGE) || "[]"); } catch { all = []; }
    if (!Array.isArray(all)) all = [];
    all.unshift(roll);
    try { window.localStorage.setItem(ROLL_STORAGE, JSON.stringify(all.slice(0, 200))); } catch { /* Phone storage can be private or full. */ }
  }

  var rollCloseTimer = 0;

  function rollSparkles() {
    var field = create("span", "roll-sparkles");
    field.setAttribute("aria-hidden", "true");
    for (var index = 0; index < 12; index += 1) {
      var sparkle = create("i", index % 3 === 0 ? "gold" : "");
      sparkle.style.setProperty("--spark-angle", (index * 30) + "deg");
      sparkle.style.setProperty("--spark-delay", (-index * 240) + "ms");
      field.appendChild(sparkle);
    }
    return field;
  }

  function resultCoin(value, compact) {
    var sigil = create("div", "roll-result-sigil" + (compact ? " compact" : ""));
    sigil.setAttribute("aria-hidden", "true");
    var orbit = create("span", "roll-coin-orbit");
    orbit.appendChild(create("i"));
    orbit.appendChild(create("i"));
    sigil.appendChild(orbit);
    var coin = create("span", "roll-result-coin");
    coin.appendChild(create("small", "", compact ? "SEQUENCE" : "RESULT"));
    coin.appendChild(create("strong", "roll-result-total", String(value)));
    sigil.appendChild(coin);
    return sigil;
  }

  function armRollOverlay(overlay, card, scrim) {
    var closed = false;
    var timer = create("span", "roll-timer-bar");
    timer.setAttribute("aria-hidden", "true");
    card.appendChild(timer);
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-label", "Close roll result");
    function close() {
      if (closed) return;
      closed = true;
      window.clearTimeout(rollCloseTimer);
      overlay.classList.add("closing");
      window.setTimeout(function () { overlay.remove(); }, 180);
    }
    function closeWithKey(event) {
      if (["Enter", " ", "Escape"].includes(event.key)) {
        event.preventDefault();
        close();
      }
    }
    scrim.addEventListener("click", close);
    card.addEventListener("click", close);
    card.addEventListener("keydown", closeWithKey);
    document.body.appendChild(overlay);
    card.focus({ preventScroll: true });
    window.setTimeout(function () { overlay.classList.remove("rolling"); }, 1100);
    rollCloseTimer = window.setTimeout(close, 30000);
  }

  function showRollResult(roll) {
    var old = document.getElementById("roll-result-overlay");
    if (old) old.remove();
    window.clearTimeout(rollCloseTimer);
    var overlay = create("div", "roll-overlay rolling");
    overlay.id = "roll-result-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", roll.label + ": " + roll.total);
    var scrim = create("button", "roll-scrim");
    scrim.type = "button";
    scrim.setAttribute("aria-label", "Close roll result");
    var card = create("section", "roll-result-card");
    card.appendChild(rollSparkles());
    card.appendChild(create("p", "eyebrow", roll.kind === "damage" ? "Damage roll" : roll.kind === "healing" ? "Healing roll" : roll.kind === "attack" ? "Attack roll" : "Phone roll"));
    card.appendChild(create("h2", "", roll.label));
    var stage = create("div", "dice-stage");
    stage.appendChild(resultCoin(roll.total, false));
    card.appendChild(stage);
    card.appendChild(create("p", "roll-result-breakdown", roll.formula + "  ·  " + roll.breakdown));
    card.appendChild(create("small", "roll-result-note", "Tap anywhere to close · Stays open for 30 seconds"));
    overlay.appendChild(scrim);
    overlay.appendChild(card);
    armRollOverlay(overlay, card, scrim);
  }

  function showActivityRollResult(label, rolls) {
    var old = document.getElementById("roll-result-overlay");
    if (old) old.remove();
    window.clearTimeout(rollCloseTimer);
    var overlay = create("div", "roll-overlay rolling");
    overlay.id = "roll-result-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", label + " results");
    var scrim = create("button", "roll-scrim");
    scrim.type = "button";
    scrim.setAttribute("aria-label", "Close roll results");
    var card = create("section", "roll-result-card activity-roll-result-card");
    card.appendChild(rollSparkles());
    card.appendChild(resultCoin("✦", true));
    card.appendChild(create("p", "eyebrow", "Attack sequence"));
    card.appendChild(create("h2", "", label));
    var resultList = create("div", "sequence-results");
    rolls.forEach(function (roll) {
      var row = create("section", "sequence-result " + (roll.kind || "item"));
      var copy = create("span", "");
      copy.appendChild(create("strong", "", roll.label.split(" · ").slice(-1)[0]));
      copy.appendChild(create("small", "", roll.formula));
      row.appendChild(copy);
      row.appendChild(create("b", "", String(roll.total)));
      resultList.appendChild(row);
    });
    card.appendChild(resultList);
    card.appendChild(create("small", "roll-result-note", "Tap anywhere to close · Stays open for 30 seconds"));
    overlay.appendChild(scrim);
    overlay.appendChild(card);
    armRollOverlay(overlay, card, scrim);
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
    var controls = create("div", "item-detail-actions");
    var activities = item.activities || [];
    activities.forEach(function (activity) {
      var card = create("section", "activity-card");
      var heading = create("header", "activity-card-heading");
      heading.appendChild(create("h3", "", activity.name || activity.typeLabel || "Activity"));
      heading.appendChild(create("span", "activity-type", activity.typeLabel || activity.type || "Activity"));
      card.appendChild(heading);

      var facts = create("div", "activity-facts");
      if (activity.activation) facts.appendChild(create("span", "", activity.activation));
      if (activity.duration) facts.appendChild(create("span", "", activity.duration));
      if (activity.concentration) facts.appendChild(create("span", "activity-concentration", "Concentration"));
      if (activity.save && activity.save.dc) {
        var saveAbilities = (activity.save.abilityLabels || activity.save.abilities || []).join(" or ");
        var saveText = (saveAbilities ? saveAbilities + " " : "") + "save · DC " + activity.save.dc;
        if (activity.save.onSuccess === "half") saveText += " · half on success";
        else if (activity.save.onSuccess === "none") saveText += " · no damage on success";
        facts.appendChild(create("span", "activity-save", saveText));
      }
      if (facts.childNodes.length) card.appendChild(facts);
      if (activity.description) card.appendChild(create("p", "activity-description", activity.description));
      if ((activity.effects || []).length) {
        var effectBadges = create("div", "activity-effects");
        (activity.effects || []).forEach(function (effect) { effectBadges.appendChild(create("span", "", "◈ " + effect.name)); });
        card.appendChild(effectBadges);
      }
      if (activity.automation && (activity.automation.providers || []).length) {
        var automation = create("div", "automation-note");
        var badges = create("span", "automation-badges");
        (activity.automation.providers || []).forEach(function (provider) { badges.appendChild(create("i", "", provider)); });
        automation.appendChild(badges);
        automation.appendChild(create("small", "", "Native rolls and charges work here. Targeted automation continues in Foundry."));
        card.appendChild(automation);
      }

      var castOptions = activity.castOptions || [];
      var castSelect = null;
      if (item.category === "spell" && castOptions.length) {
        var castLabel = create("label", "activity-cast-level");
        castLabel.appendChild(create("span", "", activity.requiresSpellSlot ? "Cast using" : "Casting"));
        castSelect = document.createElement("select");
        castOptions.forEach(function (castOption, index) {
          var option = document.createElement("option");
          option.value = String(index);
          option.textContent = castOption.label;
          option.disabled = activity.requiresSpellSlot && Number(castOption.value || 0) < 1;
          castSelect.appendChild(option);
        });
        var firstAvailable = castOptions.findIndex(function (castOption) { return !activity.requiresSpellSlot || Number(castOption.value || 0) > 0; });
        castSelect.value = String(firstAvailable >= 0 ? firstAvailable : 0);
        castLabel.appendChild(castSelect);
        card.appendChild(castLabel);
      }

      var activityActions = create("div", "activity-roll-actions");
      function renderActivityActions() {
        activityActions.replaceChildren();
        var selectedOption = castOptions.length ? castOptions[Number(castSelect ? castSelect.value : 0)] : { level: Number(item.spellLevel || 0), slotKey: "" };
        var levelData = (activity.rollsByLevel || []).find(function (entry) { return Number(entry.level) === Number(selectedOption.level); }) || (activity.rollsByLevel || [])[0];
        var costData = (activity.consumptionByOption || []).find(function (entry) {
          return String(entry.slotKey || "") === String(selectedOption.slotKey || "") && Number(entry.level) === Number(selectedOption.level);
        }) || (activity.consumptionByOption || [])[0];
        if (costData && (costData.entries || []).length) {
          var costs = create("div", "activity-costs");
          costs.appendChild(create("small", "activity-cost-title", "This use spends"));
          (costData.entries || []).forEach(function (entry) {
            var cost = create("span", "activity-cost" + (entry.warning ? " warning" : ""));
            cost.appendChild(create("strong", "", (entry.value ? entry.value + " × " : "") + entry.label));
            if (entry.hint) cost.appendChild(create("small", "", entry.hint));
            costs.appendChild(cost);
          });
          activityActions.appendChild(costs);
        }
        var selectedRolls = levelData && levelData.rolls || [];
        var attackRoll = selectedRolls.find(function (roll) { return roll.kind === "attack"; });
        var followupRolls = selectedRolls.filter(function (roll) { return roll.kind === "damage" || roll.kind === "healing"; });
        var combinedKeys = new Set();
        if (attackRoll) {
          var sequence = [attackRoll].concat(followupRolls);
          sequence.forEach(function (roll) { combinedKeys.add(roll.key); });
          var combined = create("button", "primary-button full-button activity-combined-roll");
          combined.type = "button";
          combined.appendChild(document.createTextNode(followupRolls.length ? "Roll attack + damage" : "Roll attack"));
          combined.appendChild(create("small", "", sequence.map(function (roll) { return roll.formula; }).join("  ·  ")));
          combined.addEventListener("click", function () {
            closeSettings();
            rollActivitySequence(item.name + " · " + activity.name, sequence);
          });
          activityActions.appendChild(combined);
        }
        selectedRolls.filter(function (roll) { return !combinedKeys.has(roll.key); }).forEach(function (roll) {
          var rollButton = create("button", "secondary-button full-button", "Roll " + roll.label + " · " + roll.formula);
          rollButton.type = "button";
          rollButton.addEventListener("click", function () {
            closeSettings();
            rollLocalFormula(item.name + " · " + activity.name + " · " + roll.label, roll.formula, roll.kind || "item");
          });
          activityActions.appendChild(rollButton);
        });
        if (activity.canConsume) {
          var noSlot = activity.requiresSpellSlot && Number(selectedOption.value || 0) < 1;
          var useText = activity.requiresSpellSlot
            ? noSlot ? "No slots remaining" : "Spend " + selectedOption.label
            : item.category === "spell" ? "Cast without a spell slot" : "Use activity and spend resources";
          var use = create("button", "primary-button full-button", useText);
          use.type = "button";
          use.disabled = noSlot;
          use.addEventListener("click", function () {
            closeSettings();
            sendAction("consumeItem", {
              itemUuid: item.uuid,
              activityId: activity.id,
              slotKey: selectedOption.slotKey || "",
              castLevel: Number(selectedOption.level || item.spellLevel || 0)
            }, item.name + " resources updated in Foundry.");
          });
          activityActions.appendChild(use);
        }
        if (!activityActions.childNodes.length) activityActions.appendChild(create("p", "activity-empty", "This activity has information but no phone roll or resource cost."));
      }
      if (castSelect) castSelect.addEventListener("change", renderActivityActions);
      renderActivityActions();
      card.appendChild(activityActions);
      controls.appendChild(card);
    });

    if (!activities.length) {
      (item.rolls || []).forEach(function (roll) {
        var rollButton = create("button", "secondary-button full-button", "Roll " + roll.label + " · " + roll.formula);
        rollButton.type = "button";
        rollButton.addEventListener("click", function () {
          closeSettings();
          rollLocalFormula(item.name + " · " + roll.label, roll.formula, roll.kind || "item");
        });
        controls.appendChild(rollButton);
      });
      if (item.canConsume) {
        var use = create("button", "primary-button full-button", "Use and spend resources");
        use.type = "button";
        use.addEventListener("click", function () {
          closeSettings();
          sendAction("consumeItem", { itemUuid: item.uuid }, item.name + " resources updated in Foundry.");
        });
        controls.appendChild(use);
      }
    }
    elements.modalContent.replaceChildren(panel, controls);
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

  if (window.__POCKET_TEST_MODE__) {
    window.__POCKET_TEST__ = { evaluateLocalFormula: evaluateLocalFormula };
  }
})();
