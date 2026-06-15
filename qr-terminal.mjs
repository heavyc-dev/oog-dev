/* qr-terminal.mjs — render a scannable QR in the terminal (black/white via ANSI bg colors,
   2 cells per module so it stays square and works on any terminal theme). Used by setup.mjs
   and server.ts to show a "scan to connect" code (URL + token) so no token typing is needed. */
export async function printQR(text) {
  let qrcode;
  try { qrcode = (await import("qrcode-generator")).default; } catch { return false; }
  const qr = qrcode(0, "L");
  qr.addData(String(text));
  qr.make();
  const n = qr.getModuleCount(), pad = 2;
  const W = "\x1b[47m  \x1b[0m"; // light module (white bg, 2 spaces)
  const B = "\x1b[40m  \x1b[0m"; // dark module (black bg)
  const full = (s) => s.repeat(n + pad * 2);
  const rows = [];
  for (let i = 0; i < pad; i++) rows.push(full(W));
  for (let r = 0; r < n; r++) {
    let line = W.repeat(pad);
    for (let c = 0; c < n; c++) line += qr.isDark(r, c) ? B : W;
    rows.push(line + W.repeat(pad));
  }
  for (let i = 0; i < pad; i++) rows.push(full(W));
  console.log("\n" + rows.join("\n") + "\n");
  return true;
}
