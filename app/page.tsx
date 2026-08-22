"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { demoSnapshot } from "@/lib/demo-data";
import type { ChronicleActionKind, ChronicleCharacterChoice, ChronicleJournal, ChronicleSnapshot } from "@/lib/protocol";

type Tab = "home" | "character" | "journal" | "chat" | "shop";
type ConnectionMode = "checking" | "offline" | "pairing" | "signin" | "waiting" | "live";
type InstallPrompt = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type AccountLink = { id: string; playerLabel: string; campaignName: string };
type PairingChallenge = { playerLabel: string; campaignName: string; needsPasswordSetup: boolean };
type PairingStep = "campaign" | "account" | "approval" | "credential";
type PairingAccount = { id: string; playerLabel: string; characterCount: number };
type AccessRequest = { id: string; token: string; playerLabel: string; campaignName: string };

const ACCOUNT_STORAGE = "pocket-chronicle-account";
const CHARACTER_STORAGE = "pocket-chronicle-character";

const tabs: Array<{ id: Tab; label: string; mark: string }> = [
  { id: "home", label: "Home", mark: "⌂" },
  { id: "character", label: "Character", mark: "◇" },
  { id: "journal", label: "Journal", mark: "▤" },
  { id: "chat", label: "Chat", mark: "◌" },
  { id: "shop", label: "Shop", mark: "♢" },
];

