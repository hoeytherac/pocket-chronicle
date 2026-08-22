import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const source = await readFile(new URL("../public/favicon.svg", import.meta.url));
const sizes = [180, 192, 512];

for (const size of sizes) {
  const glyphSize = Math.round(size * 0.64);
  const glyph = await sharp(source).resize(glyphSize, glyphSize).png().toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: "#0f1117" },
  })
    .composite([{ input: glyph, gravity: "center" }])
    .png()
    .toFile(fileURLToPath(new URL(`../public/icon-${size}.png`, import.meta.url)));
}
