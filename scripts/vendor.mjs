#!/usr/bin/env node
/* vendor.mjs — copy the client-side libs we serve statically into public/vendor/.
   Run after `npm install` if you bump @xterm/* or qrcode-generator:  npm run vendor */
import { copyFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const NM = join(ROOT, "node_modules");
const OUT = join(ROOT, "public", "vendor");
mkdirSync(OUT, { recursive: true });

const files = [
  ["@xterm/xterm/lib/xterm.js", "xterm.js"],
  ["@xterm/xterm/css/xterm.css", "xterm.css"],
  ["@xterm/addon-fit/lib/addon-fit.js", "addon-fit.js"],
  ["@xterm/addon-search/lib/addon-search.js", "addon-search.js"],
  ["qrcode-generator/dist/qrcode.js", "qrcode.js"],
];
for (const [src, dst] of files) {
  copyFileSync(join(NM, src), join(OUT, dst));
  console.log("vendored", dst);
}
console.log("done — public/vendor/ refreshed.");