function initials(name: string) {
  return name.replace(/[“”"']/g, "").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function signed(value: number) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function campaignCodeInput(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase().replace(/O/g, "0").replace(/[IL]/g, "1");
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [snapshot, setSnapshot] = useState<ChronicleSnapshot>(demoSnapshot);
  const [mode, setMode] = useState<ConnectionMode>("checking");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pairingOpen, setPairingOpen] = useState(false);
  const [pairingStep, setPairingStep] = useState<PairingStep>("campaign");
  const [campaignId, setCampaignId] = useState("");
  const [campaignCode, setCampaignCode] = useState("");
  const [pairingAccounts, setPairingAccounts] = useState<PairingAccount[]>([]);
  const [selectedPairingAccountId, setSelectedPairingAccountId] = useState("");
  const [accessRequest, setAccessRequest] = useState<AccessRequest | null>(null);
  const [pairingError, setPairingError] = useState("");
  const [pairingChallenge, setPairingChallenge] = useState<PairingChallenge | null>(null);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [accountLink, setAccountLink] = useState<AccountLink | null>(null);
  const [characters, setCharacters] = useState<ChronicleCharacterChoice[]>([]);
  const [selectedActorUuid, setSelectedActorUuid] = useState("");
  const [selectedJournal, setSelectedJournal] = useState<ChronicleJournal | null>(null);
  const [chatText, setChatText] = useState("");
  const [notice, setNotice] = useState("");
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const actor = snapshot.actor;

  const refreshConnection = useCallback(async (preferredActorUuid?: string) => {
    const storedActor = preferredActorUuid || window.localStorage.getItem(CHARACTER_STORAGE) || "";
    const stateUrl = storedActor ? `/api/state?actorUuid=${encodeURIComponent(storedActor)}` : "/api/state";
    const stateResponse = await fetch(stateUrl, { cache: "no-store" }).catch(() => null);
    if (stateResponse?.ok) {
      const data = await stateResponse.json() as {
        snapshot: ChronicleSnapshot;
        characters?: ChronicleCharacterChoice[];
        account?: { id: string; playerLabel: string };
      };
      setSnapshot(data.snapshot);
      setCharacters(data.characters || [{
        uuid: data.snapshot.actor.uuid,
        name: data.snapshot.actor.name,
        portrait: data.snapshot.actor.portrait,
        ancestry: data.snapshot.actor.ancestry,
        classLabel: data.snapshot.actor.classLabel,
        level: data.snapshot.actor.level,
      }]);
      setSelectedActorUuid(data.snapshot.actor.uuid);
      window.localStorage.setItem(CHARACTER_STORAGE, data.snapshot.actor.uuid);
      if (data.account) {
        const linked = { id: data.account.id, playerLabel: data.account.playerLabel, campaignName: data.snapshot.campaign.name };
        setAccountLink(linked);
        window.localStorage.setItem(ACCOUNT_STORAGE, JSON.stringify(linked));
      }
      setMode("live");
      return;
    }
    if (stateResponse?.status === 404) {
      setMode("waiting");
      return;
    }
    if (stateResponse?.status === 503) {
      setMode("offline");
      return;
    }

    const savedAccount = window.localStorage.getItem(ACCOUNT_STORAGE);
    if (stateResponse?.status === 401 && savedAccount) {
      try {
        setAccountLink(JSON.parse(savedAccount) as AccountLink);
        setMode("signin");
        return;
      } catch {
        window.localStorage.removeItem(ACCOUNT_STORAGE);
      }
    }

    const statusResponse = await fetch("/api/status", { cache: "no-store" }).catch(() => null);
    const status = statusResponse?.ok ? await statusResponse.json() as { connected?: boolean } : null;
    setMode(status?.connected ? "pairing" : "offline");
  }, []);

  useEffect(() => {
    const capture = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", capture);
    return () => window.removeEventListener("beforeinstallprompt", capture);
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(refreshConnection, 0);
    const timer = window.setInterval(refreshConnection, 5000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [refreshConnection]);

  useEffect(() => {
    if (pairingStep !== "approval" || !accessRequest) return;
    const checkApproval = async () => {
      const response = await fetch(`/api/campaign/access-requests/${encodeURIComponent(accessRequest.id)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestToken: accessRequest.token }),
      }).catch(() => null);
      if (!response?.ok) return;
      const data = await response.json() as { status?: string; needsPasswordSetup?: boolean };
      if (data.status === "approved") {
        setPairingChallenge({
          playerLabel: accessRequest.playerLabel,
          campaignName: accessRequest.campaignName,
          needsPasswordSetup: Boolean(data.needsPasswordSetup),
        });
        setPairingStep("credential");
        setPairingError("");
      } else if (data.status === "denied" || data.status === "expired") {
        setPairingStep("campaign");
        setAccessRequest(null);
        setPairingAccounts([]);
        setPairingError(data.status === "denied"
          ? "The GM denied this phone request. Check that you selected your own Foundry account."
          : "That request expired. Enter the campaign details and try again.");
      }
    };
    void checkApproval();
    const timer = window.setInterval(checkApproval, 2000);
    return () => window.clearInterval(timer);
  }, [accessRequest, pairingStep]);

  const displayName = useMemo(() => actor.name.split(" ").slice(0, 2).join(" "), [actor.name]);

  async function sendAction(kind: ChronicleActionKind, payload: Record<string, unknown>, success: string) {
    if (mode !== "live") return false;
    const response = await fetch("/api/actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actorUuid: actor.uuid, kind, payload }),
    });
    if (!response.ok) {
      if (response.status === 503) setMode("offline");
      setNotice("Foundry could not receive that action yet.");
      return false;
    }
    setNotice(success);
    window.setTimeout(() => setNotice(""), 2600);
    return true;
  }

  async function pairPhone(event: React.FormEvent) {
    event.preventDefault();
    setPairingError("");

    if (pairingStep === "campaign") {
      const response = await fetch("/api/campaign/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ campaignId: campaignId.trim(), campaignCode }),
      });
      const data = await response.json().catch(() => ({})) as {
        error?: string;
        campaign?: { id: string; name: string };
        accounts?: PairingAccount[];
      };
      if (!response.ok || !data.campaign || !data.accounts?.length) {
        setPairingError(data.error || "That campaign could not be connected.");
        return;
      }
      setCampaignId(data.campaign.id);
      setPairingAccounts(data.accounts);
      setSelectedPairingAccountId(data.accounts[0].id);
      setPairingStep("account");
      return;
    }

    if (pairingStep === "account") {
      const response = await fetch("/api/campaign/access-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ campaignId, campaignCode, accountId: selectedPairingAccountId }),
      });
      const data = await response.json().catch(() => ({})) as {
        error?: string;
        requestId?: string;
        requestToken?: string;
        playerLabel?: string;
        campaignName?: string;
      };
      if (!response.ok || !data.requestId || !data.requestToken || !data.playerLabel || !data.campaignName) {
        setPairingError(data.error || "That phone request could not be sent.");
        return;
      }
      setAccessRequest({ id: data.requestId, token: data.requestToken, playerLabel: data.playerLabel, campaignName: data.campaignName });
      setCampaignCode("");
      setPairingStep("approval");
      return;
    }

    if (pairingStep !== "credential" || !pairingChallenge || !accessRequest) return;
    if (pairingChallenge.needsPasswordSetup && password !== passwordConfirm) {
      setPairingError("Those passwords do not match.");
      return;
    }
    const response = await fetch(`/api/campaign/access-requests/${encodeURIComponent(accessRequest.id)}/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestToken: accessRequest.token, password }),
    });
    const data = await response.json().catch(() => ({})) as {
      error?: string;
      account?: AccountLink;
    };
    if (!response.ok) {
      setPairingError(data.error || "That approved phone request could not be completed.");
      return;
    }
    if (data.account) {
      setAccountLink(data.account);
      window.localStorage.setItem(ACCOUNT_STORAGE, JSON.stringify(data.account));
    }
    setMode("checking");
    setPairingOpen(false);
    setSettingsOpen(false);
    setPairingChallenge(null);
    setPairingStep("campaign");
    setAccessRequest(null);
    setPairingAccounts([]);
    setPassword("");
    setPasswordConfirm("");
    setNotice("Your Foundry account is connected.");
    await refreshConnection();
  }

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    if (!accountLink) return;
    setPairingError("");
    const response = await fetch("/api/sign-in", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accountId: accountLink.id, password }),
    });
    const data = await response.json().catch(() => ({})) as { error?: string; account?: AccountLink };
    if (!response.ok) {
      setPairingError(data.error || "That sign-in did not work.");
      return;
    }
    if (data.account) {
      setAccountLink(data.account);
      window.localStorage.setItem(ACCOUNT_STORAGE, JSON.stringify(data.account));
    }
    setPassword("");
    setMode("checking");
    await refreshConnection();
  }

  async function chooseCharacter(actorUuid: string) {
    setSelectedActorUuid(actorUuid);
    window.localStorage.setItem(CHARACTER_STORAGE, actorUuid);
    setSelectedJournal(null);
    await refreshConnection(actorUuid);
  }

  async function adjustHp(amount: number) {
    await sendAction("adjustHp", { amount }, "Hit points sent to Foundry.");
  }

  async function rollDie(sides: number) {
    await sendAction("roll", { formula: `1d${sides}` }, `1d${sides} sent to Foundry.`);
  }

  async function sendChat(event: React.FormEvent) {
    event.preventDefault();
    const content = chatText.trim();
    if (!content || !(await sendAction("chat", { content }, "Message sent to Foundry chat."))) return;
    setChatText("");
  }

  async function installApp() {
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setNotice("Pocket Chronicle is already installed on this phone.");
      return;
    }
    if (installPrompt) {
      await installPrompt.prompt();
      setInstallPrompt(null);
      return;
    }
    const isApplePhone = /iPhone|iPad|iPod/i.test(window.navigator.userAgent);
    setNotice(isApplePhone
      ? "On iPhone: tap Safari’s Share button, then Add to Home Screen."
      : "Open the browser menu and choose Install app or Add to Home screen.");
  }

  function beginAnotherPairing() {
    setPairingChallenge(null);
    setPairingStep("campaign");
    setCampaignId("");
    setCampaignCode("");
    setPairingAccounts([]);
    setSelectedPairingAccountId("");
    setAccessRequest(null);
    setPassword("");
    setPasswordConfirm("");
    setPairingError("");
    setPairingOpen(true);
  }

  function pairingFields() {
    if (pairingStep === "credential" && pairingChallenge) return <>
      <div className="account-preview">
        <span className="portrait-placeholder compact">{initials(pairingChallenge.playerLabel)}</span>
        <span><small className="eyebrow">FOUNDRY ACCOUNT</small><strong>{pairingChallenge.playerLabel}</strong><small>{pairingChallenge.campaignName}</small></span>
      </div>
      <p className="credential-help">{pairingChallenge.needsPasswordSetup
        ? "Create a private Pocket Chronicle password. Do not reuse or enter your Foundry password."
        : "Enter the Pocket Chronicle password already connected to this Foundry account."}</p>
      <input className="password-input" type="password" autoComplete={pairingChallenge.needsPasswordSetup ? "new-password" : "current-password"} minLength={8} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Pocket Chronicle password" aria-label="Pocket Chronicle password" required />
      {pairingChallenge.needsPasswordSetup && <input className="password-input confirm-input" type="password" autoComplete="new-password" minLength={8} maxLength={128} value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} placeholder="Confirm password" aria-label="Confirm Pocket Chronicle password" required />}
    </>;
    if (pairingStep === "account") return <>
      <p className="credential-help">Choose your existing Foundry player account. You will receive every character that account owns.</p>
      <select className="pair-account-select" value={selectedPairingAccountId} onChange={(event) => setSelectedPairingAccountId(event.target.value)} aria-label="Foundry player account" required>
        {pairingAccounts.map((account) => <option key={account.id} value={account.id}>{account.playerLabel} — {account.characterCount} character{account.characterCount === 1 ? "" : "s"}</option>)}
      </select>
    </>;
    if (pairingStep === "approval" && accessRequest) return <div className="approval-wait">
      <span className="approval-pulse" aria-hidden="true">◇</span>
      <strong>Request sent for {accessRequest.playerLabel}</strong>
      <small>Ask your GM to approve this phone in Foundry. This screen will continue automatically.</small>
    </div>;
    return <>
      <input className="campaign-id-input" autoCapitalize="none" autoComplete="username" maxLength={100} value={campaignId} onChange={(event) => setCampaignId(event.target.value)} placeholder="Campaign ID" aria-label="Campaign ID" required />
      <input className="campaign-code-input confirm-input" autoCapitalize="characters" autoComplete="off" inputMode="text" minLength={6} maxLength={6} pattern="[A-Za-z0-9]{6}" value={campaignCode} onChange={(event) => setCampaignCode(campaignCodeInput(event.target.value))} placeholder="ABC123" aria-label="Permanent six-character Campaign code" required />
    </>;
  }

  function pairingButtonLabel() {
    if (pairingStep === "account") return "Request GM approval";
    if (pairingStep === "credential") return pairingChallenge?.needsPasswordSetup ? "Create account & connect" : "Sign in & connect";
    return "Find my campaign";
  }

  function HomeView() {
    const shared = snapshot.journals[0];
    const [dateNumber, dateMonth] = (snapshot.session.dateLabel || "— —").split(" ");
    return <>
      <section className="welcome-block">
        <p className="eyebrow">WELCOME BACK</p>
        <h2>Your story,<br />carried lightly.</h2>
        <p>Everything you need at the table. None of the map.</p>
      </section>

      {characters.length > 1 && <section className="character-switcher" aria-label="Your characters">
        <p className="eyebrow">YOUR CHARACTERS</p>
        <div>
          {characters.map((character) => <button className={character.uuid === selectedActorUuid ? "active" : ""} type="button" key={character.uuid} onClick={() => chooseCharacter(character.uuid)}>
            <span>{initials(character.name)}</span><small>{character.name}</small>
          </button>)}
        </div>
      </section>}

      <button className="character-card card-button" type="button" onClick={() => setActiveTab("character")}>
        <div className="portrait-placeholder">{initials(actor.name)}</div>
        <div className="character-copy">
          <p className="eyebrow">CURRENT CHARACTER</p>
          <h3>{displayName}</h3>
          <p>{actor.ancestry} · {actor.classLabel} {actor.level}</p>
        </div>
        <span className="round-button" aria-hidden="true">›</span>
      </button>

      <section className="stat-grid" aria-label="Character highlights">
        <article><span>HP</span><strong>{actor.hp.value}</strong><small>of {actor.hp.max}</small></article>
        <article><span>AC</span><strong>{actor.ac}</strong><small>armored</small></article>
        <article><span>SPEED</span><strong>{actor.speed}</strong><small>feet</small></article>
      </section>

      {shared && <section className="section-block">
        <div className="section-heading">
          <div><p className="eyebrow">FROM YOUR GM</p><h3>Newly shared</h3></div>
          <button type="button" onClick={() => setActiveTab("journal")}>View journal</button>
        </div>
        <button className="shared-card card-button" type="button" onClick={() => { setSelectedJournal(shared); setActiveTab("journal"); }}>
          <span className="shared-symbol" aria-hidden="true">✦</span>
          <span className="shared-copy"><strong>{shared.title}</strong><small>{shared.summary}</small></span>
          <span className="chevron">›</span>
        </button>
      </section>}

      <section className="section-block session-card">
        <div><p className="eyebrow">NEXT SESSION</p><h3>{snapshot.session.title}</h3><p>{snapshot.session.subtitle}</p></div>
        <span className="date-tile"><strong>{dateNumber}</strong><small>{dateMonth}</small></span>
      </section>
    </>;
  }

  function CharacterView() {
    return <>
      <section className="page-intro"><p className="eyebrow">CHARACTER</p><h2>{displayName}</h2><p>{actor.ancestry} · Level {actor.level} {actor.classLabel}</p></section>
      <section className="hp-panel">
        <div><p className="eyebrow">HIT POINTS</p><strong>{actor.hp.value}<small> / {actor.hp.max}</small></strong></div>
        <div className="stepper"><button type="button" onClick={() => adjustHp(-1)}>−</button><button type="button" onClick={() => adjustHp(1)}>+</button></div>
      </section>
      <section className="ability-grid" aria-label="Ability scores">
        {actor.abilities.map((ability) => <article key={ability.key}><span>{ability.key}</span><strong>{signed(ability.modifier)}</strong><small>{ability.score}</small></article>)}
      </section>
      <section className="section-block">
        <div className="section-heading"><div><p className="eyebrow">READY TO USE</p><h3>Actions & spells</h3></div></div>
        <div className="list-stack">
          {actor.actions.map((action) => <button className="list-row" type="button" key={action.uuid} onClick={() => sendAction("useItem", { itemUuid: action.uuid }, `${action.name} sent to Foundry.`)}>
            <span className="list-glyph">◇</span><span><strong>{action.name}</strong><small>{action.type} · {action.uses}</small></span><span>Use</span>
          </button>)}
        </div>
      </section>
      <button className="primary-button full-button" type="button" onClick={() => sendAction("requestLevelUp", {}, "Your level-up request was sent to the GM.")}>Request edit or level up</button>
    </>;
  }

  function JournalView() {
    if (selectedJournal) return <article className="journal-reader">
      <button className="back-button" type="button" onClick={() => setSelectedJournal(null)}>‹ All journal entries</button>
      <p className="eyebrow">SHARED BY YOUR GM</p>
      <h2>{selectedJournal.title}</h2>
      <p className="journal-summary">{selectedJournal.summary}</p>
      {/* Foundry controls these GM-shared image URLs; they are not known at build time. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {selectedJournal.image && <img src={selectedJournal.image} alt="" />}
      <div className="journal-copy">{selectedJournal.content}</div>
    </article>;
    return <>
      <section className="page-intro"><p className="eyebrow">YOUR RECORD</p><h2>Journal</h2><p>Only notes your GM has shared with you appear here.</p></section>
      <div className="journal-list">
        {snapshot.journals.map((journal) => <button className="journal-card" type="button" key={journal.uuid} onClick={() => setSelectedJournal(journal)}>
          <span className="journal-number">{String(snapshot.journals.indexOf(journal) + 1).padStart(2, "0")}</span>
          <span><strong>{journal.title}</strong><small>{journal.summary}</small></span><span className="chevron">›</span>
        </button>)}
      </div>
    </>;
  }

  function ChatView() {
    return <>
      <section className="page-intro compact"><p className="eyebrow">AT THE TABLE</p><h2>Chat & dice</h2></section>
      <section className="dice-tray" aria-label="Dice tray">
        {[4, 6, 8, 10, 12, 20].map((sides) => <button type="button" key={sides} onClick={() => rollDie(sides)}><small>D</small>{sides}</button>)}
      </section>
      <section className="message-list" aria-live="polite">
        {snapshot.messages.map((message) => <article key={message.id} className={message.author === displayName ? "mine" : ""}>
          <span>{message.author}</span><p>{message.content}</p>{message.rollTotal !== undefined && <strong>{message.rollTotal}</strong>}
        </article>)}
      </section>
      <form className="chat-compose" onSubmit={sendChat}>
        <input value={chatText} onChange={(event) => setChatText(event.target.value)} placeholder="Message the table…" aria-label="Chat message" />
        <button type="submit" aria-label="Send message">↑</button>
      </form>
    </>;
  }

  function ShopView() {
    return <>
      <section className="page-intro"><p className="eyebrow">GM CURATED</p><h2>Campaign shop</h2><p>Purchases are sent to Foundry for approval and delivery.</p></section>
      <div className="shop-list">
        {snapshot.shop.map((item) => <article className="shop-card" key={item.uuid}>
          <div className="shop-glyph">♢</div><div><h3>{item.name}</h3><p>{item.description}</p><strong>{item.price} {item.currency}</strong></div>
          <button type="button" onClick={() => sendAction("purchase", { itemUuid: item.uuid, quantity: 1 }, `${item.name} added to your request.`)}>Request</button>
        </article>)}
      </div>
    </>;
  }

  if (mode !== "live") {
    const gateTitle = mode === "offline"
      ? "Foundry is offline"
      : mode === "pairing"
        ? pairingStep === "approval"
          ? "Waiting for your GM"
          : pairingStep === "account"
            ? "Choose your account"
            : pairingStep === "credential"
              ? "Finish your sign-in"
              : "Connect your campaign"
        : mode === "signin"
          ? `Welcome back, ${accountLink?.playerLabel || "adventurer"}`
        : mode === "waiting"
          ? "Waiting for your character"
          : "Checking your table…";
    const gateCopy = mode === "offline"
      ? "Ask the GM to open the Foundry world and enable the Pocket Chronicle module. This app remains locked while the bridge is offline."
      : mode === "pairing"
        ? pairingStep === "approval"
          ? "Your Foundry account is selected. The active GM must approve this phone before it can open campaign data."
          : pairingStep === "account"
            ? "Select your own Foundry user. Your GM will approve the request inside Foundry."
            : pairingStep === "credential"
              ? "Use a private Pocket Chronicle password for future visits. Never enter your Foundry password here."
              : "Enter the Campaign ID and permanent six-character Campaign code your GM set in the Pocket Chronicle Bridge settings."
        : mode === "signin"
          ? `Sign in to ${accountLink?.campaignName || "your campaign"}. Your Foundry password is never requested.`
        : mode === "waiting"
          ? "This phone is paired, but Foundry has not sent the first character update yet. Keep the world open for a moment."
          : "Looking for an active Pocket Chronicle module.";

    return (
      <main className="app-canvas">
        <section className="phone-shell connection-shell" aria-label="Pocket Chronicle connection">
          <header className="app-header">
            <div className="brand-lockup">
              <span className="brand-mark" aria-hidden="true">PC</span>
              <span><small className="eyebrow">FOUNDRY COMPANION</small><strong>Pocket Chronicle</strong></span>
            </div>
          </header>
          <section className="connection-gate" aria-live="polite">
            <span className={`gate-sigil ${mode === "pairing" ? "online" : ""}`} aria-hidden="true">◇</span>
            <p className="eyebrow">SECURE TABLE CONNECTION</p>
            <h1>{gateTitle}</h1>
            <p>{gateCopy}</p>
            {mode === "pairing" ? (
              <form className="connection-form" onSubmit={pairPhone}>
                {pairingFields()}
                {pairingError && <p className="form-error">{pairingError}</p>}
                {pairingStep !== "approval" && <button className="primary-button full-button" type="submit">{pairingButtonLabel()}</button>}
              </form>
            ) : mode === "signin" ? (
              <form className="connection-form" onSubmit={signIn}>
                <input className="password-input" type="password" autoComplete="current-password" minLength={8} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Pocket Chronicle password" aria-label="Pocket Chronicle password" required />
                {pairingError && <p className="form-error">{pairingError}</p>}
                <button className="primary-button full-button" type="submit">Sign in</button>
                <button className="demo-link" type="button" onClick={() => { setMode("pairing"); beginAnotherPairing(); setPairingOpen(false); }}>Use a different campaign</button>
              </form>
            ) : (
              <button className="secondary-button gate-button" type="button" onClick={() => { setMode("checking"); refreshConnection(); }}>Check again</button>
            )}
            <button className="install-gate-button" type="button" onClick={installApp}>⌂ Install on this phone</button>
            {notice && <p className="install-guidance">{notice}</p>}
          </section>
          <footer className="connection-footer">No Foundry password or Scene canvas is sent to this phone.</footer>
        </section>
      </main>
    );
  }

  return (
    <main className="app-canvas">
      <section className="phone-shell" aria-label="Pocket Chronicle phone app">
        <header className="app-header">
          <button className="brand-lockup brand-button" type="button" onClick={() => setActiveTab("home")}>
            <span className="brand-mark" aria-hidden="true">PC</span>
            <span><small className="eyebrow">FOUNDRY COMPANION</small><strong>Pocket Chronicle</strong></span>
          </button>
          <button className="quiet-button" type="button" aria-label="Account and connection settings" onClick={() => setSettingsOpen(true)}>•••</button>
        </header>

        <div className="connection-strip" role="status">
          <span className="status-dot" aria-hidden="true" />
          <span>Connected to {snapshot.campaign.name}</span>
          <span className="edition-badge">{snapshot.campaign.edition}</span>
        </div>

        <div className={`scroll-view tab-${activeTab}`}>
          {activeTab === "home" && HomeView()}
          {activeTab === "character" && CharacterView()}
          {activeTab === "journal" && JournalView()}
          {activeTab === "chat" && ChatView()}
          {activeTab === "shop" && ShopView()}
        </div>

        <nav className="bottom-nav" aria-label="Primary navigation">
          {tabs.map((tab) => <button key={tab.id} type="button" className={activeTab === tab.id ? "active" : ""} onClick={() => { setActiveTab(tab.id); if (tab.id !== "journal") setSelectedJournal(null); }} aria-current={activeTab === tab.id ? "page" : undefined}>
            <span aria-hidden="true">{tab.mark}</span><small>{tab.label}</small>
          </button>)}
        </nav>

        {notice && <div className="toast" role="status">{notice}</div>}

        {settingsOpen && <div className="modal-layer" role="dialog" aria-modal="true" aria-label="Pocket Chronicle settings">
          <button className="modal-scrim" type="button" aria-label="Close settings" onClick={() => setSettingsOpen(false)} />
          <section className="bottom-sheet">
            <div className="sheet-handle" />
            <p className="eyebrow">POCKET CHRONICLE</p><h2>Phone settings</h2>
            <div className="setting-row"><span><strong>{accountLink?.playerLabel || "Player account"}</strong><small>{snapshot.campaign.name} · {characters.length} character{characters.length === 1 ? "" : "s"}</small></span><span className="edition-badge">Live</span></div>
            <button className="sheet-action" type="button" onClick={installApp}><span>⌂</span><span><strong>Install on this phone</strong><small>Use it like an app from your home screen.</small></span></button>
            <button className="sheet-action" type="button" onClick={beginAnotherPairing}><span>◇</span><span><strong>Connect another campaign</strong><small>Use its Campaign ID and permanent six-character code.</small></span></button>
            <button className="secondary-button full-button" type="button" onClick={() => setSettingsOpen(false)}>Done</button>
          </section>
        </div>}

        {pairingOpen && <div className="modal-layer pair-layer" role="dialog" aria-modal="true" aria-labelledby="pair-title">
          <button className="modal-scrim" type="button" aria-label="Close pairing" onClick={() => setPairingOpen(false)} />
          <form className="pair-card" onSubmit={pairPhone}>
            <button className="close-button" type="button" aria-label="Close" onClick={() => setPairingOpen(false)}>×</button>
            <p className="eyebrow">CONNECT SAFELY</p><h2 id="pair-title">{pairingStep === "approval" ? "Waiting for your GM" : pairingStep === "account" ? "Choose your account" : pairingStep === "credential" ? "Finish your sign-in" : "Connect a campaign"}</h2>
            <p>{pairingStep === "approval" ? "Keep this open while your GM approves the phone in Foundry." : pairingStep === "account" ? "Select your own Foundry player account." : pairingStep === "credential" ? "This password belongs only to Pocket Chronicle." : "Enter the Campaign ID and permanent six-character code set by your GM."}</p>
            {pairingFields()}
            {pairingError && <p className="form-error">{pairingError}</p>}
            {pairingStep !== "approval" && <button className="primary-button full-button" type="submit">{pairingButtonLabel()}</button>}
          </form>
        </div>}
      </section>
    </main>
  );
}
