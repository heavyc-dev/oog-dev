/**
 * oog.dev — cc-bridge
 * Host interactive Claude Code on your PC (subscription billing), drive it from your phone.
 * See README. Configure via .env (run `npm run setup`) or environment variables.
 */
import { createServer as createHttp } from "node:http";
import { createServer as createHttps } from "node:https";
import { readFile, stat, open, readdir } from "node:fs/promises";
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, readdirSync, statSync } from "node:fs";
import { join, extname, normalize, dirname, isAbsolute } from "node:path";
import { homedir } from "node:os";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import webpush from "web-push";
import * as pty from "node-pty";
import { mapTranscriptLine, stripAnsi, encodeCwd, isUserPrompt } from "./transcript.mjs";
import { within } from "./pathsafe.mjs";
import { printQR } from "./qr-terminal.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));

// ── .env loader (no dependency) ──────────────────────────────────────────────
(function loadEnv() {
  const f = join(ROOT, ".env");
  if (!existsSync(f)) return;
  for (const raw of readFileSync(f, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[k] === undefined) process.env[k] = v;
  }
})();

const AUTH_TOKEN = process.env.AUTH_TOKEN;
if (!AUTH_TOKEN) { console.error("Refusing to start: AUTH_TOKEN not set. Run `npm run setup`."); process.exit(1); }
const TLS_CERT = process.env.TLS_CERT, TLS_KEY = process.env.TLS_KEY;
const useTLS = !!(TLS_CERT && TLS_KEY);
const PORT = Number(process.env.PORT ?? (useTLS ? 8443 : 8765));
const BIND_HOST = process.env.BIND_HOST ?? "127.0.0.1";

// ── exposure guard ────────────────────────────────────────────────────────────
// The bridge drives Claude with full tool access; the auth token is the ONLY gate, so the
// process must never listen anywhere but loopback unless the operator explicitly opts in AND
// hardens it. Remote access is meant to come from Tailscale `serve` proxying to 127.0.0.1
// (NOT `tailscale funnel`, which is public). This makes public-internet exposure impossible by
// accident or misconfigured .env.
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost", "0:0:0:0:0:0:0:1"]);
const isLoopbackBind = LOOPBACK_HOSTS.has(String(BIND_HOST).toLowerCase());
const ALLOW_LAN = process.env.OOG_ALLOW_LAN === "1";
const tokenStrong = String(AUTH_TOKEN).length >= 24;
if (!isLoopbackBind && !ALLOW_LAN) {
  console.error(
    `Refusing to start: BIND_HOST=${BIND_HOST} is not loopback — the bridge would be reachable beyond this machine.\n` +
    `  Keep BIND_HOST=127.0.0.1 and reach it remotely via Tailscale:\n` +
    `    tailscale serve --bg --https=443 http://127.0.0.1:${PORT}      (NOT  tailscale funnel — that is public)\n` +
    `  To bind a LAN/other interface anyway, set OOG_ALLOW_LAN=1 (then a strong AUTH_TOKEN + TLS are required).`,
  );
  process.exit(1);
}
if (!isLoopbackBind && ALLOW_LAN) {
  if (!tokenStrong) { console.error("Refusing to start: a non-loopback bind requires a strong AUTH_TOKEN (≥24 chars). Run `npm run setup` to generate one."); process.exit(1); }
  if (!useTLS) { console.error("Refusing to start: a non-loopback bind requires TLS (set TLS_CERT/TLS_KEY). Plaintext over a network is unsafe."); process.exit(1); }
  console.warn(`⚠ SECURITY: binding non-loopback (${BIND_HOST}:${PORT}). Reachable on your network — ensure a firewall / Tailscale ACLs restrict who can connect.`);
}
if (isLoopbackBind && !tokenStrong) {
  console.warn("⚠ AUTH_TOKEN is weak (<24 chars). Fine for local testing; generate a strong one (`npm run setup`) before any remote/Tailscale use.");
}

