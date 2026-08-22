import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function requestWorker(request) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    request,
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

async function render() {
  return requestWorker(new Request("http://localhost/", { headers: { accept: "text/html" } }));
}

test("server-renders Pocket Chronicle", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Pocket Chronicle<\/title>/i);
  assert.match(html, /Pocket Chronicle/);
  assert.match(html, /Foundry companion/i);
  assert.doesNotMatch(html, /Your site is taking shape/i);
});

test("ships the installable app and secure bridge boundaries", async () => {
  const [page, mobile, mobileScript, recovery, layout, manifest, serviceWorker, schema, bridge, compatibilityLoader, moduleManifest, heartbeat, security, accountMigration, accessMigration, packageJson, worker] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/mobile.html", import.meta.url), "utf8"),
    readFile(new URL("../public/mobile.js", import.meta.url), "utf8"),
    readFile(new URL("../public/recover.html", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../foundry/pocket-chronicle-bridge/scripts/bridge-v056.js", import.meta.url), "utf8"),
    readFile(new URL("../foundry/pocket-chronicle-bridge/scripts/bridge.js", import.meta.url), "utf8"),
    readFile(new URL("../foundry/pocket-chronicle-bridge/module.json", import.meta.url), "utf8"),
    readFile(new URL("../app/api/bridge/heartbeat/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/security.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0002_thankful_white_tiger.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0003_flowery_matthew_murdock.sql", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(page, /DEMO24/);
  assert.match(page, /Foundry is offline/);
  assert.match(page, /requestLevelUp/);
  assert.match(page, /Install on this phone/);
  assert.match(page, /Pocket Chronicle account password/);
  assert.match(page, /No GM approval is needed/);
  assert.match(page, /six-character Campaign code/);
  assert.match(page, /Continue with password/);
  assert.match(page, /Request first-time approval/);
  assert.match(page, /characters\.map/);
  assert.match(layout, /manifest:\s*"\/manifest\.webmanifest"/);
  assert.match(manifest, /"orientation": "portrait-primary"/);
  assert.match(manifest, /"id": "\/"/);
  assert.match(manifest, /"scope": "\/"/);
  assert.match(manifest, /"start_url": "\/mobile\.html\?pwa=13"/);
  assert.doesNotMatch(serviceWorker, /addEventListener\("fetch"/);
  assert.match(serviceWorker, /key\.startsWith\("pocket-chronicle-"\)/);
  assert.doesNotMatch(page, /window\.location\.replace/);
  assert.match(mobile, /mobile\.js\?v=1/);
  assert.match(mobile, /Foundry companion/i);
  assert.doesNotMatch(mobile, /butterfly/i);
  assert.match(mobileScript, /\/api\/campaign\/connect/);
  assert.match(mobileScript, /\/api\/sign-in/);
  assert.match(mobileScript, /requestLevelUp/);
  assert.match(mobileScript, /updateBiography/);
  assert.doesNotMatch(mobileScript, /location\.(?:replace|reload)/);
  assert.match(recovery, /\/mobile\.html\?recovered=/);
  assert.match(schema, /export const tenants/);
  assert.match(schema, /export const playerSessions/);
  assert.match(schema, /export const playerAccounts/);
  assert.match(schema, /export const playerAccountCharacters/);
  assert.match(schema, /export const accountPairingCodes/);
  assert.match(schema, /export const phoneAccessRequests/);
  assert.match(bridge, /Module Management/);
  assert.match(bridge, /api\/bridge\/heartbeat/);
  assert.match(bridge, /api\/bridge\/campaign-code/);
  assert.match(bridge, /core", "noCanvas/);
  assert.match(bridge, /hasCompleteConfig/);
  assert.match(bridge, /AbortController/);
  assert.match(bridge, /pushAllSnapshots\.pending/);
  assert.match(bridge, /wakeBridge/);
  assert.match(bridge, /campaignCode/);
  assert.ok(bridge.indexOf('"campaignId"') < bridge.indexOf('"campaignCode"'));
  assert.ok(bridge.indexOf('"campaignCode"') < bridge.indexOf('"bridgeKey"'));
  assert.match(bridge, /Check Phone Requests/);
  assert.match(bridge, /api\/bridge\/access-requests/);
  assert.match(compatibilityLoader, /bridge-v056\.js/);
  assert.match(moduleManifest, /bridge-v056\.js/);
  assert.doesNotMatch(heartbeat, /pairingPasswordHash/);
  assert.match(heartbeat, /lastSeenAt/);
  assert.match(security, /PBKDF2/);
  assert.match(accountMigration, /CREATE TABLE `player_accounts`/);
  assert.match(accessMigration, /CREATE TABLE `phone_access_requests`/);
  assert.match(accessMigration, /pairing_password_hash/);
  assert.match(worker, /request\.method === "OPTIONS"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});

test("allows authenticated bridge traffic from any HTTPS Foundry server", async () => {
  const response = await requestWorker(new Request("http://localhost/api/bridge/heartbeat", {
    method: "OPTIONS",
    headers: {
      origin: "https://foundry.example.com",
      "access-control-request-method": "POST",
      "access-control-request-headers": "authorization,content-type,x-pocket-campaign",
    },
  }));

  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), "https://foundry.example.com");
  assert.match(response.headers.get("access-control-allow-headers") ?? "", /x-pocket-campaign/);
});
