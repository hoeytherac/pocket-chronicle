# Changelog

## 0.1.2

- Removed all remaining campaign-specific iconography and wording.
- Removed automatic phone opening, viewport mutation, and orientation locking.
- Kept device-aware full-screen styling without changing the browser's own viewport settings.
- Marked the in-world mobile interface as experimental because Foundry core does not officially support mobile browsers.

## 0.1.1

- Replaced the original campaign glyph with a neutral book-and-phone identity.
- Added reliable phone detection using browser, touch, and physical screen signals.
- Forced Pocket Chronicle to fill the real phone viewport even when Foundry reports a desktop-sized layout.
- Added a portrait-orientation screen with an optional landscape override.
- Improved safe-area and bottom-navigation sizing on phones.

## 0.1.0

- Added the full-screen phone-first Pocket Chronicle interface.
- Added quick character play and access to the native edit/level-up sheet.
- Added journals, GM-shared pictures and notes, chat, a dice tray, and a GM-curated shop.
- Added an optional client-only Map-Free Mode and avoided all Scene/Canvas API use.