const CODE_ROOT = process.env.CODE_ROOT ?? "";
const CLAUDE_BIN = process.env.CLAUDE_BIN ?? "claude";
const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");
const PROJECTS_DIR = join(CLAUDE_DIR, "projects");
const PUBLIC_DIR = join(ROOT, "public");
const OOG_DIR = join(ROOT, ".oog");
const CAVES_FILE = join(OOG_DIR, "caves.json");
const HOOK_ENABLED = process.env.CC_BRIDGE_HOOK !== "0";
const HOOK_PATH = join(ROOT, "hooks", "permission-hook.mjs");
const HOOK_SETTINGS = join(OOG_DIR, "hook-settings.json");
const RELIGHT_ON_START = process.env.RELIGHT_ON_START === "1";
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
const VAPID_PUBLIC = process.env.VAPID_PUBLIC, VAPID_PRIVATE = process.env.VAPID_PRIVATE;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:oog@local";
const PUSH_ON = !!(VAPID_PUBLIC && VAPID_PRIVATE);
const PUSH_FILE = join(OOG_DIR, "push.json");
const UPLOAD_KEEP = Number(process.env.UPLOAD_KEEP ?? 20);
const RL_MAX = 60; // max upload/read ops per ws per minute
const POLL_MS = 300, PERM_TIMEOUT = 9 * 60 * 1000, PRUNE_MS = 45_000;
const BRACKETED = process.env.CC_BRIDGE_PASTE !== "0"; // wrap prompts in bracketed paste so multi-line input doesn't submit early
const isWin = process.platform === "win32";

try { mkdirSync(OOG_DIR, { recursive: true }); } catch {}
if (HOOK_ENABLED) {
  // write the PreToolUse hook settings (passed to claude via --settings)
  const cmd = `node "${HOOK_PATH}"`;
  writeFileSync(HOOK_SETTINGS, JSON.stringify({
    hooks: { PreToolUse: [{ matcher: "*", hooks: [{ type: "command", command: cmd, timeout: 600 }] }] },
  }, null, 2));
}

// constant-time auth check — the token is the ONLY gate, so never leak its length/contents via
// the early-out of a plain `===` string compare.
const tokenOk = (t: unknown): boolean => {
  if (typeof t !== "string") return false;
  const a = Buffer.from(t), b = Buffer.from(AUTH_TOKEN!);
  return a.length === b.length && timingSafeEqual(a, b);
};

interface Session {
  id: string; cwd: string; proc: pty.IPty; spawnedAt: number; resumeId?: string;
  transcriptPath?: string; ccSessionId?: string; offset: number; lineBuf: string; priming: boolean;
  events: any[]; ptyTail: string[]; title: string; titled: boolean; status: "running" | "exited"; iv?: NodeJS.Timeout;
  busy?: boolean; busyTimer?: NodeJS.Timeout; busyStart?: number;
}
const sessions = new Map<string, Session>();
const claimed = new Set<string>();
const pendingPerms = new Map<string, { res: any; timer: NodeJS.Timeout }>();

const clients = new Set<WebSocket>();
const sendTo = (ws: WebSocket, o: any) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(o));
const broadcast = (o: any) => { for (const ws of clients) sendTo(ws, o); };

// ── web push ─────────────────────────────────────────────────────────────────
if (PUSH_ON) try { webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC!, VAPID_PRIVATE!); } catch (e) { console.error("VAPID setup failed:", e); }
let subs: any[] = (() => { try { return JSON.parse(readFileSync(PUSH_FILE, "utf8")); } catch { return []; } })();
const saveSubs = () => { try { writeFileSync(PUSH_FILE, JSON.stringify(subs)); } catch {} };
async function pushAll(payload: any) {
  if (!PUSH_ON || !subs.length) return;
  const data = JSON.stringify(payload); let dirty = false;
  await Promise.all(subs.map(async (sub) => {
    try { await webpush.sendNotification(sub, data); }
    catch (e: any) { if (e?.statusCode === 404 || e?.statusCode === 410) { sub._dead = true; dirty = true; } }
  }));
  if (dirty) { subs = subs.filter((s) => !s._dead); saveSubs(); }
}
const sessionError = (sid: string, msg: string) => { broadcast({ type: "error", sessionId: sid, message: msg }); pushAll({ title: "oog.dev", body: "⚠ " + msg, tag: "err-" + sid }); };

// server-authoritative busy/idle (drives the working indicator, queue flush, and "done" push)
function setBusy(s: Session, b: boolean) {
  if (s.busy === b) return;
  s.busy = b; broadcast({ type: "state", sessionId: s.id, busy: b });
  if (b) s.busyStart = Date.now();
  else if (Date.now() - (s.busyStart || 0) > 4000) pushAll({ title: "oog.dev", body: `Claude finished — ${s.title}`, tag: "done-" + s.id });
}
function pokeBusy(s: Session) {
  setBusy(s, true);
  if (s.busyTimer) clearTimeout(s.busyTimer);
  const tail = s.ptyTail.join("\n").slice(-220);
  const stillWorking = /esc to interrupt|esc to cancel|to interrupt/i.test(tail);
  s.busyTimer = setTimeout(() => setBusy(s, false), stillWorking ? 6000 : 1200);
}

