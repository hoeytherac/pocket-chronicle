import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
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
  const [page, layout, manifest, schema, bridge, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../foundry/pocket-chronicle-bridge/scripts/bridge.js", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(page, /DEMO24/);
  assert.match(page, /requestLevelUp/);
  assert.match(layout, /manifest:\s*"\/manifest\.webmanifest"/);
  assert.match(manifest, /"orientation": "portrait-primary"/);
  assert.match(schema, /export const tenants/);
  assert.match(schema, /export const playerSessions/);
  assert.match(bridge, /only the active GM|activeGms/i);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
