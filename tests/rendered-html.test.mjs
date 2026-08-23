import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

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
  const [page, mobile, mobileScript, mobileStyle, recovery, layout, manifest, serviceWorker, schema, bridge, compatibilityLoader, moduleManifest, heartbeat, bridgeAccessRequests, campaignAccessRequests, completeAccessRequest, security, accountMigration, accessMigration, packageJson, worker] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/mobile.html", import.meta.url), "utf8"),
    readFile(new URL("../public/mobile.js", import.meta.url), "utf8"),
    readFile(new URL("../public/mobile.css", import.meta.url), "utf8"),
    readFile(new URL("../public/recover.html", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../foundry/pocket-chronicle-bridge/scripts/bridge-v0120.js", import.meta.url), "utf8"),
    readFile(new URL("../foundry/pocket-chronicle-bridge/scripts/bridge.js", import.meta.url), "utf8"),
    readFile(new URL("../foundry/pocket-chronicle-bridge/module.json", import.meta.url), "utf8"),
    readFile(new URL("../app/api/bridge/heartbeat/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/bridge/access-requests/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/campaign/access-requests/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/campaign/access-requests/[id]/complete/route.ts", import.meta.url), "utf8"),
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
  assert.match(manifest, /"start_url": "\/mobile\.html\?pwa=27"/);
  assert.doesNotMatch(serviceWorker, /addEventListener\("fetch"/);
  assert.match(serviceWorker, /key\.startsWith\("pocket-chronicle-"\)/);
  assert.doesNotMatch(page, /window\.location\.replace/);
  assert.match(mobile, /mobile\.js\?v=15/);
  assert.match(mobile, /mobile\.css\?v=15/);
  assert.match(mobile, /data-tab="spells"/);
  assert.match(mobile, /data-tab="effects"/);
  assert.match(mobile, /Foundry companion/i);
  assert.doesNotMatch(mobile, /butterfly/i);
  assert.match(mobileScript, /\/api\/campaign\/connect/);
  assert.match(mobileScript, /\/api\/sign-in/);
  assert.match(mobileScript, /requestLevelUp/);
  assert.match(mobileScript, /updateBiography/);
  assert.match(mobileScript, /recordDeathSave/);
  assert.match(mobileScript, /rollLocalFormula/);
  assert.match(mobileScript, /Phone roll history/);
  assert.match(mobileScript, /hp-damage/);
  assert.match(mobileScript, /hp-healing/);
  assert.match(mobileScript, /hp-temp/);
  assert.match(mobileScript, /setTempHp/);
  assert.match(mobileScript, /takeRationsRest/);
  assert.match(mobileScript, /Rest & Rations/);
  assert.match(mobileScript, /resource-disclosure/);
  assert.match(mobileScript, /hpChange = isDamage \? -amount : amount/);
  assert.match(mobileScript, /consumeItem/);
  assert.match(mobileScript, /showDice/);
  assert.match(mobileScript, /activity-card/);
  assert.match(mobileScript, /rollsByLevel/);
  assert.match(mobileScript, /slotKey/);
  assert.doesNotMatch(mobileScript, /phone-dice-tray|phone-die/);
  assert.doesNotMatch(mobileScript, /vendor\/dice-box/);
  assert.doesNotMatch(mobileScript, /rollPhysicalDice|physicalDiceDisabled|Physics dice/);
  assert.match(mobileScript, /rollSparkles/);
  assert.match(mobileScript, /resultCoin/);
  assert.match(mobileScript, /Tap anywhere to close · Stays open for 30 seconds/);
  assert.match(mobileScript, /window\.setTimeout\(close, 30000\)/);
  assert.match(mobileStyle, /grid-template-columns: repeat\(7, 1fr\)/);
  assert.match(mobileStyle, /grid-template-rows: minmax\(0, 1fr\)/);
  assert.match(mobileStyle, /flex: 0 0 calc\(64px \+ env\(safe-area-inset-bottom\)\)/);
  assert.doesNotMatch(mobileStyle, /clamp\(136px, 18dvh, 170px\)/);
  assert.match(mobileStyle, /bottom-nav button::before/);
  assert.doesNotMatch(mobileStyle, /bottom-nav button:nth-child\(n \+ 5\)/);
  assert.match(mobileStyle, /roll-coin-reveal/);
  assert.match(mobileStyle, /roll-sparkle/);
  assert.match(mobileStyle, /roll-hold 30s/);
  assert.match(mobileScript, /await rollLocalFormula\("Death saving throw"/);
  assert.match(mobileScript, /consumptionByOption/);
  assert.match(mobileScript, /Native rolls and charges work here/);
  assert.match(mobileScript, /\["action", "Actions"\], \["feat", "Feats"\], \["item", "Items"\]/);
  assert.match(mobileScript, /parseExpression/);
  assert.match(mobileScript, /renderSpells/);
  assert.match(mobileScript, /renderEffects/);
  assert.match(mobileScript, /rollActivitySequence/);
  assert.match(mobileScript, /Roll attack \+ damage/);
  assert.match(mobileScript, /Spell slots/);
  assert.match(mobileScript, /Saving throws/);
  assert.match(mobileScript, /sheet-category/);
  assert.match(mobileScript, /Forgot or reset this password/);
  assert.match(mobileScript, /password-reset-campaign/);
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
  assert.match(bridge, /requestedByFoundryUserId/);
  assert.match(bridge, /GM-authored roll card/);
  assert.match(bridge, /recordDeathSave/);
  assert.match(bridge, /setTempHp/);
  assert.match(bridge, /registerExtension/);
  assert.match(bridge, /executeExtensionAction/);
  assert.match(bridge, /Open Shop Manager/);
  assert.match(bridge, /currencyTotal/);
  assert.match(bridge, /consumeItem/);
  assert.match(bridge, /activity\.consume/);
  assert.doesNotMatch(bridge, /await activity\.use/);
  assert.match(bridge, /actorResourceTrackers/);
  assert.match(bridge, /consumptionByOption/);
  assert.match(bridge, /moduleIntegrations/);
  assert.doesNotMatch(bridge, /slice\(0, 160\)/);
  assert.match(bridge, /subsequentActions: false/);
  assert.match(bridge, /create: false/);
  assert.match(bridge, /itemLocalRolls/);
  assert.match(bridge, /itemActivityData/);
  assert.match(bridge, /getDamageConfig/);
  assert.match(bridge, /getAttackData/);
  assert.match(bridge, /scalingIncrease/);
  assert.match(bridge, /actorEffectData/);
  assert.doesNotMatch(bridge, /item\.clone\(/);
  assert.doesNotMatch(bridge, /prepareFinalAttributes/);
  assert.match(bridge, /activityId/);
  assert.match(bridge, /slotKey/);
  assert.doesNotMatch(bridge, /actor\.applyDamage/);
  assert.match(bridge, /pocketChronicle: true/);
  assert.match(bridge, /actorSpellSlots/);
  assert.match(bridge, /game\.dice3d\.show/);
  assert.match(bridge, /dice-so-nice/);
  assert.match(bridge, /activePhoneUserId/);
  assert.ok(bridge.indexOf('"campaignId"') < bridge.indexOf('"campaignCode"'));
  assert.ok(bridge.indexOf('"campaignCode"') < bridge.indexOf('"bridgeKey"'));
  assert.match(bridge, /api\/bridge\/access-requests/);
  assert.match(bridge, /Check Requests \/ Resets/);
  assert.match(bridge, /Approve Reset/);
  assert.match(compatibilityLoader, /bridge-v0120\.js/);
  assert.match(moduleManifest, /bridge-v0120\.js/);
  assert.match(moduleManifest, /"version": "0\.13\.0"/);
  assert.doesNotMatch(heartbeat, /pairingPasswordHash/);
  assert.match(heartbeat, /lastSeenAt/);
  assert.match(bridgeAccessRequests, /password-reset/);
  assert.match(campaignAccessRequests, /requestKind/);
  assert.doesNotMatch(campaignAccessRequests, /already has a password and does not need GM approval/);
  assert.match(completeAccessRequest, /passwordWasReset/);
  assert.match(completeAccessRequest, /delete\(playerSessions\)/);
  assert.match(security, /PBKDF2/);
  assert.match(accountMigration, /CREATE TABLE `player_accounts`/);
  assert.match(accessMigration, /CREATE TABLE `phone_access_requests`/);
  assert.match(accessMigration, /pairing_password_hash/);
  assert.match(worker, /request\.method === "OPTIONS"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});

test("understands Foundry D&D5e roll formulas used by synchronized activities", async () => {
  const source = await readFile(new URL("../public/mobile.js", import.meta.url), "utf8");
  const storage = new Map();
  const context = {
    console,
    crypto: webcrypto,
    navigator: { userAgent: "test" },
    setTimeout,
    clearTimeout,
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    },
    document: { addEventListener() {} },
    __POCKET_TEST_MODE__: true,
  };
  context.window = context;
  vm.runInNewContext(source, context);
  const evaluate = context.__POCKET_TEST__.evaluateLocalFormula;
  const healing = evaluate("(4)d4");
  assert.equal(healing.dice.length, 4);
  assert.ok(healing.total >= 4 && healing.total <= 16);
  const exploding = evaluate("1d8x5=8++1d10", [{ sides: 8, result: 8 }, { sides: 10, result: 6 }]);
  assert.ok(exploding);
  assert.ok(exploding.dice.length >= 3);
  assert.ok(evaluate("floor(10/2)").total === 5);
  assert.ok(evaluate("1d20+(5+4+2)"));
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
