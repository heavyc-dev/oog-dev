/* oog.dev — cc-bridge PWA client */
(() => {
  const FRAMES = {
    base:'assets/claude-base.png', blink:'assets/claude-blink.png', talk:'assets/claude-talk.png',
    happy:'assets/claude-happy.png', worried:'assets/claude-worried.png', ouch:'assets/claude-ouch.png',
    sleep:'assets/claude-sleep.png', wink:'assets/claude-wink.png',
  };
  const $ = s => document.querySelector(s);
  const el = (t, c) => { const e = document.createElement(t); if (c) e.className = c; return e; };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isTouch = matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  const base = p => String(p || '').split(/[\\/]/).pop();
  const short = p => { p = String(p || ''); return p.length > 46 ? '…' + p.slice(-46) : p; };
  const oneline = o => { try { const s = typeof o === 'string' ? o : JSON.stringify(o); return s.length > 80 ? s.slice(0, 80) + '…' : s; } catch { return ''; } };

  const screens = { connect:'#screen-connect', caves:'#screen-caves', chat:'#screen-chat' };
  const show = name => { for (const k in screens) $(screens[k]).classList.toggle('active', k === name); };

  // portrait frames
  const setAllFaces = f => document.querySelectorAll('.face[data-live]').forEach(im => { im.src = FRAMES[f]; });
  const hdrFace = $('#hdrFace');
  const setHdr = f => { if (hdrFace) hdrFace.src = FRAMES[f]; };
  let blinkTimer = null, talkTimer = null, talking = false;
  function startBlink(){ if (reduce) return; clearInterval(blinkTimer); blinkTimer = setInterval(() => {
    if (talking || frameTimer) return; setHdr('blink'); setTimeout(() => { if (!talking && !frameTimer) setHdr('base'); }, 130); }, 3600 + Math.random() * 1800); }
  function talk(ms = 1200){ if (reduce) return; talking = true; clearInterval(talkTimer); let on = false;
    talkTimer = setInterval(() => { on = !on; setHdr(on ? 'talk' : 'base'); }, 150);
    setTimeout(() => { clearInterval(talkTimer); talking = false; setHdr('base'); }, ms); }
  document.querySelectorAll('.face').forEach(im => im.src = FRAMES.base);

  // ── oog moods: caveman animations driven by app state (CSS classes on #hdrTablet) ──
  const MOODS = ['idle', 'work', 'off', 'send', 'error', 'pop', 'tool', 'alert', 'wave', 'shiver', 'cheer', 'lean', 'hype'];
  // OPTIONAL frame art per mood — drop sprites in public/assets/, register them in FRAMES below,
  // then list the sequence here. Empty = CSS-only motion (current). Example, once drawn:
  //   FRAMES.chisel = 'assets/claude-chisel.png'; FRAME_SEQ.tool = ['chisel', 'base'];
  //   FRAMES.wave = 'assets/claude-wave.png';     FRAME_SEQ.wave = ['wave', 'base'];
  const FRAME_SEQ = { off:['sleep'], error:['ouch'], alert:['worried'], cheer:['happy'], pop:['happy'], hype:['happy'] };
  let frameTimer = null, ambientMood = 'idle', moodT = null, permAlert = false, workStart = 0, allowStreak = 0, streakT = null;
  function stopFrames(){ if (frameTimer) { clearInterval(frameTimer); frameTimer = null; if (!talking) setHdr('base'); } }
  function playFrames(m){ const seq = FRAME_SEQ[m]; stopFrames(); if (!seq || !seq.length || reduce) return false; let i = 0; const step = () => { const fn = seq[i++ % seq.length]; if (FRAMES[fn]) setHdr(fn); }; step(); frameTimer = setInterval(step, 160); return true; }
  function setMoodClass(m){ const h = $('#hdrTablet'); if (!h) return; h.classList.remove(...MOODS.map(x => 'mood-' + x)); h.classList.add('mood-' + m); playFrames(m); }
  function setAmbient(m){ ambientMood = m; clearTimeout(moodT); if (!permAlert) setMoodClass(m); }
  function flashMood(m, ms = 450){ if (reduce || permAlert) return; setMoodClass(m); clearTimeout(moodT); moodT = setTimeout(() => setMoodClass(ambientMood), ms); }

  // ── caveman speech: a stone-tablet bubble pops from oog with a short grunt ──
  const SAY = {
    greet: ['OOGA!', 'ME OOG. YOU TALK.', 'FIRE LIT. WE HUNT BUG.', 'WELCOME, BIG BRAIN.'],
    send:  ['OOG HEAR YOU.', 'ME LISTEN.', 'OK OK.', 'OOGA. ON IT.'],
    work:  ['ME THINK…', 'OOG DIG ROCK.', 'BRAIN GO BRRR.', 'ME WORK, YOU WAIT.'],
    tool:  ['ME SMASH KEYS.', 'CHISEL CHISEL.', 'OOG USE TOOL.', 'ROCK GO CLACK.'],
    done:  ['OOGA! ME DONE.', 'ROCK SMOOTH NOW.', 'OOG FINISH. GOOD?', 'FIRE STILL HOT.'],
    error: ['OOG TRIP!', 'ROCK BROKE!', 'OW. BUG BITE.', 'ME NO LIKE RED.'],
    perm:  ['YOU SURE?', 'ME TOUCH THIS?', 'OOG NEED YES.', 'PUSH STONE.'],
    allow: ['OOGA! ME GO.', 'YES! SMASH.', 'OOG HAPPY.'],
    hype:  ['OOGA OOGA!', 'ME ON FIRE!', 'BIG WIN STREAK!'],
  };
  let sayT = null, lastSay = 0;
  function say(key, force){
    if (reduce) return;
    const pool = SAY[key], el = $('#oogSay'); if (!pool || !el) return;
    const now = Date.now(); if (!force && now - lastSay < 2600) return; lastSay = now;
    el.textContent = pool[Math.floor(Math.random() * pool.length)];
    el.classList.remove('hidden'); void el.offsetWidth; el.classList.add('show'); talk(900);
    clearTimeout(sayT); sayT = setTimeout(() => { el.classList.add('hidden'); el.classList.remove('show'); }, 2400);
  }

  // state
  let ws = null, token = localStorage.getItem('oog_token') || '';
  // device pairing: a ?token=… in the URL (from a scanned QR) auto-fills + is stripped from the address bar
  (function tokenFromUrl(){ try { const u = new URL(location.href); const t = u.searchParams.get('token'); if (t) { token = t; localStorage.setItem('oog_token', t); u.searchParams.delete('token'); history.replaceState(null, '', u.pathname + u.search + u.hash); } } catch {} })();
  const sessions = new Map();
  let lastEmbers = [], activeId = null, thinkingEl = null, pendingReattach = null, currentPermId = null, permSig = '', wallBuf = '', workTimer = null, reconnectN = 0;
  let working = false, snipEdit = false, viewerPath = '', viewerDiff = '', vapidKey = '';
  let term = null, fit = null, search = null;
  let fontSize = Math.min(24, Math.max(9, +localStorage.getItem('oog_fontsize') || 13));
  const queues = new Map();
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  // connect
  const wsUrl = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/`;
  function connect(){
    ws = new WebSocket(wsUrl());
    ws.onopen = () => send({ type:'auth', token });
    ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch { return; } handle(m); };
    ws.onclose = ev => {
      if (ev.code === 1008 && /origin/i.test(ev.reason || '')) { connMsg('blocked: this page’s origin isn’t in ALLOWED_ORIGINS. Open the allowed URL (your Tailscale/oog.dev address), or add this origin in .env.'); show('connect'); }
      else if (ev.code === 1008) { connMsg('wrong word. try again.'); localStorage.removeItem('oog_token'); token = ''; show('connect'); }
      else { if (activeId) pendingReattach = activeId; show('connect'); $('#connFace') && $('#connFace').classList.add('cold'); scheduleReconnect(); }
    };
    ws.onerror = () => {};
  }
  function scheduleReconnect(){
    if (reconnectN >= 6) { connMsg('still cold. tap “light the fire” to retry.'); return; }
    const delay = Math.min(30000, 800 * 2 ** reconnectN) + Math.random() * 400;
    reconnectN++;
    connMsg(`fire went cold — relighting in ${Math.round(delay / 1000)}s…`);
    setTimeout(() => { if (token) connect(); }, delay);
  }
  const send = o => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };
  const connMsg = t => { const e = $('#connMsg'); e.textContent = t; e.classList.toggle('hidden', !t); };

  // caves + embers
  function renderCaves(){
    const list = $('#caveList'); list.innerHTML = '';
    let n = 0;
    for (const s of sessions.values()) {
      n++; const dead = s.status !== 'running';
      const it = el('div', 'slot' + (dead ? ' dead' : ''));
      it.innerHTML = `<span class="fire"></span><div class="info"><div class="slotno">CAVE ${String(n).padStart(2,'0')}</div><div class="ttl">${esc(s.title)}${dead ? ' — fire out' : ''}</div></div><span class="go">▸ ${dead ? 'gone' : 'enter'}</span>`;
      if (!dead) it.onclick = () => openCave(s.id);
      list.appendChild(it);
    }
    if (!sessions.size) list.innerHTML = '<div class="muted">No fires lit. Light one below.</div>';
    if (lastEmbers.length) {
      const lbl = el('div', 'eyebrow'); lbl.style.marginTop = '6px'; lbl.textContent = 'EMBERS — relight a past cave';
      list.appendChild(lbl);
      for (const c of lastEmbers) {
        const it = el('div', 'slot dead');
        it.innerHTML = `<span class="fire"></span><div class="info"><div class="slotno">EMBER</div><div class="ttl">${esc(c.title || base(c.cwd))}</div></div><span class="go">▸ relight</span>`;
        it.onclick = () => send({ type:'new_session', cwd:c.cwd, resume:c.ccSessionId });
        list.appendChild(it);
      }
    }
  }
  function renderProjects(dirs){
    const c = $('#projectChips'); c.innerHTML = '';
    if (!dirs || !dirs.length) { c.innerHTML = '<span class="muted" style="font-size:15px">Set CODE_ROOT to list repos, or type a path below.</span>'; return; }
    for (const d of dirs) { const chip = el('div', 'chip'); chip.textContent = base(d); chip.title = d; chip.onclick = () => send({ type:'new_session', cwd:d }); c.appendChild(chip); }
  }
  function openCave(id){ activeId = id; pendingReattach = null; show('chat'); ensureTerm(); term.reset(); resetWall(); hideCmdMenu(); setHeader(sessions.get(id)); renderSnips(); renderQueue(); send({ type:'attach', sessionId:id }); send({ type:'list_commands', sessionId:id }); fitSoon(); flashMood('wave', 1000); say('greet'); }
  function setHeader(s){ if (!s) return; $('#hdrName').textContent = s.title; setWorking(false, s.status !== 'running'); $('#hdrTablet').classList.toggle('away', s.status !== 'running'); }

  // working / status
  function setWorking(on, off){
    const st = $('#hdrStatus'); const isOff = off ?? (sessions.get(activeId)?.status !== 'running');
    st.classList.toggle('off', isOff); st.classList.toggle('busy', !isOff && on);
    $('#hdrStatusText').textContent = isOff ? 'fire out' : on ? 'claude working…' : 'fire lit';
    working = !isOff && !!on;
    setAmbient(isOff ? 'off' : (on ? 'work' : 'idle'));
  }
  function ping(){ if (sessions.get(activeId)?.status !== 'running') return; setWorking(true); clearTimeout(workTimer); workTimer = setTimeout(() => { setWorking(false); flushQueue(); }, 8000); }

  // ── terminal (xterm.js) — the single live surface; renders the real Claude TUI ──
  const THEME = {
    background:'#15110a', foreground:'#efe3c6', cursor:'#e8a02e', cursorAccent:'#15110a', selectionBackground:'#5b4430',
    black:'#241910', red:'#d23a26', green:'#7d9a4e', yellow:'#e8a02e', blue:'#6f9ad6', magenta:'#b8472f', cyan:'#7fb0a6', white:'#efe3c6',
    brightBlack:'#a78b66', brightRed:'#e07a6a', brightGreen:'#9bbf6a', brightYellow:'#f0c050', brightBlue:'#9bbfe6', brightMagenta:'#e07a6a', brightCyan:'#a6d0c6', brightWhite:'#ffffff',
  };
  function ensureTerm(){
    if (term) return term;
    term = new Terminal({
      fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize, lineHeight: 1.15,
      theme: THEME, cursorBlink: true, scrollback: 8000, convertEol: false, allowProposedApi: true,
    });
    fit = new FitAddon.FitAddon(); term.loadAddon(fit);
    try { search = new SearchAddon.SearchAddon(); term.loadAddon(search); } catch {}
    term.open($('#term'));
    // direct typing in the terminal goes straight to the PTY (desktop power-use)
    term.onData(d => { if (activeId) send({ type:'key', sessionId:activeId, key:d }); });
    // re-fit whenever the container actually resizes — the only reliable trigger on iOS
    // (layout settle, rotation, the dynamic Safari toolbar, keyboard show/hide).
    try { new ResizeObserver(() => fitNow()).observe($('#term')); } catch { window.addEventListener('resize', fitNow); }
    if (window.visualViewport) window.visualViewport.addEventListener('resize', fitNow);
    window.addEventListener('orientationchange', () => setTimeout(fitNow, 250));
    fitSoon();
    return term;
  }
  // fit a few times after open — the first frame often hasn't laid out yet on mobile
  function fitSoon(){ [0, 120, 350, 700].forEach(ms => setTimeout(fitNow, ms)); }
  let lastDims = '';
  function fitNow(){
    if (!term || !fit) return;
    try { fit.fit(); } catch {}
    const dims = term.cols + 'x' + term.rows;
    if (activeId && term.cols && term.rows && dims !== lastDims) { lastDims = dims; send({ type:'resize', sessionId:activeId, cols:term.cols, rows:term.rows }); }
  }

  // messages
  function handle(m){
    switch (m.type) {
      case 'authed': reconnectN = 0; vapidKey = m.vapidPublicKey || ''; refreshNotifBtn(); localStorage.setItem('oog_token', token); connMsg(''); $('#connFace') && $('#connFace').classList.remove('cold'); send({ type:'list_projects' }); if (!activeId) show('caves'); break;
      case 'sessions':
        sessions.clear(); (m.sessions || []).forEach(s => sessions.set(s.id, s)); lastEmbers = m.embers || [];
        for (const k of [...queues.keys()]) if (!sessions.has(k)) queues.delete(k);
        renderCaves();
        if (pendingReattach && sessions.get(pendingReattach)?.status === 'running') { openCave(pendingReattach); }
        else if (activeId && sessions.has(activeId)) setHeader(sessions.get(activeId));
        break;
      case 'projects': renderProjects(m.dirs); break;
      case 'commands': commands = m.items || []; break;
      case 'dir': renderBrowse(m); break;
      case 'file': if ($('#viewer').classList.contains('show') && m.path === viewerPath) $('#viewerBody').textContent = m.content || '(empty)'; break;
      case 'state': if (m.sessionId === activeId) {
        if (m.busy) { if (!workStart) { workStart = Date.now(); say('work'); } }
        setWorking(!!m.busy);
        if (!m.busy) { const long = workStart && (Date.now() - workStart > 6000); workStart = 0; flushQueue(); if (long) { flashMood('cheer', 700); say('done'); } }
      } break;
      case 'session_started': sessions.set(m.sessionId, { id:m.sessionId, cwd:m.cwd, title:m.title, status:'running' }); renderCaves(); break;
      case 'session_closed': { const s = sessions.get(m.sessionId); if (s) s.status = 'exited'; renderCaves(); if (m.sessionId === activeId) setHeader(sessions.get(activeId)); break; }
      case 'attached': openCave(m.sessionId); break;
      case 'history':
        if (m.sessionId !== activeId) break;
        ensureTerm(); term.reset(); resetWall();
        feedWall(m.pty || ''); term.write(m.pty || '');
        if (sessions.get(activeId)) sessions.get(activeId).status = m.status || 'running';
        setHeader(sessions.get(activeId)); fitSoon(); break;
      case 'permission_request': if (m.sessionId === activeId) showPerm(m); break;
      case 'pty':
        if (m.sessionId && m.sessionId !== activeId) break;
        ensureTerm(); term.write(m.data || ''); feedWall(m.data || ''); ping();
        if (!currentPermId) detectPermission(wallBuf); break;
      case 'error':
        if (m.sessionId && m.sessionId !== activeId) break;
        if (term) term.write(`\r\n\x1b[31m⚠ ${String(m.message || '').replace(/[\r\n]+/g, ' ')}\x1b[0m\r\n`); flashMood('error', 800); say('error', true); break;
      // terminal shows these; the caveman just reacts:
      case 'tool_use': if (!m.sessionId || m.sessionId === activeId) { flashMood('tool', 320); if (Math.random() < 0.34) say('tool'); } break;
      case 'assistant': if (!m.sessionId || m.sessionId === activeId) talk(Math.min(2600, 700 + (m.text || '').length * 10)); break;
    }
  }
  // permission detection — the PTY is rendered by xterm; we keep a cleaned line buffer
  // (CR overwrites, OSC/control stripped) only so the in-terminal "❯ 1." prompt fallback
  // can be detected and surfaced via the Allow/Deny overlay.
  let wallLines = [], wallCur = '';
  const OSC = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
  function resetWall(){ wallLines = []; wallCur = ''; wallBuf = ''; }
  function feedWall(data){
    const s = String(data).replace(OSC, '');
    for (const ch of s) {
      if (ch === '\n') { wallLines.push(wallCur); wallCur = ''; }
      else if (ch === '\r') { wallCur = ''; }              // carriage return → overwrite this line
      else if (ch === '\b') { wallCur = wallCur.slice(0, -1); }
      else if (ch === '\t') { wallCur += '  '; }
      else if (ch.charCodeAt(0) >= 32) { wallCur += ch; }  // printable only
    }
    if (wallLines.length > 80) wallLines = wallLines.slice(-80);
    wallBuf = (wallCur ? wallLines.concat(wallCur) : wallLines).slice(-40).join('\n').replace(/\n{3,}/g, '\n\n').slice(-4000);
  }
  function detectPermission(buf){
    const tail = buf.slice(-260);
    if (!/❯\s*1\.\s|do you want to proceed\?/i.test(tail)) return;
    const sig = tail.slice(-120); if (sig === permSig) return; permSig = sig;
    $('#choice').dataset.mode = 'keys';
    $('#choiceQ').innerHTML = 'CLAUDE ASK SOMETHING. ME ANSWER:';
    $('#choiceRaw').textContent = tail.split('\n').slice(-8).join('\n').trim();
    relabel('keys'); $('#choice').classList.add('show');
    permAlert = true; setMoodClass('alert'); say('perm', true);
  }
  function showPerm(m){
    currentPermId = m.id; $('#choice').dataset.mode = 'hook';
    const detail = m.tool === 'Bash' ? (m.input?.command || '') : (m.input?.file_path || m.input?.path || '');
    $('#choiceQ').innerHTML = `CLAUDE WANT USE <b>${esc(m.tool)}</b>${detail ? ` — <code>${esc(short(detail))}</code>` : ''}. ME DO?`;
    $('#choiceRaw').textContent = oneline(m.input);
    relabel('hook'); $('#choice').classList.add('show');
    permAlert = true; setMoodClass('alert'); say('perm', true);   // caveman holds up the stones
  }
  function relabel(mode){
    const [b1, b2, b3] = document.querySelectorAll('#choice [data-key]');
    if (mode === 'hook') { b1.textContent = '▸ ALLOW'; b2.textContent = 'DENY'; b3.style.display = 'none'; }
    else { b1.textContent = '▸ YES (1)'; b2.textContent = 'WAIT (2)'; b3.style.display = ''; b3.textContent = 'TELL (3)'; }
  }
  const closeChoice = () => { $('#choice').classList.remove('show'); permAlert = false; setMoodClass(ambientMood); };

  // wire up
  $('#connectBtn').onclick = () => { token = $('#tokenInput').value.trim() || token; if (!token) { connMsg('say the word first.'); return; } reconnectN = 0; connMsg('opening the cave…'); connect(); };
  const logoutBtn = $('#logoutBtn');
  if (logoutBtn) logoutBtn.onclick = () => { localStorage.removeItem('oog_token'); token = ''; activeId = null; pendingReattach = null; reconnectN = 99; try { ws && ws.close(); } catch {} $('#tokenInput').value = ''; show('connect'); connMsg('word forgotten.'); };
  $('#tokenInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('#connectBtn').click(); });
  $('#refreshBtn').onclick = () => { send({ type:'list_sessions' }); send({ type:'list_projects' }); };
  $('#newCaveBtn').onclick = () => { const p = $('#pathInput').value.trim(); if (p) send({ type:'new_session', cwd:p }); };
  $('#backBtn').onclick = () => { activeId = null; show('caves'); send({ type:'list_sessions' }); };
  $('#closeBtn').onclick = () => { if (activeId && confirm('Put out this fire? (ends the session)')) { send({ type:'close_session', sessionId:activeId }); activeId = null; show('caves'); } };

  const input = $('#input');
  function doSend(text){ send({ type:'prompt', sessionId:activeId, text }); ping(); flashMood('send', 360); say('send'); if (term) term.focus(); }
  function sendText(text){ text = (text || '').trim(); if (!text || !activeId) return; if (working) enqueue(activeId, text); else doSend(text); }
  function sendPrompt(){ const t = input.value; if (!t.trim() || !activeId) return; input.value = ''; input.style.height = 'auto'; hideCmdMenu(); sendText(t); }
  $('#sendBtn').onclick = sendPrompt;

  // ── slash-command autocomplete (built-ins + user/project + plugin commands & skills) ──
  let commands = [], cmdMatches = [], cmdSel = -1;
  const cmdMenu = $('#cmdMenu');
  const slashToken = () => { const mm = /^\/([\w:-]*)$/.exec(input.value); return mm ? mm[1] : null; }; // slash + name, no space yet
  function updateCmdMenu(){
    const tok = slashToken();
    if (tok === null) { hideCmdMenu(); return; }
    const t = tok.toLowerCase(), q = '/' + t;
    cmdMatches = commands.filter(c => { const lc = c.cmd.toLowerCase(); return lc.startsWith(q) || lc.includes(t); })
      .sort((a, b) => (b.cmd.toLowerCase().startsWith(q) ? 1 : 0) - (a.cmd.toLowerCase().startsWith(q) ? 1 : 0)).slice(0, 8);
    if (!cmdMatches.length) { hideCmdMenu(); return; }
    cmdSel = 0; renderCmdMenu();
  }
  function renderCmdMenu(){
    cmdMenu.innerHTML = '';
    cmdMatches.forEach((c, i) => {
      const row = el('div', 'cmd' + (i === cmdSel ? ' sel' : ''));
      const nm = el('span', 'nm'); nm.textContent = c.cmd;
      const ds = el('span', 'ds'); ds.textContent = c.description || '';
      row.appendChild(nm); row.appendChild(ds);
      if (c.source) { const src = el('span', 'src'); src.textContent = c.source.replace('plugin:', ''); row.appendChild(src); }
      row.onclick = () => acceptCmd(c.cmd);
      cmdMenu.appendChild(row);
    });
    cmdMenu.classList.remove('hidden');
  }
  function hideCmdMenu(){ cmdMenu.classList.add('hidden'); cmdMenu.innerHTML = ''; cmdMatches = []; cmdSel = -1; }
  const cmdMenuOpen = () => !cmdMenu.classList.contains('hidden') && cmdMatches.length;
  function acceptCmd(cmd){ input.value = cmd + ' '; hideCmdMenu(); input.focus(); input.style.height = 'auto'; input.style.height = Math.min(120, input.scrollHeight) + 'px'; }

  input.addEventListener('keydown', e => {
    if (cmdMenuOpen()) {
      if (e.key === 'ArrowDown') { e.preventDefault(); cmdSel = (cmdSel + 1) % cmdMatches.length; renderCmdMenu(); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); cmdSel = (cmdSel - 1 + cmdMatches.length) % cmdMatches.length; renderCmdMenu(); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); acceptCmd(cmdMatches[cmdSel].cmd); return; }
      if (e.key === 'Escape') { e.preventDefault(); hideCmdMenu(); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey && !isTouch) { e.preventDefault(); sendPrompt(); }
  });
  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(120, input.scrollHeight) + 'px'; updateCmdMenu(); });
  input.addEventListener('focus', () => { if (!permAlert && !reduce) setMoodClass('lean'); });   // caveman leans in to listen
  input.addEventListener('blur', () => { if (!permAlert) setMoodClass(ambientMood); });

  document.querySelectorAll('.cap[data-key]').forEach(c => c.addEventListener('click', () => { if (activeId) send({ type: c.dataset.key === 'ctrl-c' ? 'interrupt' : 'key', sessionId: activeId, key: c.dataset.key }); }));

  // ── terminal font size ──
  function setFont(d){ fontSize = Math.min(24, Math.max(9, fontSize + d)); try { localStorage.setItem('oog_fontsize', String(fontSize)); } catch {} if (term) { term.options.fontSize = fontSize; fitNow(); } }
  $('#fontDn').onclick = () => setFont(-1);
  $('#fontUp').onclick = () => setFont(1);

  // ── terminal search ──
  function toggleSearch(force){
    const sb = $('#searchBar'); const showIt = force ?? sb.classList.contains('hidden');
    sb.classList.toggle('hidden', !showIt);
    if (showIt) { $('#searchInput').focus(); $('#searchInput').select(); }
    else if (term) term.focus();
  }
  const doSearch = back => { const q = $('#searchInput').value; if (q && search) (back ? search.findPrevious(q) : search.findNext(q)); };
  $('#searchBtn').onclick = () => toggleSearch();
  $('#searchClose').onclick = () => toggleSearch(false);
  $('#searchNext').onclick = () => doSearch(false);
  $('#searchPrev').onclick = () => doSearch(true);
  $('#searchInput').addEventListener('input', () => { const q = $('#searchInput').value; if (search && q) search.findNext(q, { incremental: true }); });
  $('#searchInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doSearch(e.shiftKey); } else if (e.key === 'Escape') { e.preventDefault(); toggleSearch(false); } });
  document.querySelectorAll('#choice [data-key]').forEach(b => b.addEventListener('click', () => {
    const allow = b.dataset.key === '1';
    if ($('#choice').dataset.mode === 'hook' && currentPermId) { send({ type:'permission', id: currentPermId, decision: allow ? 'allow' : 'deny' }); currentPermId = null; }
    else if (activeId) { send({ type:'key', sessionId:activeId, key:b.dataset.key }); send({ type:'key', sessionId:activeId, key:'enter' }); }
    closeChoice();
    if (allow) {
      flashMood('pop', 460); say('allow');   // caveman fist-pump
      allowStreak++; clearTimeout(streakT); streakT = setTimeout(() => { allowStreak = 0; }, 12000);
      if (allowStreak >= 3) { flashMood('hype', 2400); say('hype', true); }   // on a roll → hyped
    } else { allowStreak = 0; }
  }));
  $('#choiceDismiss').onclick = () => { if (currentPermId) { send({ type:'permission', id: currentPermId, decision:'deny' }); currentPermId = null; } closeChoice(); };

  // ── prompt queue (send while claude is busy) ──
  const saveQueues = () => { try { const o = {}; for (const [k, v] of queues) if (v.length) o[k] = v; localStorage.setItem('oog_queues', JSON.stringify(o)); } catch {} };
  (() => { try { const o = JSON.parse(localStorage.getItem('oog_queues') || '{}'); Object.keys(o).forEach(k => queues.set(k, o[k])); } catch {} })();
  const qFor = id => { if (!queues.has(id)) queues.set(id, []); return queues.get(id); };
  function enqueue(id, text){ const q = qFor(id); if (q.length >= 30) return; q.push(text); renderQueue(); }
  function flushQueue(){ if (working || !activeId) return; const q = qFor(activeId); if (q.length) { const next = q.shift(); renderQueue(); doSend(next); } }
  function renderQueue(){
    const host = $('#queue'); if (!host) return;
    const q = activeId ? qFor(activeId) : [];
    host.innerHTML = '';
    if (!q.length) { host.style.display = 'none'; saveQueues(); return; }
    host.style.display = '';
    const lbl = el('span', 'qlabel'); lbl.textContent = `QUEUED (${q.length}) — sends when claude goes idle · tap to send now`; host.appendChild(lbl);
    q.forEach((t, i) => {
      const it = el('div', 'qitem'); const sp = el('span'); sp.textContent = t.length > 44 ? t.slice(0, 44) + '…' : t; it.appendChild(sp);
      const x = el('button', 'qx'); x.textContent = '✕'; x.onclick = e => { e.stopPropagation(); q.splice(i, 1); renderQueue(); }; it.appendChild(x);
      it.onclick = () => { q.splice(i, 1); renderQueue(); doSend(t); };
      host.appendChild(it);
    });
    saveQueues();
  }

  // ── snippet macros (per cave; defaults editable in Settings) ──
  const SNIP_KEY = 'oog_snips', SNIP_DEFAULTS_KEY = 'oog_snip_defaults';
  const SNIP_DEFAULTS = ['run the tests', 'commit and push with a clear message', 'summarize the current diff', 'explain the last error'];
  const defaultSnips = () => { try { const a = JSON.parse(localStorage.getItem(SNIP_DEFAULTS_KEY)); return Array.isArray(a) && a.length ? a : SNIP_DEFAULTS.slice(); } catch { return SNIP_DEFAULTS.slice(); } };
  const allSnips = () => { try { return JSON.parse(localStorage.getItem(SNIP_KEY)) || {}; } catch { return {}; } };
  const snipsFor = cwd => { const a = allSnips(); return a[cwd] ? a[cwd] : defaultSnips(); };
  const saveSnips = (cwd, list) => { const a = allSnips(); a[cwd] = list; try { localStorage.setItem(SNIP_KEY, JSON.stringify(a)); } catch {} };
  function renderSnips(){
    const host = $('#snips'); if (!host) return; host.innerHTML = '';
    const cwd = sessions.get(activeId)?.cwd; if (!cwd) return;
    const list = snipsFor(cwd);
    list.forEach((t, i) => {
      const c = el('span', 'snip'); c.title = t; c.textContent = t.length > 22 ? t.slice(0, 22) + '…' : t;
      if (snipEdit) { const x = el('b', 'x'); x.textContent = '✕'; x.onclick = e => { e.stopPropagation(); list.splice(i, 1); saveSnips(cwd, list); renderSnips(); }; c.appendChild(x); }
      else c.onclick = () => sendText(t);
      host.appendChild(c);
    });
    if (snipEdit) { const add = el('span', 'snip add'); add.textContent = '+ add'; add.onclick = () => { const t = prompt('New snippet (the prompt to send):'); if (t && t.trim()) { list.push(t.trim()); saveSnips(cwd, list); renderSnips(); } }; host.appendChild(add); }
    const ed = el('span', 'snip ed'); ed.textContent = snipEdit ? 'done' : '✎'; ed.onclick = () => { snipEdit = !snipEdit; renderSnips(); }; host.appendChild(ed);
  }

  // ── settings (home screen): edit the default quick-command list shared by all caves ──
  function snipEditorRow(text){
    const row = el('div', 'sniprow');
    const inp = el('input'); inp.type = 'text'; inp.value = text || ''; inp.placeholder = 'a prompt to send';
    const del = el('button', 'del'); del.textContent = '✕'; del.onclick = () => row.remove();
    row.appendChild(inp); row.appendChild(del); return row;
  }
  function renderPairQR(){
    const box = $('#qrBox'); if (!box) return;
    const url = `${location.origin}/?token=${encodeURIComponent(token || '')}`;
    $('#pairUrl').textContent = url;
    try { const qr = qrcode(0, 'M'); qr.addData(url); qr.make(); box.innerHTML = qr.createImgTag(4, 8); }
    catch { box.innerHTML = ''; $('#pairUrl').textContent = url + '  (QR unavailable)'; }
  }
  function openSettings(){ const host = $('#snipEditor'); host.innerHTML = ''; defaultSnips().forEach(t => host.appendChild(snipEditorRow(t))); renderPairQR(); $('#settings').classList.add('show'); }
  $('#settingsBtn').onclick = openSettings;
  $('#settingsClose').onclick = () => $('#settings').classList.remove('show');
  $('#snipAdd').onclick = () => { const r = snipEditorRow(''); $('#snipEditor').appendChild(r); r.querySelector('input').focus(); };
  $('#snipSave').onclick = () => {
    const list = [...$('#snipEditor').querySelectorAll('input')].map(i => i.value.trim()).filter(Boolean);
    try { localStorage.setItem(SNIP_DEFAULTS_KEY, JSON.stringify(list)); } catch {}
    $('#settings').classList.remove('show'); renderSnips();
  };

  // ── folder browser (pick a cave from the PC's filesystem) ──
  let browsePath = '';
  const browseTo = p => send({ type: 'browse', path: p });
  function openBrowser(){ $('#browser').classList.add('show'); browseTo(''); }
  function joinPath(base, name){ if (!base) return name; const s = base.includes('\\') || /^[A-Za-z]:/.test(base) ? '\\' : '/'; return base.replace(/[\\/]+$/, '') + s + name; }
  function renderBrowse(m){
    browsePath = m.path || '';
    $('#browsePath').textContent = m.drives ? 'This PC' : (m.path || '/');
    $('#browseHere').style.display = browsePath ? '' : 'none';
    const host = $('#browseList'); host.innerHTML = '';
    if (m.up !== null && m.up !== undefined) { const r = el('div', 'brow up'); r.textContent = '⟵  up'; r.onclick = () => browseTo(m.up); host.appendChild(r); }
    (m.drives || []).forEach(d => { const r = el('div', 'brow'); r.textContent = '🖴  ' + d; r.onclick = () => browseTo(d); host.appendChild(r); });
    (m.dirs || []).forEach(name => { const r = el('div', 'brow'); r.textContent = '📁  ' + name; r.onclick = () => browseTo(joinPath(browsePath, name)); host.appendChild(r); });
    if (!(m.drives || []).length && !(m.dirs || []).length) { const r = el('div', 'muted'); r.style.padding = '12px'; r.textContent = m.error ? '(can’t read this folder)' : '(no subfolders here)'; host.appendChild(r); }
  }
  $('#browseBtn').onclick = openBrowser;
  $('#browseClose').onclick = () => $('#browser').classList.remove('show');
  $('#browseHere').onclick = () => { if (browsePath) { $('#pathInput').value = browsePath; send({ type: 'new_session', cwd: browsePath }); $('#browser').classList.remove('show'); } };

  // ── camera / photo → prompt ──
  function sendImage(file){
    if (!activeId) return;
    const caption = input.value.trim();
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const max = 1568; let w = img.width, h = img.height; const scale = Math.min(1, max / Math.max(w, h));
      w = Math.round(w * scale); h = Math.round(h * scale);
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').drawImage(img, 0, 0, w, h);
      const dataB64 = cv.toDataURL('image/jpeg', 0.82);
      send({ type:'upload_image', sessionId: activeId, name: file.name || 'photo.jpg', caption, dataB64 });
      input.value = ''; input.style.height = 'auto'; ping();
    };
    img.onerror = () => { URL.revokeObjectURL(url); if (term) term.write('\r\n\x1b[31m⚠ couldn’t read that image — try a screenshot or JPEG (HEIC may be unsupported)\x1b[0m\r\n'); };
    img.src = url;
  }
  $('#camBtn').onclick = () => $('#fileInput').click();
  $('#fileInput').addEventListener('change', e => { const f = e.target.files && e.target.files[0]; if (f) sendImage(f); e.target.value = ''; });

  // ── voice dictation ──
  (function setupMic(){
    const b = $('#micBtn'); if (!b) return;
    if (!SR) { b.style.display = 'none'; return; }
    let rec = null, recing = false;
    b.onclick = () => {
      if (recing) { rec && rec.stop(); return; }
      rec = new SR(); rec.lang = 'en-US'; rec.interimResults = true; rec.continuous = true;
      const baseVal = input.value ? input.value + ' ' : '';
      rec.onresult = ev => { let s = ''; for (let i = ev.resultIndex; i < ev.results.length; i++) s += ev.results[i][0].transcript; input.value = baseVal + s; input.style.height = 'auto'; input.style.height = Math.min(120, input.scrollHeight) + 'px'; };
      rec.onend = () => { recing = false; b.classList.remove('rec'); input.focus(); };
      rec.onerror = ev => { recing = false; b.classList.remove('rec'); if (!window._vh && term) { window._vh = 1; term.write('\r\n\x1b[33m🎤 voice didn’t work here — use your keyboard’s mic (Web Speech is unreliable on iOS)\x1b[0m\r\n'); } };
      try { rec.start(); recing = true; b.classList.add('rec'); } catch {}
    };
  })();

  // ── file viewer (this change ↔ current file) ──
  const colorizeDiff = s => esc(String(s || '').replace(/\n$/, '').slice(0, 8000)).split('\n').map(l => l.startsWith('+') ? `<span class="add">${l}</span>` : l.startsWith('-') ? `<span class="del">${l}</span>` : l).join('\n');
  function showChange(){ $('#viewerBody').innerHTML = viewerDiff ? colorizeDiff(viewerDiff) : '(no diff captured)'; $('#viewerChange').classList.add('on'); $('#viewerCurrent').classList.remove('on'); }
  function showCurrent(){ $('#viewerCurrent').classList.add('on'); $('#viewerChange').classList.remove('on'); $('#viewerBody').textContent = 'loading…'; if (activeId) send({ type:'read_file', sessionId: activeId, path: viewerPath }); }
  function openViewer(file, diff){ if (!file || !activeId) return; viewerPath = file; viewerDiff = diff || ''; $('#viewerName').textContent = base(file); $('#viewer').classList.add('show'); showChange(); }
  $('#viewerChange').onclick = showChange;
  $('#viewerCurrent').onclick = showCurrent;
  $('#viewerClose').onclick = () => $('#viewer').classList.remove('show');
  $('#viewerCopy').onclick = () => { navigator.clipboard && navigator.clipboard.writeText($('#viewerBody').textContent); const b = $('#viewerCopy'); b.textContent = 'copied'; setTimeout(() => b.textContent = 'copy', 1200); };

  // ── push notifications ──
  function urlB64(s){ const pad = '='.repeat((4 - s.length % 4) % 4); const b = (s + pad).replace(/-/g, '+').replace(/_/g, '/'); const raw = atob(b); const a = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) a[i] = raw.charCodeAt(i); return a; }
  async function refreshNotifBtn(force){
    const b = $('#notifBtn'); if (!b) return;
    let on = force;
    if (on === undefined) { try { const reg = await navigator.serviceWorker.ready; on = !!(await reg.pushManager.getSubscription()); } catch { on = false; } }
    b.classList.toggle('on', !!on);
  }
  async function enableNotifs(){
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) { connMsg('notifications not supported in this browser.'); return; }
    if (!vapidKey) { connMsg('server has no notification keys (re-run setup to add them).'); return; }
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { connMsg('notifications not allowed.'); return; }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64(vapidKey) });
      send({ type:'push_subscribe', subscription: sub });
      refreshNotifBtn(true);
    } catch { connMsg('could not enable notifications.'); }
  }
  const notifBtn = $('#notifBtn');
  if (notifBtn) { if (!('PushManager' in window)) notifBtn.style.display = 'none'; else { notifBtn.onclick = enableNotifs; refreshNotifBtn(); } }

  // ── install as an app (Add to Home Screen) ──
  let deferredInstall = null;
  const isStandalone = () => matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  function refreshInstallBtn(){ const b = $('#installBtn'); if (!b) return; b.style.display = (!isStandalone() && (deferredInstall || isIOS())) ? '' : 'none'; }
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; refreshInstallBtn(); });
  window.addEventListener('appinstalled', () => { deferredInstall = null; refreshInstallBtn(); });
  const installBtn = $('#installBtn');
  if (installBtn) installBtn.onclick = async () => {
    if (deferredInstall) { deferredInstall.prompt(); try { await deferredInstall.userChoice; } catch {} deferredInstall = null; refreshInstallBtn(); return; }
    if (isIOS()) {
      // bake the token into the URL so the home-screen icon launches already signed in
      if (token) { try { history.replaceState(null, '', location.pathname + '?token=' + encodeURIComponent(token)); } catch {} }
      $('#iosInstall').classList.add('show');
    }
  };
  const iosClose = $('#iosInstallClose'); if (iosClose) iosClose.onclick = () => $('#iosInstall').classList.remove('show');
  refreshInstallBtn();

  startBlink();
  if (token) connect(); else show('connect');
})();
