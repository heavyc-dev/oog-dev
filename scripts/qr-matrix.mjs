#!/usr/bin/env node
/* qr-matrix.mjs — print a QR as a 0/1 matrix for the tray's "Show pairing QR" window.
   First line = module count N; then N lines of N chars ('1'=dark). Usage: node qr-matrix.mjs "<text>" */
import { argv, stdout } from "node:process";
const text = argv[2] || "";
const qrcode = (await import("qrcode-generator")).default;
const qr = qrcode(0, "M");
qr.addData(text);
qr.make();
const n = qr.getModuleCount();
let out = n + "\n";
for (let r = 0; r < n; r++) {
  let s = "";
  for (let c = 0; c < n; c++) s += qr.isDark(r, c) ? "1" : "0";
  out += s + "\n";
}
stdout.write(out);
