// Bundles src/ into a single self-contained dist/index.html (all assets as data URIs).
//
//   node tools/build.mjs [--amount=125] [--unit="giros gratis"] [--url=https://...] [--out=dist/index.html]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = resolve(ROOT, "src");

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = /^--([^=]+)=(.*)$/.exec(a);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
  })
);
const OUT = resolve(ROOT, args.out || "dist/index.html");

const MIME = {
  ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml", ".woff2": "font/woff2",
};

const dataUri = (file) => {
  const type = MIME[extname(file).toLowerCase()];
  if (!type) throw new Error(`Unknown asset type: ${file}`);
  return `data:${type};base64,${readFileSync(file).toString("base64")}`;
};

const inlineCss = (file) => {
  const dir = dirname(file);
  return readFileSync(file, "utf8")
    .replace(/url\((["']?)(?!data:)([^"')]+)\1\)/g, (_, q, p) => `url("${dataUri(resolve(dir, p))}")`)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\s*([{};,])\s*/g, "$1");
};

const overrides = {};
if (args.amount) overrides.bonusAmount = Number(args.amount);
if (args.url) overrides.clickUrl = args.url;
if (args.unit) overrides.bonusUnit = args.unit;

let html = readFileSync(resolve(SRC, "index.html"), "utf8");
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, p) => `<style>${inlineCss(resolve(SRC, p))}</style>`);
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, p) => {
  let js = readFileSync(resolve(SRC, p), "utf8");
  if (p === "config.js" && Object.keys(overrides).length) {
    js += `\nObject.assign(window.PLAYABLE_CONFIG, ${JSON.stringify(overrides)});`;
  }
  return `<script>\n${js}\n</script>`;
});
html = html.replace(/<!--[\s\S]*?-->\s*/g, "");

const left = html.match(/(src|href)="(?!data:|https?:|#)[^"]+"/g);
if (left) throw new Error(`Not inlined: ${left.join(", ")}`);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html);
const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`Built ${OUT} — ${kb} KB`, Object.keys(overrides).length ? overrides : "");