// ── caves persistence (embers) ───────────────────────────────────────────────
const loadCaves = (): any[] => { try { return JSON.parse(readFileSync(CAVES_FILE, "utf8")); } catch { return []; } };
function saveCave(cwd: string, ccSessionId: string | undefined, title: string) {
  const list = loadCaves().filter((c) => c.cwd !== cwd);
  list.unshift({ cwd, ccSessionId, title, ts: Date.now() });
  try { writeFileSync(CAVES_FILE, JSON.stringify(list.slice(0, 30), null, 2)); } catch {}
}
function embers() {
  const have = new Set([...sessions.values()].map((s) => s.cwd));
  return loadCaves().filter((c) => !have.has(c.cwd)).slice(0, 12)
    .map((c) => ({ cwd: c.cwd, title: c.title, ccSessionId: c.ccSessionId }));
}
const sessionsMsg = () => ({
  type: "sessions",
  sessions: [...sessions.values()].map((s) => ({ id: s.id, cwd: s.cwd, title: s.title, status: s.status })),
  embers: embers(),
});

// ── transcript locate + tail ─────────────────────────────────────────────────
async function locateTranscript(s: Session): Promise<string | undefined> {
  const enc = join(PROJECTS_DIR, encodeCwd(s.cwd));
  const dirs: string[] = [];
  if (existsSync(enc)) dirs.push(enc);
  else if (existsSync(PROJECTS_DIR)) for (const d of await readdir(PROJECTS_DIR)) dirs.push(join(PROJECTS_DIR, d));
  let best: { path: string; mtime: number } | undefined;
  for (const d of dirs) {
    let files: string[] = [];
    try { files = (await readdir(d)).filter((f) => f.endsWith(".jsonl")); } catch { continue; }
    for (const f of files) {
      const p = join(d, f);
      if (claimed.has(p)) continue;            // don't steal another session's file
      try {
        const st = await stat(p);
        if (st.mtimeMs >= s.spawnedAt - 5000 && (!best || st.mtimeMs > best.mtime)) best = { path: p, mtime: st.mtimeMs };
      } catch {}
    }
  }
  // resume that appended in place may not look "new"; fall back to the known session file
  if (!best && s.resumeId) {
    const p = join(enc, s.resumeId + ".jsonl");
    if (existsSync(p) && !claimed.has(p)) return p;
  }
  return best?.path;
}

function store(s: Session, ev: any, live: boolean) {
  ev.sessionId = s.id; s.events.push(ev); if (s.events.length > 2000) s.events.shift();
  if (live && !s.priming) broadcast(ev);
}
function setTitle(s: Session, text: string) {
  if (s.titled || !text?.trim()) return;
  s.title = text.trim().replace(/\s+/g, " ").slice(0, 48); s.titled = true;
  saveCave(s.cwd, s.ccSessionId, s.title); broadcast(sessionsMsg());
}
function emitEvents(s: Session, line: string) {
  for (const ev of mapTranscriptLine(line)) {
    if (isUserPrompt(ev)) { setTitle(s, ev.text); store(s, ev, false); } // echoed live on send → store only
    else store(s, ev, true);
  }
}
async function readFileEvents(s: Session, path: string) {
  let txt = ""; try { txt = await readFile(path, "utf8"); } catch { return; }
  for (const line of txt.split(/\r?\n/)) { const t = line.trim(); if (t) emitEvents(s, t); }
}
async function readNew(s: Session) {
  if (!s.transcriptPath) return;
  const st = await stat(s.transcriptPath);
  if (st.size < s.offset) { s.offset = 0; s.lineBuf = ""; } // file rotated/truncated → resync
  if (st.size <= s.offset) return;
  const fh = await open(s.transcriptPath, "r");
  try {
    const buf = Buffer.alloc(st.size - s.offset);
    await fh.read(buf, 0, buf.length, s.offset);
    s.offset = st.size; s.lineBuf += buf.toString("utf8");
    let nl: number;
    while ((nl = s.lineBuf.indexOf("\n")) >= 0) {
      const line = s.lineBuf.slice(0, nl).trim(); s.lineBuf = s.lineBuf.slice(nl + 1);
      if (line) emitEvents(s, line);
    }
  } finally { await fh.close(); }
}
async function startTail(s: Session) {
  for (let i = 0; i < 40 && !s.transcriptPath && s.status === "running"; i++) {
    s.transcriptPath = await locateTranscript(s);
    if (!s.transcriptPath) await new Promise((r) => setTimeout(r, 300));
  }
  if (!s.transcriptPath) { sessionError(s.id, "transcript not found (is this a Claude Code project?)"); return; }
  claimed.add(s.transcriptPath);
  s.ccSessionId = s.transcriptPath.replace(/\.jsonl$/, "").split(/[\\/]/).pop();
  // resume: if the live session forked to a new id, seed prior history from the original file
  if (s.resumeId && s.resumeId !== s.ccSessionId) {
    const hist = join(PROJECTS_DIR, encodeCwd(s.cwd), s.resumeId + ".jsonl");
    if (existsSync(hist)) await readFileEvents(s, hist).catch(() => {});
  }
  await readNew(s).catch(() => {});   // prime current file (store-only)
  s.priming = false;
  saveCave(s.cwd, s.ccSessionId, s.title);
  s.iv = setInterval(() => { if (s.status === "running") readNew(s).catch(() => {}); }, POLL_MS);
}

