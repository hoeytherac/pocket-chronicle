# Pocket Chronicle architecture

## Why it is a separate app

The phone does not open Foundry's `/game` page. It never creates a Scene canvas, renders Pixi, loads map assets, or exposes Foundry's desktop controls. This avoids the unsupported mobile layout that caused landscape sizing, repeated Safari failures, and Chrome incompatibility.

## Data flow

```text
Player phone PWA
    ↕ HTTPS (paired session)
Pocket Chronicle relay + D1
    ↕ HTTPS (campaign bridge key)
Active GM's Foundry bridge
    ↕ Foundry documents and rolls
Foundry world
```

The active GM bridge sends sanitized snapshots. The phone submits small, typed actions. Foundry remains authoritative: the bridge validates and performs each action, then refreshes the snapshot.

## Storage model

- `tenants` separates DMs and carries edition/subscription state.
- `campaigns` belongs to exactly one tenant and stores only a hash of its bridge key.
- `pairing_codes` are single-use and expire after ten minutes.
- `player_sessions` store only hashed opaque tokens and expire after thirty days.
- `snapshots` are isolated by tenant, campaign, and Actor UUID.
- `actions` are isolated by tenant, campaign, character, and paired player session.

Every server-side character query derives tenant and campaign from an authenticated session or bridge key. The browser is never allowed to choose a tenant ID.

## Relay behavior

The first release uses short HTTPS polling: approximately two seconds for player actions and thirty seconds for a full snapshot, with event-driven refreshes after Foundry document changes. This is intentionally simple and reliable on serverless hosting. A durable WebSocket service can replace polling later without changing the phone protocol.

## Foundry authority

Player actions are an allowlist, not arbitrary Foundry commands. The bridge currently supports HP changes, item use, dice rolls, chat, shop delivery, biography updates, and GM-visible level-up requests. Automatic level changes are deliberately excluded; they need game-system-specific validation and GM approval.
