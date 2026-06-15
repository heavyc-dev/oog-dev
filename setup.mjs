#!/usr/bin/env node
/* setup.mjs — oog.dev install wizard. Zero dependencies (built-ins only) so it runs before npm install.
   Run:  node setup.mjs   (or: npm run setup) */
import rl from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir, platform } from "node:os";
import { randomBytes, createECDH } from "node:crypto";

const ROOT = dirname(fileURLToPath(import.meta.url));
const isWin = platform() === "win32";
const io = rl.createInterface({ input: stdin, output: stdout });

const C = { d:"\x1b[2m", b:"\x1b[1m", g:"\x1b[32m", y:"\x1b[33m", r:"\x1b[31m", c:"\x1b[36m", x:"\x1b[0m" };
const log = (s = "") => console.log(s);
const ok = (s) => log(`${C.g}✓${C.x} ${s}`);
const warn = (s) => log(`${C.y}!${C.x} ${s}`);
const head = (s) => log(`\n${C.b}${C.c}${s}${C.x}`);
const ask = async (q, def) => { const a = (await io.question(`${q}${def ? ` ${C.d}[${def}]${C.x}` : ""}: `)).trim(); return a || def || ""; };
const yes = async (q, def = true) => { const a = (await io.question(`${q} ${C.d}(${def ? "Y/n" : "y/N"})${C.x} `)).trim().toLowerCase(); return a ? a[0] === "y" : def; };
async function choose(q, opts) { log(`\n${q}`); opts.forEach((o, i) => log(`  ${C.b}${i + 1}${C.x}) ${o}`)); const a = await ask("choose"); const n = parseInt(a, 10); return n >= 1 && n <= opts.length ? n - 1 : 0; }
function run(cmd, args, opts = {}) { return spawnSync(cmd, args, { encoding: "utf8", shell: isWin, ...opts }); }
const quote = (v) => (/\s/.test(v) ? `"${v}"` : v);
function tailscaleDnsName() {
  const r = run("tailscale", ["status", "--json"]);
  if (r.status !== 0) return "";
  try { return (JSON.parse(r.stdout || "{}").Self?.DNSName || "").replace(/\.$/, ""); } catch { return ""; }
}
function genVapid() {
  const ec = createECDH("prime256v1"); ec.generateKeys();
  const pub = ec.getPublicKey(); // 65-byte uncompressed point
  let priv = ec.getPrivateKey(); if (priv.length < 32) { const p = Buffer.alloc(32); priv.copy(p, 32 - priv.length); priv = p; }
  return { publicKey: pub.toString("base64url"), privateKey: priv.toString("base64url") };
}

