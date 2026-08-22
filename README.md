# Pocket Chronicle

Pocket Chronicle is a lightweight, map-free phone interface for Foundry VTT. It gives players the parts of Foundry they need during play without squeezing the desktop Scene and controls onto a small screen.

## First-release features

- A touch-friendly quick character sheet for owned characters
- HP changes, ability checks, saving throws, skills, item use, and rests
- One-tap access to the real Foundry character sheet for every system/module function, editing, and level-up workflows
- Permission-aware journal reading
- A GM-curated gallery for journal pages, handouts, and pictures
- Mobile chat with recent roll cards and messages
- A built-in dice tray and custom formulas; rolls use Foundry chat so Dice So Nice and similar roll listeners can respond
- A GM-curated shop that safely asks the active GM to fulfill purchases, deducts the listed D&D 5e coin, and adds the purchased Item to the selected actor
- Optional per-browser Map-Free Mode using Foundry's own Disable Canvas setting when it is available
- No Scene or Canvas API calls in the module

## Install for local testing

1. Create a folder named `pocket-chronicle` inside Foundry's `Data/modules` folder.
2. Copy this repository's contents into that folder.
3. Restart Foundry, enable **Pocket Chronicle** in the world, and reload.
4. Open it with the blue butterfly button or the **P** key.

For the best phone performance, open the Home tab once and choose **Enable Map-Free Mode**. That is a client-only Foundry preference, so it affects the phone browser without disabling the map on the GM's computer.

## Install from GitHub

Paste this address into Foundry's **Install Module** manifest URL field:

`https://github.com/hoeytherac/pocket-chronicle/releases/latest/download/module.json`

## GM workflow

Open **GM Tools** in Pocket Chronicle.

- Drag a Journal Entry or Journal page into the Shared Gallery area.
- Use the image form to publish a picture or handout path.
- Drag a world Item into Pocket Shop to stock it with its current image, description, and D&D 5e price.

The Shared Gallery stores a player-safe snapshot of a dropped journal page, removing Foundry secret sections. This lets players see exactly what the GM publishes without opening the rest of a private journal. Drop the page again to refresh its snapshot. Published image paths and snapshots are intentionally public to players in that world. The separate Journals tab still follows ordinary Foundry journal permissions.

## Character compatibility

The fast sheet understands common D&D 5e data for HP, AC, speed, abilities, skills, currency, items, and rests. The **Edit / Level Up** button opens the actor's actual configured sheet, preserving features added by the game system and other modules. In a non-D&D system, generic browsing remains available and unsupported quick actions fall back to that full sheet.

## Performance approach

Pocket Chronicle deliberately does not render maps, tokens, walls, lighting, or scene controls. Shared images use native lazy loading, the chat list is capped, and document updates are debounced. Foundry itself loads before world modules, so the optional Foundry **Disable Canvas** client setting is the reliable way to prevent canvas initialization on later phone visits.

## Current scope

This is an initial `0.1.0` build for Foundry VTT 13, with forward-compatible styling and feature detection for Foundry 14. It should be tested in a copy of the campaign world before release.