// ── spawning ─────────────────────────────────────────────────────────────────
function spawnClaude(cwd: string, env: any, resumeId?: string): pty.IPty {
  const flags: string[] = [];
  if (HOOK_ENABLED) flags.push("--settings", HOOK_SETTINGS);
  if (resumeId) flags.push("--resume", resumeId);
  const opts = { name: "xterm-256color", cols: 120, rows: 40, cwd, env };
  if (isWin && !/\.exe$/i.test(CLAUDE_BIN)) {
    const q = (x: string) => (/\s/.test(x) ? `"${x}"` : x);
    return pty.spawn("cmd.exe", ["/c", CLAUDE_BIN, ...flags.map(q)], opts as any);
  }
  return pty.spawn(CLAUDE_BIN, flags, opts as any);
}
function newSession(cwd: string, resumeId?: string): Session {
  const id = randomUUID();
  const env = { ...process.env, CC_BRIDGE_SESSION: id, CC_BRIDGE_PORT: String(PORT) };
  const proc = spawnClaude(cwd, env, resumeId);
  const s: Session = {
    id, cwd, proc, spawnedAt: Date.now(), resumeId, offset: 0, lineBuf: "", priming: true,
    events: [], ptyTail: [], title: cwd.split(/[\\/]/).pop() || cwd, titled: false, status: "running",
  };
  sessions.set(id, s);
  proc.onData((d) => {
    // raw ANSI is forwarded so the client terminal (xterm.js) renders colours/cursor faithfully.
    // keep a rolling raw buffer (~64KB) for replay on (re)attach.
    s.ptyTail.push(d);
    let total = s.ptyTail.reduce((n, c) => n + c.length, 0);
    while (total > 64000 && s.ptyTail.length > 1) total -= s.ptyTail.shift()!.length;
    broadcast({ type: "pty", sessionId: id, data: d });
    pokeBusy(s);
  });
  proc.onExit(() => {
    s.status = "exited"; if (s.iv) clearInterval(s.iv); if (s.busyTimer) clearTimeout(s.busyTimer);
    if (s.busy) { s.busy = false; broadcast({ type: "state", sessionId: id, busy: false }); }
    if (s.transcriptPath) claimed.delete(s.transcriptPath);
    broadcast({ type: "session_closed", sessionId: id }); broadcast(sessionsMsg());
    setTimeout(() => { if (sessions.get(id)?.status === "exited") { sessions.delete(id); broadcast(sessionsMsg()); } }, PRUNE_MS);
  });
  broadcast({ type: "session_started", sessionId: id, cwd, title: s.title }); broadcast(sessionsMsg());
  startTail(s);
  return s;
}

async function listProjects(): Promise<string[]> {
  const out: string[] = [];
  if (CODE_ROOT && existsSync(CODE_ROOT)) {
    try { for (const e of await readdir(CODE_ROOT, { withFileTypes: true })) if (e.isDirectory() && !e.name.startsWith(".")) out.push(join(CODE_ROOT, e.name)); } catch {}
  }
  return out;
}

