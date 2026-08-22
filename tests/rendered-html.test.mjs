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
  const [page, layout, manifest, schema, bridge, packageJson, worker] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../foundry/pocket-chronicle-bridge/scripts/bridge.js", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(page, /DEMO24/);
  assert.match(page, /Foundry is offline/);
  assert.match(page, /requestLevelUp/);
  assert.match(layout, /manifest:\s*"\/manifest\.webmanifest"/);
  assert.match(manifest, /"orientation": "portrait-primary"/);
  assert.match(schema, /export const tenants/);
  assert.match(schema, /export const playerSessions/);
  assert.match(bridge, /only the active GM|activeGms/i);
  assert.match(bridge, /api\/bridge\/heartbeat/);
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