async function main() {
  log(`\n${C.y}🦴  oog.dev — setup${C.x}\n${C.d}Host Claude Code on this PC, drive it from your phone.${C.x}`);

  // 1) Node
  const major = Number(process.versions.node.split(".")[0]);
  major >= 20 ? ok(`Node ${process.versions.node}`) : warn(`Node ${process.versions.node} — v20+ recommended.`);

  // 2) Claude Code
  head("Claude Code");
  let claudeBin = "claude";
  const ver = run("claude", ["--version"]);
  if (ver.status === 0) {
    const where = run(isWin ? "where" : "which", ["claude"]);
    const found = (where.stdout || "").split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const exe = found.find(f => /\.exe$/i.test(f)) || found[0];
    if (exe) claudeBin = exe;
    ok(`found: ${(ver.stdout || "").trim() || "claude"}  ${C.d}(${claudeBin})${C.x}`);
  } else {
    warn("`claude` not found on PATH.");
    const p = await ask("Full path to the claude executable (blank = keep 'claude' and resolve at runtime)");
    if (p) claudeBin = p;
  }

  // 3) Token
  head("Secret word (auth token)");
  let token;
  if (await yes("Generate a strong token for you?")) { token = randomBytes(24).toString("base64url"); ok(`generated: ${C.b}${token}${C.x}`); }
  else token = await ask("Paste a token") || randomBytes(24).toString("base64url");

  // 4) Code root
  head("Your code");
  const defRoot = existsSync(join(homedir(), ".code")) ? join(homedir(), ".code") : homedir();
  const codeRoot = await ask("Folder that holds your repos (becomes the cave picker)", defRoot);
  existsSync(codeRoot) ? ok(`caves from: ${codeRoot}`) : warn(`${codeRoot} doesn't exist yet — you can still type paths in the app.`);

  // 5) Access mode
  head("How will you reach it?");
  const mode = await choose("Pick an access mode:", [
    `Local on this PC at ${C.b}https://oog.dev${C.x} ${C.d}(recommended)${C.x}`,
    `Your phone over ${C.b}Tailscale${C.x}`,
    `Plain ${C.b}http://localhost${C.x} ${C.d}(quick test)${C.x}`,
  ]);

  const env = { AUTH_TOKEN: token, CODE_ROOT: codeRoot, CLAUDE_BIN: claudeBin, BIND_HOST: "127.0.0.1" };

  if (mode === 0) {
    head("oog.dev (local HTTPS)");
    log(`${C.d}.dev forces HTTPS in browsers, so oog.dev needs a locally-trusted cert. mkcert makes one.${C.x}`);
    const mk = run("mkcert", ["-version"]);
    const certDir = join(homedir(), ".oog-cert");
    if (mk.status === 0 && await yes(`Make a cert with mkcert now (in ${certDir})?`)) {
      mkdirSync(certDir, { recursive: true });
      run("mkcert", ["-install"], { stdio: "inherit" });
      run("mkcert", ["oog.dev", "*.oog.dev", "localhost", "127.0.0.1", "::1"], { cwd: certDir, stdio: "inherit" });
      const pems = readdirSync(certDir).filter(f => /^oog\.dev.*\.pem$/.test(f));
      const key = pems.find(f => /-key\.pem$/.test(f));
      const cert = pems.find(f => f !== key);
      if (cert && key) { env.TLS_CERT = join(certDir, cert); env.TLS_KEY = join(certDir, key); ok(`cert: ${cert}`); }
      else warn("couldn't find the generated pem files — set TLS_CERT/TLS_KEY by hand.");
    } else if (mk.status !== 0) {
      warn("mkcert not found. Install it, then re-run setup:");
      log(`    ${C.c}choco install mkcert${C.x}   (or  ${C.c}scoop install mkcert${C.x})`);
    }
    const port = await ask("Port (443 = clean URL but needs admin; 8443 otherwise)", "8443");
    env.PORT = port;
    // hosts entry
    const hosts = isWin ? join(process.env.SystemRoot || "C:\\Windows", "System32", "drivers", "etc", "hosts") : "/etc/hosts";
    try {
      const cur = existsSync(hosts) ? readFileSync(hosts, "utf8") : "";
      if (/\boog\.dev\b/.test(cur)) ok("hosts already maps oog.dev");
      else if (await yes("Add  127.0.0.1 oog.dev  to your hosts file?")) {
        writeFileSync(hosts, cur + `\n127.0.0.1   oog.dev\n`); ok("hosts updated");
      }
    } catch {
      warn(`Couldn't edit hosts (needs admin). Add this line yourself to:\n    ${hosts}\n    ${C.c}127.0.0.1   oog.dev${C.x}`);
    }
    const tail = port === "443" ? "" : ":" + port;
    env._URL = `https://oog.dev${tail}`;
    env._ORIGINS = [`https://oog.dev${tail}`];
  } else if (mode === 1) {
    head("Tailscale");
    env.PORT = "8765";
    const dns = tailscaleDnsName();
    const ip = run("tailscale", ["ip", "-4"]);
    if (ip.status === 0) {
      ok(`tailnet IP: ${(ip.stdout || "").trim().split(/\r?\n/)[0]}`);
      if (dns) ok(`tailnet name: ${dns}`);
      log(`${C.d}Cleanest path: keep the bridge on localhost and let Tailscale serve HTTPS.${C.x}`);
      log(`Run this once (gives a trusted https URL on your phone):`);
      log(`    ${C.c}tailscale serve --bg --https=443 http://127.0.0.1:8765${C.x}`);
      if (await yes("Run the tailscale serve command now?", false)) run("tailscale", ["serve", "--bg", "--https=443", "http://127.0.0.1:8765"], { stdio: "inherit" });
    } else {
      warn("tailscale not found — install Tailscale, then run the serve command from the README.");
    }
    const host = dns || (await ask("Your tailnet hostname (e.g. mypc.tailXXXX.ts.net; blank to fill later)")) || "<your-pc>.<tailnet>.ts.net";
    env._URL = `https://${host}`;
    env._ORIGINS = /[<>]/.test(host) ? [] : [`https://${host}`];
  } else {
    head("Local HTTP");
    env.PORT = "8765";
    env._URL = "http://localhost:8765";
    env._ORIGINS = ["http://localhost:8765", "http://127.0.0.1:8765"];
  }

  // 5a) access lock — restrict which web origins may open the socket (layer on top of the token)
  head("Lock connections (origins)");
  log(`${C.d}Only browsers loaded from these origins may open the socket — an extra layer on top of the token.${C.x}`);
  const suggested = (env._ORIGINS || []).join(",");
  if (suggested) log(`${C.d}Suggested for your access mode: ${C.x}${C.b}${suggested}${C.x}`);
  const originsAns = await ask("Allowed origins (comma-separated; blank = any origin that has the token)", suggested);
  if (originsAns.trim()) env.ALLOWED_ORIGINS = originsAns.trim();
  else warn("no origin lock — relying on the token alone (fine, but ALLOWED_ORIGINS is recommended).");

  // 5b) behaviour options
  head("Options");
  if (await yes("Use phone approvals (clean Allow/Deny on the phone for each tool)?", true) === false) env.CC_BRIDGE_HOOK = "0";
  if (await yes("Auto-resume your caves when the bridge starts?", false)) env.RELIGHT_ON_START = "1";

  // 5c) push notification keys
  head("Notifications");
  const vapid = genVapid();
  env.VAPID_PUBLIC = vapid.publicKey; env.VAPID_PRIVATE = vapid.privateKey; env.VAPID_SUBJECT = "mailto:oog@local";
  ok("push keys generated");
  log(`${C.d}(notifications need HTTPS — they work in the oog.dev and Tailscale modes, not plain http)${C.x}`);

  // 6) install deps
  head("Dependencies");
  if (existsSync(join(ROOT, "node_modules")) && !(await yes("node_modules exists — reinstall?", false))) ok("skipping install");
  else {
    log(`${C.d}installing (node-pty builds a native module; if it fails on Windows, see README for the prebuilt fork)…${C.x}`);
    const r = run("npm", ["install"], { cwd: ROOT, stdio: "inherit" });
    r.status === 0 ? ok("dependencies installed") : warn("npm install reported a problem — check the output above.");
  }

  // 7) write .env
  const url = env._URL; delete env._URL; delete env._ORIGINS;
  const lines = ["# generated by setup.mjs", ...Object.entries(env).map(([k, v]) => `${k}=${quote(v)}`)];
  writeFileSync(join(ROOT, ".env"), lines.join("\n") + "\n");
  ok(".env written");

  // 8) startup task
  head("Always-on (optional)");
  if (isWin && await yes("Create a Windows startup task so the bridge runs at log on?", false)) {
    const psCmd = `powershell -ExecutionPolicy Bypass -File "${join(ROOT, "scripts", "start-bridge.ps1")}"`;
    const reg = run("schtasks", ["/Create", "/TN", "oog.dev-bridge", "/TR", psCmd, "/SC", "ONLOGON", "/F"], { stdio: "inherit" });
    reg.status === 0 ? ok("startup task 'oog.dev-bridge' created") : warn("couldn't register the task (try an elevated terminal); you can run scripts\\start-bridge.ps1 manually.");
  }

  // done
  head("🔥 Fire ready. OOGA.");
  log(`Start it:        ${C.c}npm start${C.x}`);
  log(`Open on PC:      ${C.b}${url}${C.x}`);
  log(`Paste the token: ${C.b}${token}${C.x}`);
  log(`${C.d}(token also saved in .env — keep that file private)${C.x}\n`);
  io.close();
}
main().catch(e => { console.error(e); io.close(); process.exit(1); });