// ── slash command discovery (built-ins + user/project + plugin commands & skills) ─────────────
const BUILTIN_COMMANDS: [string, string][] = [
  ["/clear", "clear the conversation history"], ["/compact", "summarise + compact the conversation"],
  ["/help", "show help"], ["/model", "switch the model"], ["/init", "create a CLAUDE.md"],
  ["/review", "review a pull request"], ["/resume", "resume a past session"], ["/cost", "show token cost"],
  ["/config", "open settings"], ["/memory", "edit memory files"], ["/agents", "manage subagents"],
  ["/mcp", "manage MCP servers"], ["/doctor", "diagnose the install"], ["/status", "show status"],
  ["/permissions", "manage permissions"], ["/hooks", "manage hooks"], ["/export", "export the conversation"],
  ["/login", "log in"], ["/logout", "log out"], ["/vim", "toggle vim mode"],
];
function descFromMd(txt: string): string {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(txt);
  const body = fm ? fm[1] : "";
  const m = /^description:[ \t]*(.*)$/m.exec(body);
  if (m) {
    let val = m[1].trim();
    if (/^[>|][-+]?$/.test(val)) { // YAML folded/literal block scalar → gather indented lines
      const lines: string[] = [];
      for (const ln of body.slice(m.index + m[0].length).split(/\r?\n/)) {
        if (/^[ \t]+\S/.test(ln)) lines.push(ln.trim());
        else if (ln.trim() === "") continue;
        else break;
      }
      val = lines.join(" ");
    }
    return val.replace(/^["']|["']$/g, "").replace(/\s+/g, " ").slice(0, 120);
  }
  const h = /^#[ \t]+(.+)$/m.exec(txt); return h ? h[1].trim().slice(0, 120) : "";
}
function descFromToml(txt: string): string {
  const m = /^[ \t]*description[ \t]*=[ \t]*(.+)$/m.exec(txt);
  return m ? m[1].trim().replace(/^["']|["']$/g, "").replace(/\s+/g, " ").slice(0, 120) : "";
}
async function readCmdsDir(dir: string, ns: string, source: string, out: any[]) {
  let files: string[] = [];
  try { files = await readdir(dir); } catch { return; }
  for (const f of files) {
    const ext = extname(f).toLowerCase();
    if (ext !== ".md" && ext !== ".toml") continue;
    const name = f.slice(0, -ext.length);
    let desc = "";
    try { const txt = await readFile(join(dir, f), "utf8"); desc = ext === ".toml" ? descFromToml(txt) : descFromMd(txt); } catch {}
    out.push({ cmd: ns ? `/${ns}:${name}` : `/${name}`, source, description: desc });
  }
}
async function readSkillsDir(dir: string, ns: string, source: string, out: any[]) {
  let names: string[] = [];
  try { names = await readdir(dir); } catch { return; }
  for (const name of names) {
    // don't gate on dirent type — plugin skills are often symlinks; just probe for SKILL.md
    let desc = "";
    try { desc = descFromMd(await readFile(join(dir, name, "SKILL.md"), "utf8")); } catch { continue; }
    out.push({ cmd: ns ? `/${ns}:${name}` : `/${name}`, source, description: desc });
  }
}
async function listCommands(cwd?: string): Promise<any[]> {
  const out: any[] = BUILTIN_COMMANDS.map(([cmd, description]) => ({ cmd, source: "builtin", description }));
  await readCmdsDir(join(CLAUDE_DIR, "commands"), "", "user", out);
  await readSkillsDir(join(CLAUDE_DIR, "skills"), "", "user", out);
  if (cwd) {
    await readCmdsDir(join(cwd, ".claude", "commands"), "", "project", out);
    await readSkillsDir(join(cwd, ".claude", "skills"), "", "project", out);
  }
  try {
    const reg = JSON.parse(await readFile(join(CLAUDE_DIR, "plugins", "installed_plugins.json"), "utf8"));
    for (const key of Object.keys(reg.plugins || {})) {
      const installs = reg.plugins[key];
      const inst = Array.isArray(installs) ? installs[installs.length - 1] : null;
      if (!inst?.installPath) continue;
      const plugin = key.split("@")[0];
      await readCmdsDir(join(inst.installPath, "commands"), plugin, "plugin:" + plugin, out);
      await readSkillsDir(join(inst.installPath, "skills"), plugin, "plugin:" + plugin, out);
    }
  } catch {}
  const seen = new Set<string>(), dedup: any[] = [];
  for (const c of out) { if (seen.has(c.cmd)) continue; seen.add(c.cmd); dedup.push(c); }
  return dedup.sort((a, b) => a.cmd.localeCompare(b.cmd));
}

// ── filesystem dir browser (for picking a cave) — lists directory names only ──
function listDrives(): string[] {
  const out: string[] = [];
  for (let i = 67; i <= 90; i++) { const d = String.fromCharCode(i) + ":\\"; if (existsSync(d)) out.push(d); } // C..Z
  return out;
}
function parentOf(p: string): string | null {
  const d = dirname(p);
  if (d === p) return isWin ? "" : null; // at a drive/fs root → "" = drive list (win), null = top (posix)
  return d;
}
async function browseDir(p?: string): Promise<any> {
  if (isWin && !p) return { path: "", up: null, drives: listDrives(), dirs: [] };
  const cur = normalize(p || (isWin ? "C:\\" : "/"));
  try {
    const dirs: string[] = [];
    for (const e of await readdir(cur, { withFileTypes: true })) if (e.isDirectory()) dirs.push(e.name);
    dirs.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    return { path: cur, up: parentOf(cur), dirs };
  } catch { return { path: cur, up: parentOf(cur), dirs: [], error: "cannot read this folder" }; }
}

function rateLimited(ws: any): boolean {
  const now = Date.now(); const r = ws._rl || (ws._rl = { n: 0, t: now });
  if (now - r.t > 60_000) { r.n = 0; r.t = now; }
  return ++r.n > RL_MAX;
}
function pruneUploads(dir: string) {
  try {
    const files = readdirSync(dir).filter((f) => f !== ".gitignore").map((f) => ({ f, m: statSync(join(dir, f)).mtimeMs })).sort((a, b) => b.m - a.m);
    for (const x of files.slice(UPLOAD_KEEP)) try { unlinkSync(join(dir, x.f)); } catch {}
  } catch {}
}

// ── http(s): static + hook permission endpoint ───────────────────────────────
const MIME: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
};
const handler = (req: any, res: any) => {
  const path = (req.url ?? "/").split("?")[0];
  if (process.env.OOG_ACCESS_LOG === "1") {
    const ua = String(req.headers["user-agent"] || "");
    const dev = /iPhone|iPad|Android/i.test(ua) ? "📱PHONE" : /Edge|Chrome|Firefox|Safari/i.test(ua) ? "💻PC" : "?";
    console.log(`[req] ${req.method} ${path}  ${dev}  ua="${ua.slice(0, 50)}"`);
  }
  if (req.method === "POST" && path === "/hook/permission") {
    let body = ""; req.on("data", (c: any) => (body += c));
    req.on("end", () => {
      let m: any; try { m = JSON.parse(body); } catch { res.writeHead(400).end(); return; }
      // files the user just uploaded are pre-approved for Read (they already chose to send them)
      if (m.tool === "Read" && typeof m.input?.file_path === "string" && m.input.file_path.includes(".oog-uploads")) {
        res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ decision: "allow" })); return;
      }
      const id = randomUUID();
      const timer = setTimeout(() => {
        if (pendingPerms.delete(id)) { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ decision: "ask" })); }
      }, PERM_TIMEOUT);
      pendingPerms.set(id, { res, timer });
      broadcast({ type: "permission_request", id, sessionId: m.sessionId, tool: m.tool, input: m.input });
      pushAll({ title: "oog.dev", body: "Approve? " + (m.tool || "tool"), tag: "perm-" + id });
    });
    return;
  }
  let p = decodeURIComponent(path); if (p === "/") p = "/index.html";
  const filePath = normalize(join(PUBLIC_DIR, p));
  if (!within(PUBLIC_DIR, filePath)) { res.writeHead(403).end(); return; }
  readFile(filePath)
    .then((b) => { res.writeHead(200, { "content-type": MIME[extname(filePath)] ?? "application/octet-stream" }); res.end(b); })
    .catch(() => { res.writeHead(404, { "content-type": "text/plain" }); res.end("Not found"); });
};

