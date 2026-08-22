"use client";

import { useEffect, useMemo, useState } from "react";
import { demoSnapshot } from "@/lib/demo-data";
import type { ChronicleActionKind, ChronicleJournal, ChronicleSnapshot } from "@/lib/protocol";

type Tab = "home" | "character" | "journal" | "chat" | "shop";
type InstallPrompt = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

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

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [snapshot, setSnapshot] = useState<ChronicleSnapshot>(demoSnapshot);
  const [mode, setMode] = useState<"demo" | "live">("demo");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pairingOpen, setPairingOpen] = useState(false);
  const [pairingCode, setPairingCode] = useState("");
  const [pairingError, setPairingError] = useState("");
  const [selectedJournal, setSelectedJournal] = useState<ChronicleJournal | null>(null);
  const [chatText, setChatText] = useState("");
  const [notice, setNotice] = useState("");
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const actor = snapshot.actor;

  useEffect(() => {
    const capture = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", capture);
    return () => window.removeEventListener("beforeinstallprompt", capture);
  }, []);

  useEffect(() => {
    if (mode !== "live") return;
    const refresh = async () => {
      const response = await fetch("/api/state", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json() as { snapshot: ChronicleSnapshot };
      setSnapshot(data.snapshot);
    };
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => window.clearInterval(timer);
  }, [mode]);

  const displayName = useMemo(() => actor.name.split(" ").slice(0, 2).join(" "), [actor.name]);

  async function sendAction(kind: ChronicleActionKind, payload: Record<string, unknown>, success: string) {
    if (mode === "live") {
      const response = await fetch("/api/actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, payload }),
      });
      if (!response.ok) {
        setNotice("Foundry could not receive that action yet.");
        return false;
      }
    }
    setNotice(success);
    window.setTimeout(() => setNotice(""), 2600);
    return true;
  }

  async function pairPhone(event: React.FormEvent) {
    event.preventDefault();
    setPairingError("");
    const normalized = pairingCode.replace(/[^a-z0-9]/gi, "").toUpperCase();
    if (normalized === "DEMO24") {
      setMode("demo");
      setSnapshot(demoSnapshot);
      setPairingOpen(false);
      setSettingsOpen(false);
      setNotice("Preview campaign paired.");
      return;
    }
    const response = await fetch("/api/pair", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: normalized }),
    });
    const data = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) {
      setPairingError(data.error || "That pairing code did not work.");
      return;
    }
    setMode("live");
    setPairingOpen(false);
    setSettingsOpen(false);
    setNotice("Phone paired with Foundry.");
  }

  async function adjustHp(amount: number) {
    if (!(await sendAction("adjustHp", { amount }, "Hit points sent to Foundry."))) return;
    if (mode === "demo") {
      setSnapshot((current) => ({
        ...current,
        actor: {
          ...current.actor,
          hp: { ...current.actor.hp, value: Math.max(0, Math.min(current.actor.hp.max, current.actor.hp.value + amount)) },
        },
      }));
    }
  }

  async function rollDie(sides: number) {
    const randomValue = new Uint32Array(1);
    crypto.getRandomValues(randomValue);
    const result = (randomValue[0] % sides) + 1;
    await sendAction("roll", { formula: `1d${sides}` }, `Rolled 1d${sides}: ${result}`);
    if (mode === "demo") {
      setSnapshot((current) => ({
        ...current,
        messages: [...current.messages, { id: crypto.randomUUID(), author: displayName, content: `Rolled 1d${sides}`, rollTotal: result, timestamp: Date.now() }],
      }));
    }
  }

  async function sendChat(event: React.FormEvent) {
    event.preventDefault();
    const content = chatText.trim();
    if (!content || !(await sendAction("chat", { content }, "Message sent to Foundry chat."))) return;
    if (mode === "demo") {
      setSnapshot((current) => ({
        ...current,
        messages: [...current.messages, { id: crypto.randomUUID(), author: displayName, content, timestamp: Date.now() }],
      }));
    }
    setChatText("");
  }

  async function installApp() {
    if (installPrompt) {
      await installPrompt.prompt();
      setInstallPrompt(null);
      return;
    }
    setNotice("On iPhone, choose Share, then Add to Home Screen.");
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
          <span>{mode === "demo" ? "Previewing" : "Connected to"} {snapshot.campaign.name}</span>
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
            <div className="setting-row"><span><strong>Campaign</strong><small>{snapshot.campaign.name}</small></span><span className="edition-badge">{mode === "demo" ? "Preview" : "Live"}</span></div>
            <button className="sheet-action" type="button" onClick={installApp}><span>⌂</span><span><strong>Install on this phone</strong><small>Use it like an app from your home screen.</small></span></button>
            <button className="sheet-action" type="button" onClick={() => setPairingOpen(true)}><span>◇</span><span><strong>Pair another campaign</strong><small>Enter the temporary code from your GM.</small></span></button>
            <button className="secondary-button full-button" type="button" onClick={() => setSettingsOpen(false)}>Done</button>
          </section>
        </div>}

        {pairingOpen && <div className="modal-layer pair-layer" role="dialog" aria-modal="true" aria-labelledby="pair-title">
          <button className="modal-scrim" type="button" aria-label="Close pairing" onClick={() => setPairingOpen(false)} />
          <form className="pair-card" onSubmit={pairPhone}>
            <button className="close-button" type="button" aria-label="Close" onClick={() => setPairingOpen(false)}>×</button>
            <p className="eyebrow">CONNECT SAFELY</p><h2 id="pair-title">Pair this phone</h2>
            <p>Ask your GM for a six-character code. It expires after ten minutes and never reveals a Foundry password.</p>
            <input autoCapitalize="characters" autoComplete="one-time-code" maxLength={7} value={pairingCode} onChange={(event) => setPairingCode(event.target.value.toUpperCase())} placeholder="ABC 123" aria-label="Pairing code" />
            {pairingError && <p className="form-error">{pairingError}</p>}
            <button className="primary-button full-button" type="submit">Connect campaign</button>
            <button className="demo-link" type="button" onClick={() => setPairingCode("DEMO24")}>Use preview code DEMO24</button>
          </form>
        </div>}
      </section>
    </main>
  );
}
