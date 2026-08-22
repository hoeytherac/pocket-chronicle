import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { makeDiceFormula } from "../scripts/utils.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(resolve(root, "module.json"), "utf8"));
const required = ["id", "title", "version", "compatibility", "esmodules", "styles"];
for (const key of required) {
  if (!manifest[key]) throw new Error(`module.json is missing ${key}`);
}
if (manifest.id !== "pocket-chronicle") throw new Error("Unexpected module id");
for (const path of [...manifest.esmodules, ...manifest.styles, ...(manifest.languages ?? []).map((entry) => entry.path)]) {
  await readFile(resolve(root, path));
}

const utilsSource = await readFile(resolve(root, "scripts/utils.js"), "utf8");
const entrySource = await readFile(resolve(root, "scripts/pocket-chronicle.js"), "utf8");
if (!utilsSource.includes("makeDiceFormula")) throw new Error("Dice helper is missing");
if (!entrySource.includes("new Roll")) throw new Error("Dice rolling is not wired");
if (entrySource.includes("canvas.")) throw new Error("The map-free module must not call the Foundry canvas API");
if (makeDiceFormula(20, 1, 5, "advantage") !== "2d20kh + 5") throw new Error("Advantage formula is incorrect");
if (makeDiceFormula(6, 2, -1) !== "2d6 - 1") throw new Error("Dice modifier formula is incorrect");

console.log(`Validated ${manifest.title} v${manifest.version}: manifest, referenced files, dice integration, and no Canvas API usage.`);
