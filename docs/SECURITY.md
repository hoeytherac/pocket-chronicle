# Security and privacy

Pocket Chronicle is designed so a lost phone does not reveal a Foundry password or bridge key.

## Trust boundaries

- Bridge keys are long random secrets stored in Foundry world settings and hashed in D1.
- Players enter the permanent six-character Campaign code, select an existing Foundry user, and wait for the active GM to approve that phone. Access requests expire after ten minutes.
- The Campaign code is protected with a salted PBKDF2 hash in the relay database. It is never the Foundry administrator password.
- Pocket Chronicle passwords are separate from Foundry passwords and are stored only as salted PBKDF2 hashes.
- Paired sessions use opaque, hashed tokens in Secure, HttpOnly, SameSite cookies.
- Character actions are accepted only for Actor UUIDs currently mapped to the signed-in Foundry account with Owner permission.
- Campaign IDs come from the authenticated session, never from a browser-supplied tenant field.
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