const httpServer = useTLS
  ? createHttps({ cert: readFileSync(TLS_CERT!), key: readFileSync(TLS_KEY!) }, handler)
  : createHttp(handler);

const wss = new WebSocketServer({ server: httpServer });
wss.on("connection", (ws, req) => {
  const origin = req.headers.origin;
  if (origin) {
    if (ALLOWED_ORIGINS.length) {
      if (!ALLOWED_ORIGINS.includes(origin)) { ws.close(1008, "origin"); return; }
    } else {
      // No explicit allowlist → default to same-origin only. A browser sets Origin to the page
      // that opened the socket; the real PWA is served by this bridge, so its Origin host matches
      // the Host header. A cross-site page (CSWSH) won't — reject it. Non-browser clients (wscat)
      // send no Origin and fall through to the token gate.
      try {
        if (req.headers.host && new URL(origin).host !== req.headers.host) { ws.close(1008, "origin"); return; }
      } catch { ws.close(1008, "origin"); return; }
    }
  }
  const url = new URL(req.url ?? "/", "http://localhost");
  let authed = tokenOk(url.searchParams.get("token")); // URL-token compat (wscat)
  if (authed) { clients.add(ws); sendTo(ws, { type: "authed", vapidPublicKey: VAPID_PUBLIC || "" }); sendTo(ws, sessionsMsg()); }

  ws.on("message", async (data) => {
    let m: any; try { m = JSON.parse(data.toString()); } catch { return; }
    if (!authed) {
      if (m.type === "auth" && tokenOk(m.token)) { authed = true; clients.add(ws); sendTo(ws, { type: "authed", vapidPublicKey: VAPID_PUBLIC || "" }); sendTo(ws, sessionsMsg()); }
      else ws.close(1008, "unauthorized");
      return;
    }
    const s = m.sessionId ? sessions.get(m.sessionId) : undefined;
    switch (m.type) {
      case "list_projects": sendTo(ws, { type: "projects", dirs: await listProjects() }); break;
      case "list_commands": sendTo(ws, { type: "commands", items: await listCommands(s?.cwd) }); break;
      case "browse": if (rateLimited(ws)) { sendTo(ws, { type: "error", message: "slow down (rate limit)" }); break; } sendTo(ws, { type: "dir", ...(await browseDir(m.path)) }); break;
      case "list_sessions": sendTo(ws, sessionsMsg()); break;
      case "new_session":
        if (!m.cwd || !existsSync(m.cwd)) { sendTo(ws, { type: "error", message: "cave (folder) not found: " + m.cwd }); break; }
        sendTo(ws, { type: "attached", sessionId: newSession(m.cwd, m.resume).id }); break;
      case "attach":
        if (s) sendTo(ws, { type: "history", sessionId: s.id, title: s.title, cwd: s.cwd, status: s.status, events: s.events.slice(-300), pty: s.ptyTail.join("") }); break;
      case "prompt":
        if (s && s.status === "running") {
          broadcast({ type: "user_echo", sessionId: s.id, text: m.text });
          const text = String(m.text ?? "");
          s.proc.write(BRACKETED ? `\x1b[200~${text}\x1b[201~\r` : text + "\r");
        } break;
      case "key": if (s && s.status === "running") s.proc.write(KEYS[m.key] ?? m.key); break;
      case "resize": if (s && s.status === "running" && m.cols > 0 && m.rows > 0) { try { s.proc.resize(Math.min(300, m.cols | 0), Math.min(200, m.rows | 0)); } catch {} } break;
      case "interrupt": if (s && s.status === "running") s.proc.write("\x03"); break;
      case "close_session": if (s) try { s.proc.kill(); } catch {} break;
      case "upload_image": {
        if (!s || s.status !== "running") break;
        if (rateLimited(ws)) { sendTo(ws, { type: "error", message: "slow down (rate limit)" }); break; }
        if (String(m.dataB64 || "").length > 9_000_000) { sendTo(ws, { type: "error", message: "image too large" }); break; }
        try {
          const dir = join(s.cwd, ".oog-uploads"); mkdirSync(dir, { recursive: true });
          try { writeFileSync(join(dir, ".gitignore"), "*\n"); } catch {}
          const safe = (String(m.name || "photo.jpg").replace(/[^\w.-]/g, "_") || "photo.jpg").slice(-40);
          const fpath = join(dir, Date.now() + "-" + safe);
          const b64 = String(m.dataB64 || "").replace(/^data:[^,]+,/, "");
          writeFileSync(fpath, Buffer.from(b64, "base64"));
          pruneUploads(dir);
          const caption = String(m.caption || "").trim();
          broadcast({ type: "user_echo", sessionId: s.id, text: (caption ? caption + "\n" : "") + "📷 " + safe });
          const prompt = (caption ? caption + " " : "") + `I just added an image at ${fpath} — please take a look at it.`;
          s.proc.write(BRACKETED ? `\x1b[200~${prompt}\x1b[201~\r` : prompt + "\r");
        } catch { sendTo(ws, { type: "error", message: "image upload failed" }); }
        break;
      }
      case "read_file": {
        if (!s) break;
        if (rateLimited(ws)) { sendTo(ws, { type: "error", message: "slow down (rate limit)" }); break; }
        try {
          let fp = String(m.path || ""); if (!isAbsolute(fp)) fp = join(s.cwd, fp);
          const resolved = normalize(fp);
          if (!within(s.cwd, resolved)) { sendTo(ws, { type: "error", message: "file is outside the cave" }); break; }
          const st = await stat(resolved);
          if (st.size > 400_000) {
            const fh = await open(resolved, "r"); const buf = Buffer.alloc(200_000);
            await fh.read(buf, 0, 200_000, 0); await fh.close();
            sendTo(ws, { type: "file", path: m.path, content: buf.toString("utf8") + "\n\n…(truncated — large file)", truncated: true });
          } else sendTo(ws, { type: "file", path: m.path, content: await readFile(resolved, "utf8") });
        } catch { sendTo(ws, { type: "error", message: "could not read " + m.path }); }
        break;
      }
      case "permission": {
        const pp = pendingPerms.get(m.id);
        if (pp) { pendingPerms.delete(m.id); clearTimeout(pp.timer); pp.res.writeHead(200, { "content-type": "application/json" }); pp.res.end(JSON.stringify({ decision: m.decision === "allow" ? "allow" : "deny" })); }
        break;
      }
      case "push_subscribe":
        if (m.subscription?.endpoint && !subs.find((x) => x.endpoint === m.subscription.endpoint)) { subs.push(m.subscription); saveSubs(); }
        sendTo(ws, { type: "push_ok" }); break;
    }
  });
  ws.on("close", () => {
    clients.delete(ws);
    // last phone gone → no one can answer a pending approval. Resolve them as "ask" so the hook
    // returns immediately and Claude falls back to its own prompt instead of blocking ~9 min.
    if (clients.size === 0 && pendingPerms.size) {
      for (const [, pp] of pendingPerms) {
        clearTimeout(pp.timer);
        try { pp.res.writeHead(200, { "content-type": "application/json" }); pp.res.end(JSON.stringify({ decision: "ask" })); } catch {}
      }
      pendingPerms.clear();
    }
  });
});

