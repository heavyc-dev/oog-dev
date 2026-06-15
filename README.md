<div align="center">

<img src="public/assets/oog-hero.png" width="160" alt="oog caveman">

# oog.dev 🦴

**Run Claude Code on your PC. Drive it from your phone.**

A pixel caveman who grunts through a stone tablet — your real `claude` REPL, rendered as a live terminal on your phone, on your **subscription** (not API credits).

![Node](https://img.shields.io/badge/node-20%2B-339933?logo=node.js&logoColor=white)
![Platform](https://img.shields.io/badge/windows%20·%20macos%20·%20linux-555)
![PWA](https://img.shields.io/badge/PWA-installable-orange)
![Local only](https://img.shields.io/badge/bind-127.0.0.1%20only-2ea44f)

</div>

```
📱 Phone (PWA)  ──HTTPS + WebSocket over Tailscale──►  💻 PC: bridge ──► claude (PTY)
```

Each cave is the real `claude` running under a pseudo-terminal — so it bills exactly like typing in your own terminal. The phone shows a faithful, themed terminal (xterm.js) and lets you launch, switch, and resume sessions.

---

## 🚀 Install (2 commands)

> **Need first:** [Node 20+](https://nodejs.org) and [Claude Code](https://claude.com/claude-code), installed & logged in.

```bash
npm run setup     # wizard: token, code folder, access mode, cert/Tailscale, deps, .env
npm start         # prints your URL + token
```

That's it. The wizard generates a strong token, makes a cert (or sets up Tailscale), installs deps, and writes `.env`. Open the printed URL on your phone, paste the token, tap **new cave**, pick a folder, and talk.

---

## ✨ What you get

| | |
|---|---|
| 🖥️ **Live terminal** | The real Claude TUI, themed — spinner, colors, menus, all of it |
| 🗂️ **Folder browser** | Tap 📁 to browse the PC's filesystem and pick a cave |
| ⌨️ **Slash autocomplete** | Type `/` → built-ins + your plugins, skills & project commands |
| 🔥 **Caves & embers** | Launch, switch, and `--resume` past sessions from the phone |
| 🔍 **Search · 🔠 zoom · ⇧Tab** | Find in scrollback, resize text, send back-tab to toggle modes |
| 📷 **Photo · 🎤 voice** | Send a picture into the chat; dictate prompts |
| 🔔 **Push** | Buzz when Claude needs approval, finishes, or errors |
| 📲 **QR pairing** | ⚙ Settings shows a QR — scan to open on your phone, token baked in |
| ✅ **Phone approvals** | Each tool that needs permission pops a clean Allow / Deny |

---

## 🔒 Security (read this)

> The bridge runs Claude with **full tool access**, driven from your phone. The auth token is the only gate — so the bridge **only ever listens on `127.0.0.1`**. It *refuses to start* on any other interface unless you explicitly opt in (`OOG_ALLOW_LAN=1`) **and** provide a strong token + TLS.

- **Remote access = Tailscale `serve`** proxying to localhost — a private, trusted HTTPS name on your tailnet. The bridge itself never sits on a public interface.
- ⛔ **Never `tailscale funnel`** — that exposes it to the public internet.
- Keep `.env` private (it holds your token). Treat the pairing QR like a password.

---

## 🌐 Access modes (the wizard sets these up)

| Mode | URL | Notes |
|---|---|---|
| **Tailscale** *(phone)* | `https://<pc>.<tailnet>.ts.net` | `tailscale serve --bg --https=443 http://127.0.0.1:8765` — no cert install, push works |
| **oog.dev** *(this PC)* | `https://oog.dev` | local-trusted cert via `mkcert` + hosts entry; `:8443` or `:443` (admin) |
| **Plain HTTP** *(test)* | `http://localhost:8765` | quick local check; no push |

---

<details>
<summary><b>⚙️ Config (.env) & always-on</b></summary>

All optional except `AUTH_TOKEN` (the wizard writes them):

| Var | Default | Purpose |
|---|---|---|
| `AUTH_TOKEN` | — | shared secret (required) |
| `BIND_HOST` | `127.0.0.1` | loopback only; non-loopback needs `OOG_ALLOW_LAN=1` + token + TLS |
| `PORT` | `8765` / `8443` (TLS) | listen port |
| `TLS_CERT` / `TLS_KEY` | — | enable HTTPS |
| `CODE_ROOT` | — | folder of repos for the cave picker |
| `CLAUDE_BIN` | `claude` | path to the claude executable |
| `ALLOWED_ORIGINS` | — | comma-list of web origins allowed to connect |
| `CC_BRIDGE_HOOK` | `1` | phone approval hook (`0` = fall back to in-terminal prompts) |
| `RELIGHT_ON_START` | `0` | auto-resume known caves on boot |

**Always-on (Windows):** the wizard can register a `oog.dev-bridge` logon task, or point Task Scheduler at `scripts\start-bridge.ps1` (**At log on**). Config comes from `.env`, so the launcher is just `npm start`.

</details>

<details>
<summary><b>🔌 WebSocket protocol</b></summary>

Connect to `wss://<host>/`, then send `{type:"auth","token":"…"}`.

**Client → Server:** `auth` · `list_projects` · `list_commands` · `browse{path}` · `new_session{cwd,resume?}` · `list_sessions` · `attach{sessionId}` · `prompt{sessionId,text}` · `key{sessionId,key}` · `resize{sessionId,cols,rows}` · `interrupt` · `close_session` · `permission{id,decision}` · `upload_image` · `read_file` · `push_subscribe`

**Server → Client:** `authed` · `sessions` · `projects` · `commands` · `dir` · `session_started` · `session_closed` · `attached` · `history` · `state{busy}` · `pty` · `permission_request` · `file` · `error`

The phone renders the raw PTY in xterm.js; your prompts are delivered as a bracketed paste.

</details>

<details>
<summary><b>🩺 Troubleshooting</b></summary>

- **`node-pty` build fails (Windows):** swap the dep for `@homebridge/node-pty-prebuilt-multiarch` (same API) and update the import in `server.ts`.
- **`transcript not found`:** the cave's folder had no Claude session yet — send a first prompt; it attaches once Claude writes its transcript.
- **Port in use:** set `PORT` in `.env`, or stop the other process.
- **Refuses to start (BIND_HOST):** that's the safety guard — keep `127.0.0.1` and reach it via Tailscale.

</details>

<details>
<summary><b>📁 Project layout</b></summary>

```
setup.mjs                  install wizard (zero-dep)
server.ts                  the bridge — PTY + transcript tail + http/ws + TLS + hook + scanner
transcript.mjs             JSONL → events parser (unit-tested)
hooks/permission-hook.mjs  PreToolUse hook → phone approval
public/                    the PWA — index.html, app.js, styles.css, sw.js, assets/
public/vendor/             xterm.js + addons + qrcode (committed; client runtime)
scripts/start-bridge.ps1   Windows launcher
test/                      parser tests  ·  npm test
```

Dev: `npm test` · `npm run typecheck` · `npm run dev` (watch).

</details>

---

<div align="center">

**OOGA.** 🔥

</div>
