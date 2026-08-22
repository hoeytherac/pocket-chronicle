# Security and privacy

Pocket Chronicle is designed so a lost phone does not reveal a Foundry password or bridge key.

## Trust boundaries

- Bridge keys are long random secrets stored in Foundry world settings and hashed in D1.
- Players receive single-use six-character pairing codes that expire after ten minutes.
- Paired sessions use opaque, hashed tokens in Secure, HttpOnly, SameSite cookies.
- Character and campaign IDs come from the authenticated session, never from a browser-supplied tenant field.
- The bridge sends a sanitized allowlist rather than serializing Actor, Journal, User, or World documents wholesale.
- Journal entries and shop items must be explicitly shared by the GM.
- Phone actions are validated against a fixed allowlist and revalidated inside Foundry.

## Before a public commercial launch

- Add a supported customer identity provider for DM accounts and organization membership.
- Add rate limits for pairing, chat, rolls, and action creation.
- Add audit logs for admin, subscription, pairing, and bridge-key changes.
- Add bridge-key rotation and player-session revocation controls.
- Encrypt particularly sensitive dossier fields at rest if commercial requirements call for it.
- Complete a privacy policy, retention policy, terms of service, and incident-response procedure.
- Run an external security review and dependency audit.

Never commit `.env` files, bootstrap tokens, bridge keys, payment keys, or live player exports.