const KEYS: Record<string, string> = {
  enter: "\r", tab: "\t", "shift-tab": "\x1b[Z", esc: "\x1b", backspace: "\x7f",
  up: "\x1b[A", down: "\x1b[B", left: "\x1b[D", right: "\x1b[C", "ctrl-c": "\x03",
};

httpServer.on("error", (e: any) => {
  if (e?.code === "EADDRINUSE") console.error(`Port ${PORT} is already in use — set PORT in .env or stop the other process.`);
  else console.error(e);
  process.exit(1);
});
function shutdown() { for (const s of sessions.values()) { try { s.proc.kill(); } catch {} } process.exit(0); }
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

httpServer.listen(PORT, BIND_HOST, () => {
  const scheme = useTLS ? "https" : "http";
  console.log(`oog.dev bridge → ${scheme}://${BIND_HOST}:${PORT}  (ws same port)`);
  console.log(`caves root: ${CODE_ROOT || "(none)"}   claude: ${CLAUDE_BIN}   tls:${useTLS}   hook:${HOOK_ENABLED}`);
  const url = process.env.OOG_URL;
  if (url && AUTH_TOKEN) {
    console.log(`\nopen: ${url}`);
    printQR(`${url}/?token=${encodeURIComponent(AUTH_TOKEN)}`).then((ok) => { if (ok) console.log("📱 scan to connect on your phone (already signed in)\n"); }).catch(() => {});
  }
  if (RELIGHT_ON_START) for (const c of embers()) { try { newSession(c.cwd, c.ccSessionId); } catch {} }
});
