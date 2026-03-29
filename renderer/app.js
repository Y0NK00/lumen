/* ═══════════════════════════════════════════════
   TOWER AI — App Logic v2
   ═══════════════════════════════════════════════ */

const DEFAULT_SETTINGS = {
  ollamaUrl:      'http://10.0.0.22:11434',
  skyvernUrl:     'http://10.0.0.22:8081',
  openhandsUrl:   'http://10.0.0.22:3001',
  openrouterKey:  '',
  anthropicKey:   '',
  model:          'qwen2.5:14b',
  codeModel:      'qwen2.5-coder:14b',
  theme:        'tower-dark',
  fontSize:     14,
  streaming:    true,
  font:         'default',
  notifications: { responseComplete: false, codeBotComplete: false, obsidianSave: false },
  profile:      { name: 'Will', email: 'dejavuyonko@gmail.com', nickname: 'Will', bio: '' },
  skills:       [],
  activeSkillId: null,
  memoryEnabled: false,
  memories:     [],
  voice:        'default',
  voiceEnabled: false,
  mobileWebhook: '',
};

let state = {
  mode: 'chat',
  codeTab: 'assistant',
  conversations: [],
  currentId: null,
  settings: { ...DEFAULT_SETTINGS },
  connectors: {},
  chatStreaming: false,
  stopRequested: false,
  streamController: null,
  codeWorking: false,
  webviewsLoaded: false,
  termHistory: [],
  termHistoryIdx: -1,
  projects: [],
  activeProject: null,
  searchQuery: '',
};

// ── BUILT-IN SKILLS ───────────────────────────
const BUILTIN_SKILLS = [
  { id:'builtin-homelab', name:'Homelab Admin', prompt:'You are an expert home server and Unraid administrator. The user runs an Unraid server at 10.0.0.22 with Docker containers managed via Portainer. When answering questions, be specific about Unraid paths (/mnt/user/), docker compose syntax, and community app configurations. Mention relevant community apps when applicable.' },
  { id:'builtin-coder', name:'Senior Developer', prompt:'You are a senior full-stack developer. Provide production-quality code with error handling, comments, and best practices. When writing code, always consider edge cases, security implications, and performance. Prefer TypeScript over JavaScript, and explain architectural decisions.' },
  { id:'builtin-writer', name:'Writing Coach', prompt:'You are a professional writing coach and editor. Help improve clarity, structure, and style. Point out passive voice, redundancy, and weak word choices. Suggest specific improvements and explain why they work better.' },
  { id:'builtin-analyst', name:'Data Analyst', prompt:'You are a data analyst expert. When given data or questions about data, provide statistical insights, suggest visualizations, identify trends and anomalies, and recommend actionable next steps. Use precise language and quantify findings when possible.' },
];

// ── INIT ──────────────────────────────────────
async function init() {
  const [saved, savedConvs, savedConn] = await Promise.all([
    window.tower.loadSettings(),
    window.tower.loadConversations(),
    window.tower.loadConnectors(),
  ]);

  if (saved)     state.settings    = { ...DEFAULT_SETTINGS, ...saved };
  if (savedConvs) state.conversations = savedConvs;
  if (savedConn)  state.connectors    = savedConn;

  // Auto-migrate stale port values (8080 → 8081 for Skyvern UI)
  if (state.settings.skyvernUrl === 'http://10.0.0.22:8080') {
    state.settings.skyvernUrl = 'http://10.0.0.22:8081';
    window.tower.saveSettings(state.settings);
  }

  applyTheme(state.settings.theme);
  applyFontSize(state.settings.fontSize);
  if (state.settings.textColorOverride) applyTextColor(state.settings.textColorOverride);
  if (state.settings.accentColor && state.settings.accentColor !== 'default') applyAccentColor(state.settings.accentColor);
  populateSettingsForm();
  renderSidebar();
  renderConnectorsFromState();
  renderProjects();
  renderSkillsList();
  renderMemoriesList();
  updateObsidianButton();
  bindEvents();
  showChatWelcome();
  updateSettingsConnectorSummary();
  if (state.settings.font) applyFont(state.settings.font);

  // Load webviews and Chrome after tiny delay so UI renders first
  setTimeout(initWebviews, 600);
  setTimeout(initChrome, 700);

  // Re-size webviews whenever the window is resized
  window.addEventListener('resize', () => {
    if (state.mode === 'driver') forceResizeWebview('webview-driver', 'driver-webview-wrap');
    if (state.mode === 'chrome') forceResizeWebview('webview-chrome', 'chrome-webview-wrap');
  });
}

// ── THEMES ──────────────────────────────────
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  state.settings.theme = t;
  document.querySelectorAll('.swatch').forEach(s => s.classList.toggle('active', s.dataset.theme === t));
}
function applyFontSize(sz) {
  document.getElementById('chat-messages').style.fontSize = sz + 'px';
}

// ── MODE / TAB SWITCHING ──────────────────────
// ResizeObserver registry — one observer per container, set up once
const _webviewObservers = {};

function forceResizeWebview(webviewId, containerId) {
  // Strategy: let CSS flex size the *container* correctly (don't touch it),
  // then read its actual rendered clientWidth/clientHeight and stamp those
  // explicit pixel values onto the <webview> element only.
  // Electron webviews ignore CSS % heights from flex parents — they need px.
  //
  // We retry at increasing delays to catch whatever layout pass settles last,
  // and we install a ResizeObserver so it stays correct on every window resize.

  const applySize = () => {
    const container = document.getElementById(containerId);
    const wv        = document.getElementById(webviewId);
    if (!container || !wv) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w > 50 && h > 50) {
      wv.style.width  = w + 'px';
      wv.style.height = h + 'px';
    }
  };

  // Fire immediately + at increasing delays until we get a valid measurement
  [0, 50, 150, 400, 1000, 2000].forEach(d => setTimeout(applySize, d));

  // Install ResizeObserver so the webview stays sized on every layout change
  if (!_webviewObservers[containerId]) {
    const container = document.getElementById(containerId);
    if (container && typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(applySize);
      ro.observe(container);
      _webviewObservers[containerId] = ro;
    }
  }
}

function switchMode(mode) {
  if (state.mode === mode) return;
  state.mode = mode;

  document.querySelectorAll('.top-tab').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === `panel-${mode}`));

  // Force webview to fill its container (Electron CSS flex doesn't always apply)
  if (mode === 'driver') forceResizeWebview('webview-driver', 'driver-webview-wrap');
  if (mode === 'chrome') forceResizeWebview('webview-chrome', 'chrome-webview-wrap');

  // Sidebar conversations only relevant in chat mode
  const showConvs = mode === 'chat';
  document.getElementById('btn-new-chat').style.display = showConvs ? '' : 'none';
  // Keep conversations-wrapper VISIBLE as a flex:1 spacer so sidebar footer stays at the bottom.
  // Just hide its inner list, not the wrapper itself.
  const convList = document.getElementById('conversations-list');
  const convLabel = document.querySelector('.conv-group-label');
  if (convList) convList.style.display = showConvs ? '' : 'none';
  if (convLabel) convLabel.style.display = showConvs ? '' : 'none';
}

function switchCodeTab(tab) {
  state.codeTab = tab;
  document.querySelectorAll('.code-tab').forEach(b => b.classList.toggle('active', b.dataset.codetab === tab));
  document.querySelectorAll('.code-panel').forEach(p => p.classList.toggle('active', p.id === `codetab-${tab}`));
  if (tab === 'terminal') setTimeout(() => document.getElementById('terminal-input').focus(), 50);
}

// ── WEBVIEW INIT ─────────────────────────────
function getDriverOverlayHTML() {
  return `<div class="overlay-card">
    <svg class="overlay-icon" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>
    <h3>AI Driver</h3>
    <p>Skyvern is not running or unreachable.</p>
    <p class="overlay-sub">SSH into Tower and start it:</p>
    <div class="overlay-code">
      <code>cd /mnt/user/appdata/skyvern && docker compose up -d</code>
      <button class="copy-overlay-btn" data-copy="cd /mnt/user/appdata/skyvern && docker compose up -d" onclick="navigator.clipboard.writeText(this.dataset.copy);this.textContent='Copied!';setTimeout(()=>this.textContent='Copy',2000)">Copy</button>
    </div>
    <p class="overlay-sub">UI at <strong>http://10.0.0.22:8081</strong> · API at <strong>http://10.0.0.22:8000</strong></p>
    <button class="overlay-retry-btn" id="driver-retry">↺ Retry Connection</button>
  </div>`;
}

async function initWebviews() {
  if (state.webviewsLoaded) return;
  state.webviewsLoaded = true;

  const wvDriver = document.getElementById('webview-driver');
  const wvCode   = document.getElementById('webview-code');
  const driverOverlay = document.getElementById('driver-overlay');
  const codeOverlay   = document.getElementById('code-overlay');

  // Ping Skyvern API before loading the webview to avoid nginx welcome page
  const skyvernApiUrl = state.settings.skyvernUrl.replace(':8081', ':8000');
  let skyvernUp = false;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const ping = await fetch(`${skyvernApiUrl}/api/v1/heartbeat`, { signal: ctrl.signal });
    clearTimeout(timer);
    skyvernUp = ping.ok || ping.status === 200;
  } catch {}

  if (skyvernUp) {
    // Load driver webview — Skyvern is running
    driverOverlay.innerHTML = `<div class="spinner"></div><p>Connecting to Skyvern…</p>`;
    wvDriver.src = state.settings.skyvernUrl;
    wvDriver.addEventListener('did-finish-load', () => {
      driverOverlay.classList.add('hidden');
      // Only force-resize if the driver panel is currently active;
      // switchMode() will handle it when the user navigates there.
      if (state.mode === 'driver') {
        forceResizeWebview('webview-driver', 'driver-webview-wrap');
      }
    });
    wvDriver.addEventListener('did-fail-load',   () => { driverOverlay.classList.remove('hidden'); });
  } else {
    // Leave overlay visible — Skyvern not reachable
  }

  // Load code bot
  wvCode.src = state.settings.openhandsUrl;
  wvCode.addEventListener('did-finish-load', () => { codeOverlay.classList.add('hidden'); });
  wvCode.addEventListener('did-fail-load',   () => {
    codeOverlay.innerHTML = `<p style="color:var(--text-muted);font-size:13px;">Could not connect to OpenHands at<br><code style="background:var(--bg-hover);padding:2px 6px;border-radius:4px;">${state.settings.openhandsUrl}</code><br><br>Check Settings to verify the URL.</p>`;
  });

  // Retry button — ping first, then load
  async function retrySkyvern() {
    driverOverlay.innerHTML = `<div class="spinner"></div><p>Checking Skyvern…</p>`;
    const apiUrl = state.settings.skyvernUrl.replace(':8081', ':8000');
    let up = false;
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 4000);
      const r = await fetch(`${apiUrl}/api/v1/heartbeat`, { signal: ctrl.signal });
      up = r.ok || r.status === 200;
    } catch {}
    if (up) {
      wvDriver.src = state.settings.skyvernUrl + '?t=' + Date.now();
    } else {
      driverOverlay.innerHTML = getDriverOverlayHTML();
      document.getElementById('driver-retry')?.addEventListener('click', retrySkyvern);
    }
  }
  document.getElementById('driver-retry').addEventListener('click', retrySkyvern);

  // Copy overlay cmd
  document.querySelectorAll('.copy-overlay-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(btn.dataset.copy);
      btn.textContent = 'Copied!';
      setTimeout(() => btn.textContent = 'Copy', 2000);
    });
  });

  document.getElementById('driver-reload').addEventListener('click', () => {
    driverOverlay.classList.remove('hidden');
    driverOverlay.innerHTML = `<div class="spinner"></div><p>Reloading…</p>`;
    wvDriver.reload();
  });
  document.getElementById('driver-popout').addEventListener('click', () => window.open(state.settings.skyvernUrl));
}

// ── CONVERSATIONS ────────────────────────────
function genId() { return 'c' + Date.now() + Math.random().toString(36).slice(2,5); }

function newConversation() {
  const c = { id:genId(), title:'New chat', model:state.settings.model, createdAt:Date.now(), updatedAt:Date.now(), messages:[] };
  state.conversations.unshift(c);
  state.currentId = c.id;
  renderSidebar();
  showChatWelcome();
  save();
}
function loadConversation(id) {
  state.currentId = id;
  renderSidebar();
  const c = getConv(id);
  if (!c) return;
  document.getElementById('model-select').value = c.model || state.settings.model;
  renderMessages(c.messages);
}
function deleteConv(id, e) {
  e.stopPropagation();
  state.conversations = state.conversations.filter(c => c.id !== id);
  if (state.currentId === id) { state.currentId = null; showChatWelcome(); }
  renderSidebar();
  save();
}
function getConv(id) { return state.conversations.find(c => c.id === id); }
function setTitle(c) {
  const u = c.messages.find(m => m.role === 'user');
  if (u) c.title = u.content.slice(0,50).replace(/\n/g,' ') + (u.content.length > 50 ? '…' : '');
}
async function save() { await window.tower.saveConversations(state.conversations); }

// ── SIDEBAR RENDER ───────────────────────────
function renderSidebar() {
  const list = document.getElementById('conversations-list');
  if (!state.conversations.length) {
    list.innerHTML = `<div class="conv-empty">No conversations yet.<br>Start a new chat!</div>`;
    return;
  }
  const now = Date.now(), DAY = 86400000;
  const groups = { Today:[], Yesterday:[], 'This week':[], Earlier:[] };
  const filtered = state.searchQuery
    ? state.conversations.filter(c => c.title.toLowerCase().includes(state.searchQuery) || c.messages.some(m => m.content.toLowerCase().includes(state.searchQuery)))
    : state.conversations;

  // Filter by active project
  const toShow = state.activeProject
    ? filtered.filter(c => c.projectId === state.activeProject)
    : filtered;

  for (const c of toShow) {
    const age = now - c.updatedAt;
    if (age < DAY) groups.Today.push(c);
    else if (age < DAY*2) groups.Yesterday.push(c);
    else if (age < DAY*7) groups['This week'].push(c);
    else groups.Earlier.push(c);
  }
  let html = '';
  for (const [label, convs] of Object.entries(groups)) {
    if (!convs.length) continue;
    html += `<div class="conv-group-label">${label}</div>`;
    for (const c of convs) {
      html += `
        <div class="conv-item ${c.id===state.currentId?'active':''}" data-id="${c.id}">
          <span class="conv-title">${esc(c.title)}</span>
          <div class="conv-actions">
            <button class="conv-project-btn" data-id="${c.id}" title="Add to project">📁</button>
            <button class="conv-delete" data-id="${c.id}" title="Delete">✕</button>
          </div>
        </div>`;
    }
  }
  list.innerHTML = html;
  list.querySelectorAll('.conv-item').forEach(el => el.addEventListener('click', ()=>loadConversation(el.dataset.id)));
  list.querySelectorAll('.conv-project-btn').forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); assignToProject(btn.dataset.id); }));
  list.querySelectorAll('.conv-delete').forEach(btn => btn.addEventListener('click', e=>deleteConv(btn.dataset.id,e)));
}

// ── CHAT RENDER ──────────────────────────────
function showChatWelcome() {
  document.getElementById('chat-welcome').style.display = '';
  document.getElementById('chat-messages').style.display = 'none';
}
function showChatMessages() {
  document.getElementById('chat-welcome').style.display = 'none';
  document.getElementById('chat-messages').style.display = '';
}
function renderMessages(msgs) {
  if (!msgs?.length) { showChatWelcome(); return; }
  showChatMessages();
  const el = document.getElementById('chat-messages');
  el.innerHTML = msgs.map(renderMsg).join('');
  el.scrollTop = el.scrollHeight;
  bindCopyBtns(el);
}
function renderMsg(m) {
  const u = m.role==='user';
  const body = u
    ? `<div class="message-body">${esc(m.content).replace(/\n/g,'<br>')}</div>`
    : `<div class="message-body">${mdToHtml(m.content)}</div>`;
  return `
    <div class="message-wrap"><div class="message ${m.role}">
      <div class="message-header">
        <div class="msg-avatar ${u?'user':'ai'}">${u?'W':'⚡'}</div>
        <span class="msg-name">${u?'You':'Lumen'}</span>
        <span class="msg-time">${m.timestamp?fmtTime(m.timestamp):''}</span>
      </div>
      ${body}
    </div></div>`;
}
function appendThinking() {
  showChatMessages();
  const el = document.getElementById('chat-messages');
  const d = document.createElement('div');
  d.id = 'thinking-el'; d.className = 'message-wrap';
  d.innerHTML = `<div class="message ai"><div class="message-header"><div class="msg-avatar ai">⚡</div><span class="msg-name">Lumen</span></div><div class="thinking"><div class="thinking-dot"></div><div class="thinking-dot"></div><div class="thinking-dot"></div></div></div>`;
  el.appendChild(d); el.scrollTop = el.scrollHeight;
}
function replaceThinking(content) {
  const t = document.getElementById('thinking-el');
  if (t) { t.outerHTML = renderMsg({role:'assistant',content,timestamp:Date.now()}); bindCopyBtns(document.getElementById('chat-messages')); }
  if (state.settings.voiceEnabled) speakText(content);
}
function appendStreaming() {
  showChatMessages();
  const el = document.getElementById('chat-messages');
  const d = document.createElement('div');
  d.id = 'streaming-el'; d.className = 'message-wrap';
  // Show thinking dots while waiting for model to respond
  d.innerHTML = `<div class="message ai"><div class="message-header"><div class="msg-avatar ai">⚡</div><span class="msg-name">Lumen</span></div><div class="message-body" id="streaming-body"><div class="thinking"><div class="thinking-dot"></div><div class="thinking-dot"></div><div class="thinking-dot"></div></div></div></div>`;
  el.appendChild(d);
  el.scrollTop = el.scrollHeight;
}
function updateStreaming(text) {
  const b = document.getElementById('streaming-body');
  if (b) { b.innerHTML = mdToHtml(text); document.getElementById('chat-messages').scrollTop = 99999; }
}
function finalizeStreaming(text) {
  const s = document.getElementById('streaming-el');
  if (s) { s.outerHTML = renderMsg({role:'assistant',content:text,timestamp:Date.now()}); bindCopyBtns(document.getElementById('chat-messages')); }
  if (state.settings.voiceEnabled) speakText(text);
}
function bindCopyBtns(container) {
  container.querySelectorAll('.code-copy').forEach(btn => {
    btn.addEventListener('click', () => {
      const code = btn.closest('pre').querySelector('code').textContent;
      navigator.clipboard.writeText(code).then(()=>{btn.textContent='Copied!';setTimeout(()=>btn.textContent='Copy',1500);});
    });
  });
}

// ── SEND CHAT ────────────────────────────────
async function sendChat() {
  const input = document.getElementById('chat-input');
  const rawContent = input.value.trim();
  const attach = getAttachmentContext();
  // Allow sending with only attachments (no text required)
  if (!rawContent && !attach.text && !attach.images.length) return;
  if (state.chatStreaming) return;

  const content = rawContent + attach.text; // append file text

  if (!state.currentId) newConversation();
  const conv = getConv(state.currentId);
  if (!conv) return;

  conv.model = document.getElementById('model-select').value;
  // Build display content for the stored message
  const displayContent = rawContent + (attach.images.length ? `\n[${attach.images.length} image(s) attached]` : '') + attach.text;
  conv.messages.push({ role:'user', content: displayContent, timestamp:Date.now() });
  conv.updatedAt = Date.now();
  setTitle(conv);
  renderSidebar();
  renderMessages(conv.messages);
  input.value = ''; input.style.height = 'auto';
  clearAttachments();

  // Build API messages — inject skill prompt, memory context, vault context, and images
  const contextPrefix = buildContextPrefix();
  const skillPrompt = getActiveSkillPrompt();
  const memoryCtx = getMemoryContext();
  const systemContent = [memoryCtx, skillPrompt].filter(Boolean).join('\n\n');

  // Build user message content (supports images for llava-compatible models)
  const userMsgContent = attach.images.length > 0
    ? { role: 'user', content: (contextPrefix ? contextPrefix : '') + content, images: attach.images.map(d => d.split(',')[1]) }
    : { role: 'user', content: (contextPrefix ? contextPrefix : '') + content };

  const apiMsgs = [
    ...(systemContent ? [{ role: 'system', content: systemContent }] : []),
    ...conv.messages.slice(0, -1).map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content
    })),
    userMsgContent
  ];
  if (contextPrefix) clearVaultContext(); // clear chips after sending

  state.chatStreaming = true;
  state.stopRequested = false;
  document.getElementById('btn-send').disabled = true;
  document.getElementById('btn-stop').classList.add('visible');

  try {
    if (state.settings.streaming) {
      await streamChat(apiMsgs, conv.model, conv);
    } else {
      appendThinking();
      const r = await fetchChat(apiMsgs, conv.model);
      conv.messages.push({ role:'assistant', content:r, timestamp:Date.now() });
      conv.updatedAt = Date.now();
      replaceThinking(r);
      save();
    }
  } catch(err) {
    let errMsg;
    if (state.stopRequested) {
      errMsg = `⏹ **Generation stopped.**`;
    } else if (err.name === 'AbortError') {
      errMsg = `⏱ **Request timed out after 3 minutes.**\n\nOllama is likely running **without GPU acceleration**, which makes large models extremely slow.\n\n**To fix on Unraid:**\n1. Go to Docker → click Ollama → Edit\n2. Add \`--gpus=all\` to **Extra Parameters**\n3. Apply & restart the container\n\nAlternatively, use a smaller model like **Llama 3.2 · 3B** which can run on CPU.`;
    } else {
      errMsg = `❌ **Error connecting to Ollama**\n\nMake sure Ollama is running at \`${state.settings.ollamaUrl}\`\n\n\`${err.message}\``;
    }
    // Clear streaming/thinking elements
    const streamEl = document.getElementById('streaming-el');
    if (streamEl) streamEl.remove();
    const thinkEl = document.getElementById('thinking-el');
    if (thinkEl) thinkEl.remove();
    showChatMessages();
    const errEl = document.createElement('div');
    errEl.className = 'message-wrap';
    errEl.innerHTML = renderMsg({role:'assistant', content:errMsg, timestamp:Date.now()});
    document.getElementById('chat-messages').appendChild(errEl);
  } finally {
    state.chatStreaming = false;
    state.stopRequested = false;
    document.getElementById('btn-send').disabled = false;
    document.getElementById('btn-stop').classList.remove('visible');
    input.focus();
  }
}

// ── CLOUD MODEL ROUTING ───────────────────────
// Model strings use a provider prefix so the same field handles everything:
//   "qwen2.5:14b"                → Ollama (no prefix)
//   "or:deepseek/deepseek-chat"  → OpenRouter
//   "ant:claude-haiku-4-5-20251001" → Anthropic direct
function parseModel(modelStr) {
  if (!modelStr) return { provider: 'ollama', model: 'qwen2.5:14b' };
  if (modelStr.startsWith('or:'))  return { provider: 'openrouter', model: modelStr.slice(3) };
  if (modelStr.startsWith('ant:')) return { provider: 'anthropic',  model: modelStr.slice(4) };
  return { provider: 'ollama', model: modelStr };
}

// Cloud streaming — handles both OpenRouter (OpenAI-compat SSE) and Anthropic SSE
async function streamChatCloud(msgs, model, conv, provider) {
  appendStreaming();
  let full = '', buf = '', eventType = '';
  const controller = new AbortController();
  state.streamController = controller;

  const timeoutId = setTimeout(() => { state.stopRequested = false; controller.abort(); }, 60000);
  const hintTimer  = setTimeout(() => {
    const b = document.getElementById('streaming-body');
    const name = provider === 'anthropic' ? 'Anthropic' : 'OpenRouter';
    if (b) b.innerHTML = `<div class="thinking"><div class="thinking-dot"></div><div class="thinking-dot"></div><div class="thinking-dot"></div></div><div style="font-size:12px;color:var(--text-muted);margin-top:8px;">Waiting for ${name} response…</div>`;
  }, 5000);

  try {
    let res;
    if (provider === 'openrouter') {
      if (!state.settings.openrouterKey) throw new Error('OpenRouter API key not set.\n\nGo to **Settings → Connectors** and paste your key from openrouter.ai/keys');
      res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${state.settings.openrouterKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://lumen.local',
          'X-Title': 'Lumen',
        },
        body: JSON.stringify({ model, messages: msgs, stream: true }),
        signal: controller.signal,
      });
    } else {
      // Anthropic
      if (!state.settings.anthropicKey) throw new Error('Anthropic API key not set.\n\nGo to **Settings → Connectors** and paste your key from console.anthropic.com');
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': state.settings.anthropicKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model, messages: msgs, max_tokens: 8192, stream: true }),
        signal: controller.signal,
      });
    }

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      let hint = '';
      if (res.status === 401) hint = '\n\nCheck your API key in Settings → Connectors.';
      if (res.status === 429) hint = '\n\nRate limit hit — wait a moment and try again.';
      if (res.status === 402) hint = '\n\nInsufficient credits. Top up at openrouter.ai/credits';
      throw new Error(`HTTP ${res.status}${errBody ? ': ' + errBody.slice(0, 200) : ''}${hint}`);
    }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n'); buf = lines.pop();
      for (const line of lines) {
        if (!line.trim()) { eventType = ''; continue; }
        if (provider === 'openrouter') {
          // OpenAI-compatible SSE: "data: {...}" or "data: [DONE]"
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const d = JSON.parse(data);
            const chunk = d.choices?.[0]?.delta?.content;
            if (chunk) { full += chunk; updateStreaming(full); }
          } catch {}
        } else {
          // Anthropic SSE: "event: ..." line then "data: ..." line
          if (line.startsWith('event: ')) { eventType = line.slice(7).trim(); continue; }
          if (line.startsWith('data: ') && eventType === 'content_block_delta') {
            try {
              const d = JSON.parse(line.slice(6));
              const chunk = d.delta?.text;
              if (chunk) { full += chunk; updateStreaming(full); }
            } catch {}
          }
        }
      }
    }
  } finally {
    clearTimeout(timeoutId); clearTimeout(hintTimer);
    state.streamController = null;
  }

  if (!full) {
    const name = provider === 'anthropic' ? 'Anthropic' : 'OpenRouter';
    throw new Error(`${name} returned an empty response. Your API key may be invalid — check Settings → Connectors.`);
  }
  finalizeStreaming(full);
  conv.messages.push({ role: 'assistant', content: full, timestamp: Date.now() });
  conv.updatedAt = Date.now();
  save();
}

async function streamChat(msgs, model, conv) {
  const parsed = parseModel(model);
  if (parsed.provider !== 'ollama') return streamChatCloud(msgs, parsed.model, conv, parsed.provider);

  appendStreaming();
  let full = '', buf = '';
  const controller = new AbortController();
  state.streamController = controller;

  // Abort after 3 minutes — enough for GPU, but won't hang forever on CPU-only
  const timeoutId  = setTimeout(() => { state.stopRequested = false; controller.abort(); }, 180000);

  // After 5s: show loading hint
  const hintTimer  = setTimeout(() => {
    const b = document.getElementById('streaming-body');
    if (b) b.innerHTML = `<div class="thinking"><div class="thinking-dot"></div><div class="thinking-dot"></div><div class="thinking-dot"></div></div><div style="font-size:12px;color:var(--text-muted);margin-top:8px;">Loading model into memory — this can take 30–60s on first use…</div>`;
  }, 5000);

  // After 90s on CPU this is probably not coming — show GPU nudge
  const gpuHintTimer = setTimeout(() => {
    const b = document.getElementById('streaming-body');
    if (b) b.innerHTML = `<div class="thinking"><div class="thinking-dot"></div><div class="thinking-dot"></div><div class="thinking-dot"></div></div><div style="font-size:12px;color:var(--text-muted);margin-top:8px;">Still loading… If this always hangs, Ollama may be running <strong>without GPU</strong>.<br>In Unraid → Docker → Ollama → Edit, add <code style="background:var(--bg-hover);padding:1px 5px;border-radius:3px">--gpus=all</code> to Extra Parameters.</div>`;
  }, 90000);

  const ollamaModel = parsed.model; // plain model name without any prefix
  try {
    const res = await fetch(`${state.settings.ollamaUrl}/api/chat`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({model: ollamaModel, messages:msgs, stream:true}),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errBody = await res.text().catch(()=>'');
      throw new Error(`HTTP ${res.status}${errBody ? ': ' + errBody.slice(0,200) : ''}`);
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    while (true) {
      const {done,value} = await reader.read();
      if (done) break;
      buf += dec.decode(value,{stream:true});
      const lines = buf.split('\n'); buf = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const d = JSON.parse(line);
          if (d.error) throw new Error(d.error);
          if (d.message?.content) { full += d.message.content; updateStreaming(full); }
        } catch(e) { if (e.message && !e.message.startsWith('JSON')) throw e; }
      }
    }
  } finally {
    clearTimeout(timeoutId); clearTimeout(hintTimer); clearTimeout(gpuHintTimer);
    state.streamController = null;
  }
  if (!full) throw new Error(`Model "${ollamaModel}" returned an empty response. Is it loaded in Ollama?`);
  finalizeStreaming(full);
  conv.messages.push({role:'assistant',content:full,timestamp:Date.now()});
  conv.updatedAt = Date.now();
  save();
}

async function fetchChat(msgs, model) {
  const res = await fetch(`${state.settings.ollamaUrl}/api/chat`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({model, messages:msgs, stream:false}),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();
  return d.message?.content || '';
}

// ── CODE BOT ─────────────────────────────────
const CODE_SYSTEM = `You are an expert AI coding assistant. When given a task:
1. First explain your plan briefly
2. Write complete, working code in properly labeled code blocks
3. Explain each key part
4. List any commands the user needs to run
Be concise but thorough. Format code blocks with the language name.`;

async function runCodeTask() {
  const input = document.getElementById('code-task-input');
  const task = input.value.trim();
  if (!task || state.codeWorking) return;

  const model = document.getElementById('code-model-select').value;
  setCodeStatus('working', 'Working…');
  state.codeWorking = true;
  document.getElementById('code-task-send').disabled = true;
  input.value = ''; input.style.height = 'auto';

  // Show in assistant tab
  switchCodeTab('assistant');
  appendCodeMsg('user', task);

  const messages = [
    { role:'system', content: CODE_SYSTEM },
    { role:'user', content: task },
  ];

  try {
    let full = '', buf = '';
    const el = appendCodeStreamingMsg();

    const res = await fetch(`${state.settings.ollamaUrl}/api/chat`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ model, messages, stream:true }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    while (true) {
      const {done,value} = await reader.read();
      if (done) break;
      buf += dec.decode(value,{stream:true});
      const lines = buf.split('\n'); buf = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try { const d=JSON.parse(line); if(d.message?.content){full+=d.message.content;updateCodeStreamingMsg(el,full);} } catch{}
      }
    }
    finalizeCodeMsg(el, full);
    setCodeStatus('done', 'Done');
    setTimeout(() => setCodeStatus('idle', 'Ready'), 3000);

    // Log commands to terminal
    const cmds = extractCommands(full);
    if (cmds.length) {
      termLog(`Code Bot generated ${cmds.length} command(s):`,'info');
      cmds.forEach(c => termLog(c,'cmd'));
    }

    // Auto-doc to Obsidian if connected
    if (state.connectors.obsidian?.connected) {
      const date = new Date().toISOString().split('T')[0];
      const shortTask = task.length > 60 ? task.substring(0, 60) + '…' : task;
      const folder = (state.connectors.obsidian.folder || 'Lumen/Code Bot').replace(/\/Chats$/, '') + '/Code Bot';
      const filename = `${folder}/${date} — ${shortTask}.md`;
      let md = `# ${shortTask}\n*Code Bot · ${new Date().toLocaleString()}*\n\n---\n\n## Task\n${task}\n\n## Response\n${full}\n`;
      const saved = await writeVaultNote(filename, md);
      if (saved) termLog(`📚 Saved to Obsidian: ${filename}`, 'info');
    }

  } catch(err) {
    appendCodeMsg('system', `❌ Error: ${err.message}`);
    setCodeStatus('error', 'Error');
    setTimeout(() => setCodeStatus('idle', 'Ready'), 4000);
  } finally {
    state.codeWorking = false;
    document.getElementById('code-task-send').disabled = false;
  }
}

function setCodeStatus(type, text) {
  const dot = document.getElementById('code-status-dot');
  const txt = document.getElementById('code-status-text');
  dot.className = `status-dot ${type}`;
  txt.textContent = text;
}

function appendCodeMsg(role, content) {
  const el = document.getElementById('code-messages');
  const welcome = el.querySelector('.code-welcome');
  if (welcome) welcome.remove();
  const d = document.createElement('div');
  d.className = 'code-msg';
  const roleLabel = role==='user'?'You':role==='system'?'System':'Code Bot';
  d.innerHTML = `
    <div class="code-msg-header"><span class="code-role ${role==='assistant'?'ai':''}">${roleLabel}</span></div>
    <div class="code-msg-body">${role==='user'?esc(content).replace(/\n/g,'<br>'):mdToHtml(content)}</div>`;
  el.appendChild(d);
  el.scrollTop = el.scrollHeight;
  if (role!=='user') bindCopyBtns(d);
}
function appendCodeStreamingMsg() {
  const el = document.getElementById('code-messages');
  const welcome = el.querySelector('.code-welcome');
  if (welcome) welcome.remove();
  const d = document.createElement('div');
  d.className = 'code-msg'; d.id = 'code-streaming';
  d.innerHTML = `<div class="code-msg-header"><span class="code-role ai">Code Bot</span></div><div class="code-msg-body" id="code-streaming-body"><div class="thinking"><div class="thinking-dot"></div><div class="thinking-dot"></div><div class="thinking-dot"></div></div></div>`;
  el.appendChild(d); el.scrollTop = el.scrollHeight;
  return d;
}
function updateCodeStreamingMsg(el, text) {
  const body = el.querySelector('.code-msg-body');
  if (body) { body.innerHTML = mdToHtml(text); document.getElementById('code-messages').scrollTop = 99999; }
}
function finalizeCodeMsg(el, text) {
  const body = el.querySelector('.code-msg-body');
  if (body) { body.innerHTML = mdToHtml(text); bindCopyBtns(body); }
  el.id = '';
  document.getElementById('code-messages').scrollTop = 99999;
}
function extractCommands(text) {
  const cmds = [];
  const re = /```(?:bash|sh|shell|cmd|powershell)\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    m[1].split('\n').filter(l=>l.trim()&&!l.startsWith('#')).forEach(l=>cmds.push(l.trim()));
  }
  return cmds;
}

// ── TERMINAL ─────────────────────────────────
function termLog(text, cls='out') {
  const out = document.getElementById('terminal-output');
  const line = document.createElement('div');
  line.className = `term-line ${cls}`;
  line.textContent = text;
  out.appendChild(line);
  out.scrollTop = out.scrollHeight;
}

async function runTerminalCmd(cmd) {
  if (!cmd.trim()) return;
  state.termHistory.unshift(cmd);
  state.termHistoryIdx = -1;
  termLog(cmd, 'cmd');
  const input = document.getElementById('terminal-input');
  input.value = '';

  // Handle built-in commands
  if (cmd === 'clear') {
    document.getElementById('terminal-output').innerHTML = '';
    return;
  }
  if (cmd.startsWith('ai ')) {
    const question = cmd.slice(3).trim();
    termLog(`Asking Lumen: ${question}`, 'info');
    try {
      const res = await fetchChat([{role:'user',content:question}], state.settings.codeModel||'qwen2.5-coder:14b');
      res.split('\n').forEach(l => termLog(l,'out'));
    } catch(e) { termLog(`Error: ${e.message}`, 'err'); }
    return;
  }

  try {
    const result = await window.tower.runCommand(cmd);
    if (result.stdout) result.stdout.split('\n').filter(Boolean).forEach(l => termLog(l, 'out'));
    if (result.stderr) result.stderr.split('\n').filter(Boolean).forEach(l => termLog(l, 'err'));
    if (!result.stdout && !result.stderr) termLog('(no output)', 'system');
  } catch(e) { termLog(`Error: ${e.message}`, 'err'); }
}

// ── CONNECTORS ───────────────────────────────
function renderConnectorsFromState() {
  for (const [key, conn] of Object.entries(state.connectors)) {
    if (conn.connected) updateConnectorUI(key, 'connected', conn.label || 'Connected');
  }
}

function updateConnectorUI(key, status, label) {
  const pill = document.querySelector(`.connector-status-pill[data-for="${key}"]`);
  const card = document.querySelector(`.connector-card[data-connector="${key}"]`);
  if (pill) { pill.textContent = label; pill.className = `connector-status-pill ${status==='connected'?'connected':status==='error'?'error':''}`; }
  if (card) { card.classList.toggle('connected', status==='connected'); }
}

function getConnectorInput(key, field) {
  const el = document.getElementById(`${key}-${field}`);
  return el ? el.value.trim() : '';
}

async function testConnector(key) {
  const resultEl = document.getElementById(`${key}-result`);
  if (resultEl) { resultEl.textContent = 'Testing…'; resultEl.className = 'connector-result'; }
  updateConnectorUI(key, '', 'Testing…');

  try {
    let ok = false, message = '';
    switch(key) {
      case 'github': {
        const token = getConnectorInput('github','token');
        if (!token) throw new Error('Enter a token first');
        const res = await fetch('https://api.github.com/user', { headers:{ Authorization:`token ${token}` } });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
        ok = true; message = `✓ Connected as @${data.login}`;
        state.connectors.github = { connected:true, token, label:`@${data.login}` };
        break;
      }
      case 'telegram': {
        const token = getConnectorInput('telegram','token');
        if (!token) throw new Error('Enter a bot token first');
        const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
        const data = await res.json();
        if (!data.ok) throw new Error(data.description || 'Invalid token');
        ok = true; message = `✓ Bot: @${data.result.username}`;
        state.connectors.telegram = { connected:true, token, chatId:getConnectorInput('telegram','chatid'), label:`@${data.result.username}` };
        break;
      }
      case 'n8n': {
        const url = getConnectorInput('n8n','url') || 'http://10.0.0.22:5678';
        const key2 = getConnectorInput('n8n','key');
        const headers = key2 ? { 'X-N8N-API-KEY': key2 } : {};
        const res = await fetch(`${url}/api/v1/workflows?limit=1`, { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        ok = true; message = `✓ Connected · ${data.data?.length ?? 0} workflows visible`;
        state.connectors.n8n = { connected:true, url, label:'Connected' };
        break;
      }
      case 'flowise': {
        const url = getConnectorInput('flowise','url') || 'http://10.0.0.22:3002';
        const res = await fetch(`${url}/api/v1/chatflows`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        ok = true; message = `✓ Connected · ${data.length} chatflows`;
        state.connectors.flowise = { connected:true, url, label:'Connected' };
        break;
      }
      case 'obsidian': {
        const url = getConnectorInput('obsidian','url') || 'http://127.0.0.1:27123';
        const key2 = getConnectorInput('obsidian','key');
        const res = await fetch(`${url}/`, { headers: key2?{'Authorization':`Bearer ${key2}`}:{} });
        if (!res.ok) throw new Error(`HTTP ${res.status} — is Local REST API plugin running?`);
        ok = true; message = `✓ Obsidian vault connected`;
        state.connectors.obsidian = { connected:true, url, key:key2, folder:getConnectorInput('obsidian','folder'), label:'Connected' };
        break;
      }
      case 'skyvern': {
        const url = getConnectorInput('skyvern','url') || 'http://10.0.0.22:8000';
        const key2 = getConnectorInput('skyvern','key') || 'tower-skyvern-key';
        const res = await fetch(`${url}/api/v1/tasks?page_size=1`, { headers:{'x-api-key':key2} });
        if (!res.ok) throw new Error(`HTTP ${res.status} — is Skyvern running?`);
        ok = true; message = `✓ Skyvern connected`;
        state.connectors.skyvern = { connected:true, url, key:key2, label:'Connected' };
        // Update AI Driver webview URL (API is :8000, UI is :8080)
        state.settings.skyvernUrl = url.replace(':8000', ':8081');
        break;
      }
      case 'openhands': {
        const url = getConnectorInput('openhands','conn-url') || 'http://10.0.0.22:3001';
        const res = await fetch(`${url}/api/options/config`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        ok = true; message = `✓ OpenHands connected`;
        state.connectors.openhands = { connected:true, url, label:'Connected' };
        state.settings.openhandsUrl = url;
        break;
      }
      case 'homeassistant': {
        const url = getConnectorInput('homeassistant','url') || 'http://10.0.0.22:8123';
        const token = getConnectorInput('homeassistant','token');
        if (!token) throw new Error('Enter a long-lived access token first');
        const res = await fetch(`${url}/api/`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        ok = true; message = `✓ Home Assistant ${data.version || 'connected'}`;
        state.connectors.homeassistant = { connected:true, url, token, label:'Connected' };
        break;
      }
      case 'netdata': {
        const url = getConnectorInput('netdata','url') || 'http://10.0.0.22:19999';
        const res = await fetch(`${url}/api/v1/info`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        ok = true; message = `✓ Netdata ${data.version || 'connected'} — ${data.os_name || ''}`;
        state.connectors.netdata = { connected:true, url, label:'Connected' };
        break;
      }
      default:
        message = 'Test not available for this connector.';
    }
    if (resultEl) { resultEl.textContent = message; resultEl.className = `connector-result ${ok?'ok':'err'}`; }
    updateConnectorUI(key, ok?'connected':'error', ok?(state.connectors[key]?.label||'Connected'):'Error');
    await window.tower.saveConnectors(state.connectors);
    await window.tower.saveSettings(state.settings);
    updateSettingsConnectorSummary();
    updateObsidianButton();
  } catch(err) {
    if (resultEl) { resultEl.textContent = `✗ ${err.message}`; resultEl.className = 'connector-result err'; }
    updateConnectorUI(key, 'error', 'Error');
  }
}

function updateSettingsConnectorSummary() {
  const el = document.getElementById('settings-connectors-summary');
  if (!el) return;
  const allKeys = ['github','gmail','telegram','obsidian','n8n','flowise','skyvern','openhands','homeassistant','netdata'];
  const html = allKeys.map(k => {
    const c = state.connectors[k];
    const ok = c?.connected;
    return `<span class="conn-badge ${ok?'ok':'off'}">${k.charAt(0).toUpperCase()+k.slice(1)}</span>`;
  }).join('');
  el.innerHTML = html;
}

// ── SETTINGS ─────────────────────────────────
function openSettings(sec) {
  document.getElementById('settings-panel').classList.remove('hidden');
  populateSettingsForm();
  updateSettingsConnectorSummary();
  switchSettingsSection(sec || 'general');
  // Sync the profile footer in the settings nav
  const name  = state.settings.displayName || 'Will';
  const email = state.settings.email || 'dejavuyonko@gmail.com';
  const avatar = name.charAt(0).toUpperCase();
  const el = document.getElementById('snav-profile-avatar');
  if (el) el.textContent = avatar;
  const ne = document.getElementById('snav-profile-name');
  if (ne) ne.textContent = name;
  const ee = document.getElementById('snav-profile-email');
  if (ee) ee.textContent = email;
}
function closeSettings() {
  document.getElementById('settings-panel').classList.add('hidden');
}
function switchSettingsSection(sec) {
  document.querySelectorAll('.snav-item').forEach(b => b.classList.toggle('active', b.dataset.sec === sec));
  document.querySelectorAll('.sec-page').forEach(p => p.classList.toggle('active', p.id === `sec-${sec}`));
}
function populateSettingsForm() {
  document.getElementById('s-ollama').value         = state.settings.ollamaUrl;
  document.getElementById('s-skyvern').value        = state.settings.skyvernUrl;
  document.getElementById('s-openhands').value      = state.settings.openhandsUrl;
  document.getElementById('s-openrouter-key').value = state.settings.openrouterKey || '';
  document.getElementById('s-anthropic-key').value  = state.settings.anthropicKey  || '';
  document.getElementById('s-model').value          = state.settings.model;
  document.getElementById('s-fontsize').value  = state.settings.fontSize;
  document.getElementById('s-fontsize-label').textContent = state.settings.fontSize+'px';
  document.querySelectorAll('.theme-opt').forEach(o => o.classList.toggle('active', o.dataset.theme === state.settings.theme));
  // Font
  if (state.settings.font) applyFont(state.settings.font);
  // Notifications
  const notif = state.settings.notifications || {};
  const nr = document.getElementById('s-notify-response'); if(nr) nr.checked = !!notif.responseComplete;
  const nc = document.getElementById('s-notify-codebot'); if(nc) nc.checked = !!notif.codeBotComplete;
  const no = document.getElementById('s-notify-obsidian'); if(no) no.checked = !!notif.obsidianSave;
  // Profile
  const prof = state.settings.profile || {};
  const dn = document.getElementById('s-display-name'); if(dn) dn.value = prof.name||'Will';
  const em = document.getElementById('s-email'); if(em) em.value = prof.email||'';
  const nn = document.getElementById('s-nickname'); if(nn) nn.value = prof.nickname||'Will';
  const bio = document.getElementById('s-bio'); if(bio) bio.value = prof.bio||'';
  // Update profile popup info
  const mn = document.getElementById('pp-name'); if(mn) mn.textContent = prof.name||'Will';
  const me = document.getElementById('pp-email'); if(me) me.textContent = prof.email||'dejavuyonko@gmail.com';
  const av = document.getElementById('pp-avatar'); if(av) av.textContent = (prof.name||'Will')[0].toUpperCase();
  // Update sidebar profile button
  const pn = document.getElementById('prof-name'); if(pn) pn.textContent = prof.name||'Will';
  const pe = document.getElementById('prof-email'); if(pe) pe.textContent = prof.email||'dejavuyonko@gmail.com';
  // Capabilities section
  const capStream = document.getElementById('cap-streaming'); if(capStream) capStream.checked = state.settings.streaming !== false;
  const capMem = document.getElementById('cap-memory'); if(capMem) capMem.checked = !!state.settings.memoryEnabled;
  const capObs = document.getElementById('cap-obsidian'); if(capObs) capObs.checked = !!state.settings.obsidianEnabled;
  const capVoice = document.getElementById('cap-voice'); if(capVoice) capVoice.checked = !!state.settings.voiceEnabled;
  const capNotif = document.getElementById('cap-notifications'); if(capNotif) capNotif.checked = !!(state.settings.notifications||{}).responseComplete;
  const capMobile = document.getElementById('cap-mobile'); if(capMobile) capMobile.checked = !!state.settings.mobileEnabled;
  // Accent color restore
  const savedAccent = state.settings.accentColor || 'default';
  document.querySelectorAll('.accent-color-opt').forEach(b =>
    b.classList.toggle('active', b.dataset.accentcolor === savedAccent)
  );
  const sac = document.getElementById('s-accent-color');
  if (sac && savedAccent !== 'default') sac.value = savedAccent;
  // Skills, Memory, Voice
  renderSkillsList();
  renderMemoriesList();
  // Voice picker (toggle is in Capabilities section as cap-voice)
  populateVoicePicker();
  // Mobile
  const mw = document.getElementById('s-mobile-webhook'); if(mw) mw.value = state.settings.mobileWebhook || '';
}
async function saveSettings() {
  state.settings.ollamaUrl      = document.getElementById('s-ollama').value.trim()    || DEFAULT_SETTINGS.ollamaUrl;
  state.settings.skyvernUrl     = document.getElementById('s-skyvern').value.trim()   || DEFAULT_SETTINGS.skyvernUrl;
  state.settings.openhandsUrl   = document.getElementById('s-openhands').value.trim() || DEFAULT_SETTINGS.openhandsUrl;
  state.settings.openrouterKey  = document.getElementById('s-openrouter-key').value.trim();
  state.settings.anthropicKey   = document.getElementById('s-anthropic-key').value.trim();
  state.settings.model          = document.getElementById('s-model').value;
  state.settings.fontSize     = parseInt(document.getElementById('s-fontsize').value, 10);
  applyFontSize(state.settings.fontSize);
  document.getElementById('model-select').value = state.settings.model;
  // Capabilities
  state.settings.streaming    = document.getElementById('cap-streaming')?.checked ?? true;
  state.settings.memoryEnabled = document.getElementById('cap-memory')?.checked || false;
  state.settings.obsidianEnabled = document.getElementById('cap-obsidian')?.checked || false;
  state.settings.voiceEnabled = document.getElementById('cap-voice')?.checked || false;
  state.settings.mobileEnabled = document.getElementById('cap-mobile')?.checked || false;
  state.settings.mobileWebhook = document.getElementById('s-mobile-webhook')?.value?.trim() || '';
  state.settings.notifications = {
    responseComplete: document.getElementById('cap-notifications')?.checked || false,
    codeBotComplete: document.getElementById('s-notify-codebot')?.checked || false,
    obsidianSave: document.getElementById('s-notify-obsidian')?.checked || false,
  };
  // Profile (from General section)
  state.settings.profile = {
    name: document.getElementById('s-display-name')?.value?.trim() || 'Will',
    email: state.settings.profile?.email || 'dejavuyonko@gmail.com',
    nickname: document.getElementById('s-nickname')?.value?.trim() || 'Will',
    bio: document.getElementById('s-bio')?.value?.trim() || '',
  };
  // Update profile popup + sidebar button
  const ppn = document.getElementById('pp-name'); if(ppn) ppn.textContent = state.settings.profile.name;
  const ppe = document.getElementById('pp-email'); if(ppe) ppe.textContent = state.settings.profile.email;
  const ppa = document.getElementById('pp-avatar'); if(ppa) ppa.textContent = (state.settings.profile.name||'W')[0].toUpperCase();
  const pbn = document.getElementById('prof-name'); if(pbn) pbn.textContent = state.settings.profile.name;
  const pbe = document.getElementById('prof-email'); if(pbe) pbe.textContent = state.settings.profile.email;
  updateObsidianButton();
  await window.tower.saveSettings(state.settings);
  closeSettings();
}
async function fetchModels() {
  const st = document.getElementById('fetch-models-status');
  st.textContent = 'Fetching…';
  try {
    const res = await fetch(`${state.settings.ollamaUrl}/api/tags`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const models = data.models || [];
    if (!models.length) { st.textContent = 'No models found.'; return; }
    [document.getElementById('s-model'), document.getElementById('model-select'), document.getElementById('code-model-select')].forEach(sel => {
      sel.innerHTML = models.map(m => `<option value="${m.name}">${m.name}</option>`).join('');
    });
    st.textContent = `✓ ${models.length} models loaded`;
    setTimeout(() => st.textContent='', 3000);
  } catch(e) { st.textContent = `✗ ${e.message}`; }
}

// ── MARKDOWN ──────────────────────────────────
function mdToHtml(text) {
  if (!text) return '';
  // Fenced code blocks
  text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) =>
    `<pre><div class="code-header"><span>${lang||'code'}</span><button class="code-copy">Copy</button></div><code>${esc(code.trim())}</code></pre>`);
  // Inline code
  text = text.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  // Bold, italic
  text = text.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
  text = text.replace(/__([^_]+)__/g,'<strong>$1</strong>');
  text = text.replace(/\*([^*\n]+)\*/g,'<em>$1</em>');
  text = text.replace(/~~([^~]+)~~/g,'<del>$1</del>');
  // Headers
  text = text.replace(/^### (.+)$/gm,'<h3>$1</h3>');
  text = text.replace(/^## (.+)$/gm,'<h2>$1</h2>');
  text = text.replace(/^# (.+)$/gm,'<h1>$1</h1>');
  // Blockquote
  text = text.replace(/^> (.+)$/gm,'<blockquote>$1</blockquote>');
  // HR
  text = text.replace(/^(---|\*\*\*|___)$/gm,'<hr>');
  // Lists
  text = text.replace(/^[\-\*\+] (.+)$/gm,'<li>$1</li>');
  text = text.replace(/^(\d+)\. (.+)$/gm,'<li>$2</li>');
  text = text.replace(/((?:<li>.*<\/li>\n?)+)/g, m => `<ul>${m}</ul>`);
  // Links
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2" target="_blank">$1</a>');
  // Paragraphs
  const parts = text.split(/\n\n+/);
  text = parts.map(p => {
    p = p.trim();
    if (!p) return '';
    if (/^<(h[1-6]|pre|ul|ol|blockquote|hr)/.test(p)) return p;
    return `<p>${p.replace(/\n/g,'<br>')}</p>`;
  }).filter(Boolean).join('\n');
  return text;
}

// ── OBSIDIAN SAVE ─────────────────────────────
async function saveToObsidian() {
  const obs = state.connectors.obsidian;
  if (!obs?.connected) {
    alert('Obsidian is not connected. Go to Connectors and set up the Obsidian Local REST API.');
    return;
  }
  const conv = state.conversations.find(c => c.id === state.activeConversationId);
  if (!conv || conv.messages.length === 0) {
    alert('No conversation to save.');
    return;
  }

  // Format conversation as Markdown note
  const date = new Date().toISOString().split('T')[0];
  const time = new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
  const title = conv.title || 'Lumen Chat';
  const folder = obs.folder || 'Lumen/Chats';
  const filename = `${folder}/${date} — ${title}.md`;

  let md = `# ${title}\n`;
  md += `*Saved from Lumen on ${date} at ${time}*\n\n`;
  md += `---\n\n`;
  for (const msg of conv.messages) {
    const role = msg.role === 'user' ? '**You**' : '**Lumen**';
    md += `${role}\n${msg.content}\n\n`;
  }

  const btn = document.getElementById('btn-save-obsidian');
  const origText = btn.innerHTML;
  btn.innerHTML = '⏳ Saving…';
  btn.disabled = true;

  try {
    const url = obs.url || 'http://127.0.0.1:27123';
    const headers = { 'Content-Type': 'text/markdown' };
    if (obs.key) headers['Authorization'] = `Bearer ${obs.key}`;

    const res = await fetch(`${url}/vault/${encodeURIComponent(filename)}`, {
      method: 'PUT',
      headers,
      body: md
    });

    if (res.ok || res.status === 204) {
      btn.innerHTML = '✓ Saved!';
      setTimeout(() => { btn.innerHTML = origText; btn.disabled = false; }, 2500);
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch(err) {
    btn.innerHTML = '✗ Failed';
    btn.disabled = false;
    setTimeout(() => { btn.innerHTML = origText; }, 2500);
    console.error('Obsidian save failed:', err);
  }
}

function updateObsidianButton() {
  const obsConnected = !!state.connectors.obsidian?.connected;
  const saveBtn  = document.getElementById('btn-save-obsidian');
  const vaultBtn = document.getElementById('btn-vault');
  if (saveBtn)  saveBtn.style.display  = obsConnected ? 'inline-flex' : 'none';
  if (vaultBtn) vaultBtn.style.display = obsConnected ? 'inline-flex' : 'none';
}

// ── VAULT CONTEXT (Obsidian read + inject) ─────────────────────────────────
let vaultContext     = [];
let vaultPreviewFile = '';
let vaultPreviewText = '';

function openVaultModal() {
  const obs = state.connectors.obsidian;
  if (!obs?.connected) { alert('Obsidian not connected. Configure it in Connectors first.'); return; }
  document.getElementById('vault-overlay').classList.remove('hidden');
  document.getElementById('vault-modal').classList.remove('hidden');
  document.getElementById('vault-search-input').focus();
  loadVaultFiles('');
}

function closeVaultModal() {
  document.getElementById('vault-overlay').classList.add('hidden');
  document.getElementById('vault-modal').classList.add('hidden');
  vaultPreviewFile = '';
  vaultPreviewText = '';
  document.getElementById('vault-preview-filename').textContent = '';
  document.getElementById('vault-preview-content').textContent = 'Select a note to preview its contents.';
  document.getElementById('btn-attach-context').disabled = true;
  document.getElementById('vault-status').textContent = '';
}

async function searchVault() {
  await loadVaultFiles(document.getElementById('vault-search-input').value.trim());
}

async function loadVaultFiles(query) {
  const obs = state.connectors.obsidian;
  const base = (obs.url || 'http://127.0.0.1:27123').replace(/\/$/, '');
  const headers = obs.key ? { 'Authorization': `Bearer ${obs.key}` } : {};
  const el = document.getElementById('vault-results');
  el.innerHTML = '<div class="vault-hint">Loading…</div>';
  try {
    let files = [];
    if (query) {
      const res = await fetch(`${base}/search/simple/?query=${encodeURIComponent(query)}&contextLength=30`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      files = data.map(r => r.filename);
    } else {
      const res = await fetch(`${base}/vault/`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      files = (data.files || []).filter(f => f.endsWith('.md')).slice(0, 50);
    }
    if (files.length === 0) { el.innerHTML = '<div class="vault-hint">No notes found.</div>'; return; }
    el.innerHTML = files.map(f => {
      const name = f.split('/').pop().replace(/\.md$/, '');
      const dir  = f.includes('/') ? f.substring(0, f.lastIndexOf('/')) : '';
      return `<div class="vault-file" onclick="previewVaultFile('${f.replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'\\"')}', this)">
        <span class="vf-name">${name}</span>${dir ? `<span class="vf-dir">${dir}</span>` : ''}
      </div>`;
    }).join('');
    document.getElementById('vault-status').textContent = `${files.length} note${files.length!==1?'s':''} found`;
  } catch(err) {
    el.innerHTML = `<div class="vault-hint" style="color:#f87171">Error: ${err.message}</div>`;
  }
}

async function previewVaultFile(filename, el) {
  const obs = state.connectors.obsidian;
  const base = (obs.url || 'http://127.0.0.1:27123').replace(/\/$/, '');
  const headers = obs.key ? { 'Authorization': `Bearer ${obs.key}` } : {};
  document.querySelectorAll('.vault-file').forEach(e => e.classList.remove('selected'));
  if (el) el.classList.add('selected');
  document.getElementById('vault-preview-filename').textContent = filename;
  document.getElementById('vault-preview-content').textContent = 'Loading…';
  document.getElementById('btn-attach-context').disabled = true;
  try {
    const res = await fetch(`${base}/vault/${encodeURIComponent(filename)}`, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    vaultPreviewFile = filename;
    vaultPreviewText = text;
    const preview = text.length > 700 ? text.substring(0, 700) + '\n\n… (truncated — full note will be used as context)' : text;
    document.getElementById('vault-preview-content').textContent = preview;
    document.getElementById('btn-attach-context').disabled = false;
  } catch(err) {
    document.getElementById('vault-preview-content').textContent = `Error: ${err.message}`;
  }
}

function attachVaultContext() {
  if (!vaultPreviewFile) return;
  if (!vaultContext.find(c => c.filename === vaultPreviewFile)) {
    vaultContext.push({ filename: vaultPreviewFile, content: vaultPreviewText });
    renderContextChips();
  }
  closeVaultModal();
}

function renderContextChips() {
  const container = document.getElementById('context-chips');
  if (!container) return;
  if (vaultContext.length === 0) { container.innerHTML = ''; container.style.display = 'none'; return; }
  container.style.display = 'flex';
  container.innerHTML = vaultContext.map((c, i) => {
    const name = c.filename.split('/').pop().replace(/\.md$/, '');
    return `<div class="context-chip">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
      ${name}
      <button onclick="removeVaultContext(${i})" title="Remove">✕</button>
    </div>`;
  }).join('');
}

function removeVaultContext(index) {
  vaultContext.splice(index, 1);
  renderContextChips();
}

function buildContextPrefix() {
  if (vaultContext.length === 0) return '';
  let prefix = 'The following notes from the user\'s Obsidian vault are provided as context for this conversation:\n\n';
  for (const c of vaultContext) {
    prefix += `--- Note: ${c.filename} ---\n${c.content}\n\n`;
  }
  prefix += '--- End of vault context ---\n\n';
  return prefix;
}

function clearVaultContext() {
  vaultContext = [];
  renderContextChips();
}

// Write a note directly to the vault (used by Code Bot auto-doc)
async function writeVaultNote(filename, content) {
  const obs = state.connectors.obsidian;
  if (!obs?.connected) return false;
  const base = (obs.url || 'http://127.0.0.1:27123').replace(/\/$/, '');
  const headers = { 'Content-Type': 'text/markdown' };
  if (obs.key) headers['Authorization'] = `Bearer ${obs.key}`;
  try {
    const res = await fetch(`${base}/vault/${encodeURIComponent(filename)}`, { method: 'PUT', headers, body: content });
    return res.ok || res.status === 204;
  } catch { return false; }
}

// ── UTILS ─────────────────────────────────────
function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmtTime(ts) {
  const d=new Date(ts), now=new Date();
  if (d.toDateString()===now.toDateString()) return d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  return d.toLocaleDateString([],{month:'short',day:'numeric'});
}

// ── PROJECTS ─────────────────────────────────
function renderProjects() {
  const list = document.getElementById('projects-list');
  if (!list) return;
  const projects = state.projects || [];
  if (!projects.length) {
    list.innerHTML = `<div class="project-empty">No projects yet</div>`;
    return;
  }
  list.innerHTML = projects.map(p => {
    const count = state.conversations.filter(c => c.projectId === p.id).length;
    return `<div class="project-item ${state.activeProject === p.id ? 'active' : ''}" data-pid="${p.id}">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
      <span style="flex:1">${esc(p.name)}</span>
      <span class="project-count">${count}</span>
    </div>`;
  }).join('');
  list.querySelectorAll('.project-item').forEach(el => {
    el.addEventListener('click', () => filterByProject(el.dataset.pid));
  });
}
function newProject() {
  // Now handled by inline input — see showNewProjectInput()
  showNewProjectInput();
}
async function saveProjects() {
  await window.tower.saveSettings({ ...state.settings, _projects: state.projects });
}
function assignToProject(convId) {
  if (!state.projects?.length) { alert('Create a project first (+ button above).'); return; }
  const options = ['(None)', ...state.projects.map(p => p.name)];
  const choice = prompt(`Assign to project:\n${options.map((o,i) => `${i}: ${o}`).join('\n')}\n\nEnter number:`);
  if (choice === null) return;
  const idx = parseInt(choice);
  const conv = getConv(convId);
  if (!conv) return;
  if (idx === 0) { delete conv.projectId; }
  else if (state.projects[idx-1]) { conv.projectId = state.projects[idx-1].id; }
  save();
  renderSidebar();
  renderProjects();
}

function filterByProject(pid) {
  state.activeProject = state.activeProject === pid ? null : pid;
  renderProjects();
  renderSidebar();
}

// ── SKILLS SYSTEM ────────────────────────────
let editingSkillId = null;

function renderSkillsList() {
  const list = document.getElementById('skills-list');
  const builtinList = document.getElementById('builtin-skills-list');
  if (!list) return;

  const skills = state.settings.skills || [];
  if (!skills.length) {
    list.innerHTML = '<div class="project-empty">No custom skills yet. Click "+ New Skill" to create one.</div>';
  } else {
    list.innerHTML = skills.map(s => `
      <div class="skill-item ${s.id === state.settings.activeSkillId ? 'active' : ''}">
        <div class="skill-item-info">
          <div class="skill-item-name">${esc(s.name)}</div>
          <div class="skill-item-preview">${esc(s.prompt.slice(0, 80))}…</div>
        </div>
        <div class="skill-item-actions">
          <button class="skill-use-btn" onclick="setActiveSkill('${s.id}')">Use</button>
          <button class="skill-edit-btn" onclick="openSkillEditor('${s.id}')">Edit</button>
          <button class="skill-del-btn" onclick="deleteSkill('${s.id}')">✕</button>
        </div>
      </div>`).join('');
  }

  if (builtinList) {
    builtinList.innerHTML = BUILTIN_SKILLS.map(s => `
      <div class="skill-item ${s.id === state.settings.activeSkillId ? 'active' : ''}">
        <div class="skill-item-info">
          <div class="skill-item-name">${esc(s.name)}</div>
          <div class="skill-item-preview">${esc(s.prompt.slice(0, 80))}…</div>
        </div>
        <div class="skill-item-actions">
          <button class="skill-use-btn" onclick="setActiveSkill('${s.id}')">Use</button>
        </div>
      </div>`).join('');
  }

  // Update active skill display
  const activeName = document.getElementById('active-skill-name');
  const chip = document.getElementById('active-skill-chip');
  const chipName = document.getElementById('active-skill-chip-name');
  const activeSkill = getSkillById(state.settings.activeSkillId);
  if (activeName) activeName.textContent = activeSkill ? activeSkill.name : 'None (general assistant)';
  if (chip) chip.style.display = activeSkill ? 'flex' : 'none';
  if (chipName) chipName.textContent = activeSkill ? activeSkill.name : '';
}

function getSkillById(id) {
  if (!id) return null;
  return [...(state.settings.skills||[]), ...BUILTIN_SKILLS].find(s => s.id === id);
}

function setActiveSkill(id) {
  state.settings.activeSkillId = id;
  window.tower.saveSettings(state.settings);
  renderSkillsList();
}

function clearActiveSkill() {
  state.settings.activeSkillId = null;
  window.tower.saveSettings(state.settings);
  renderSkillsList();
  // Update the skill pick button label
  const label = document.getElementById('btn-skill-pick-label');
  if (label) label.textContent = 'Skill';
  // Hide the active skill chip in the input footer
  const chip = document.getElementById('active-skill-chip');
  if (chip) chip.style.display = 'none';
  // Close skill popup if open
  const popup = document.getElementById('skill-popup');
  if (popup) popup.classList.add('hidden');
  document.getElementById('btn-skill-pick')?.classList.remove('active');
}

function openSkillEditor(id) {
  editingSkillId = id || null;
  const title = document.getElementById('skill-modal-title');
  const nameIn = document.getElementById('skill-name-input');
  const promptIn = document.getElementById('skill-prompt-input');
  if (id) {
    const s = (state.settings.skills||[]).find(x => x.id === id);
    if (s) { title.textContent = 'Edit Skill'; nameIn.value = s.name; promptIn.value = s.prompt; }
  } else {
    title.textContent = 'New Skill'; nameIn.value = ''; promptIn.value = '';
  }
  document.getElementById('skill-overlay').classList.remove('hidden');
  document.getElementById('skill-modal').classList.remove('hidden');
  nameIn.focus();
}

function closeSkillEditor() {
  document.getElementById('skill-overlay').classList.add('hidden');
  document.getElementById('skill-modal').classList.add('hidden');
}

function saveSkill() {
  const name = document.getElementById('skill-name-input').value.trim();
  const prompt = document.getElementById('skill-prompt-input').value.trim();
  if (!name || !prompt) { alert('Name and prompt are required.'); return; }
  if (!state.settings.skills) state.settings.skills = [];
  if (editingSkillId) {
    const idx = state.settings.skills.findIndex(s => s.id === editingSkillId);
    if (idx >= 0) state.settings.skills[idx] = { ...state.settings.skills[idx], name, prompt };
  } else {
    state.settings.skills.push({ id: genId(), name, prompt });
  }
  window.tower.saveSettings(state.settings);
  closeSkillEditor();
  renderSkillsList();
}

function deleteSkill(id) {
  if (!confirm('Delete this skill?')) return;
  state.settings.skills = (state.settings.skills||[]).filter(s => s.id !== id);
  if (state.settings.activeSkillId === id) state.settings.activeSkillId = null;
  window.tower.saveSettings(state.settings);
  renderSkillsList();
}

function getActiveSkillPrompt() {
  const skill = getSkillById(state.settings.activeSkillId);
  return skill ? skill.prompt : null;
}

// ── MEMORY SYSTEM ────────────────────────────
function renderMemoriesList() {
  const list = document.getElementById('memories-list');
  if (!list) return;
  const memories = state.settings.memories || [];
  const toggle = document.getElementById('s-memory-enabled');
  if (toggle) toggle.checked = !!state.settings.memoryEnabled;
  if (!memories.length) {
    list.innerHTML = '<div class="project-empty">No memories stored yet.</div>';
    return;
  }
  list.innerHTML = memories.map((m, i) => `
    <div class="memory-item">
      <span class="memory-text">${esc(m.text)}</span>
      <span class="memory-date">${m.date || ''}</span>
      <button class="skill-del-btn" onclick="deleteMemory(${i})">✕</button>
    </div>`).join('');
}

function deleteMemory(idx) {
  state.settings.memories.splice(idx, 1);
  window.tower.saveSettings(state.settings);
  renderMemoriesList();
}

function clearAllMemories() {
  if (!confirm('Clear all stored memories?')) return;
  state.settings.memories = [];
  window.tower.saveSettings(state.settings);
  renderMemoriesList();
}

async function generateMemoriesFromHistory() {
  if (!state.conversations.length) { alert('No conversations to extract memories from.'); return; }
  const status = document.querySelector('#sec-memory .sec-action-btn');
  if (status) { status.textContent = '⏳ Analyzing…'; status.disabled = true; }

  try {
    const recent = state.conversations.slice(0, 10);
    const convText = recent.map(c =>
      c.messages.slice(0, 6).map(m => `${m.role}: ${m.content.slice(0, 200)}`).join('\n')
    ).join('\n\n---\n\n');

    const prompt = `Extract 5-10 important facts about the user from these conversations. Focus on: preferences, technical setup, projects, goals, and personal details. Return ONLY a JSON array of strings, each being a single fact. Example: ["User runs Unraid server at 10.0.0.22", "User prefers TypeScript over JavaScript"]\n\nConversations:\n${convText.slice(0, 3000)}`;

    const res = await fetch(`${state.settings.ollamaUrl}/api/chat`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ model: state.settings.model, messages: [{role:'user', content:prompt}], stream: false })
    });
    const data = await res.json();
    const text = data.message?.content || '';

    const match = text.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('Could not parse memories from response');
    const facts = JSON.parse(match[0]);

    const date = new Date().toISOString().split('T')[0];
    const newMemories = facts.filter(f => typeof f === 'string' && f.trim()).map(f => ({ text: f.trim(), date, source: 'auto' }));

    if (!state.settings.memories) state.settings.memories = [];
    state.settings.memories = [...state.settings.memories, ...newMemories];
    window.tower.saveSettings(state.settings);
    renderMemoriesList();
    if (status) { status.textContent = `✓ Added ${newMemories.length} memories`; }
    setTimeout(() => { if (status) { status.textContent = '↺ Generate from chat history'; status.disabled = false; } }, 3000);
  } catch(err) {
    if (status) { status.textContent = `✗ Error: ${err.message}`; status.disabled = false; }
    console.error('Memory generation failed:', err);
  }
}

async function importMemoryFromText() {
  const text = document.getElementById('memory-import-text').value.trim();
  const status = document.getElementById('memory-import-status');
  if (!text) { status.textContent = 'Paste some text first.'; return; }
  status.textContent = '⏳ Extracting facts…';

  try {
    const prompt = `Extract important facts about the user from this memory text. Return ONLY a JSON array of strings, each being a single fact.\n\nText:\n${text.slice(0, 2000)}`;
    const res = await fetch(`${state.settings.ollamaUrl}/api/chat`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ model: state.settings.model, messages: [{role:'user', content:prompt}], stream: false })
    });
    const data = await res.json();
    const match = (data.message?.content||'').match(/\[[\s\S]*\]/);
    if (!match) throw new Error('Could not parse response');
    const facts = JSON.parse(match[0]);
    const date = new Date().toISOString().split('T')[0];
    if (!state.settings.memories) state.settings.memories = [];
    const newMems = facts.filter(f=>typeof f==='string'&&f.trim()).map(f=>({text:f.trim(),date,source:'import'}));
    state.settings.memories = [...state.settings.memories, ...newMems];
    window.tower.saveSettings(state.settings);
    document.getElementById('memory-import-text').value = '';
    renderMemoriesList();
    status.textContent = `✓ Imported ${newMems.length} memories`;
    status.style.color = '#4caf50';
  } catch(err) {
    status.textContent = `✗ ${err.message}`;
    status.style.color = '#ef4444';
  }
}

function getMemoryContext() {
  if (!state.settings.memoryEnabled) return '';
  const memories = state.settings.memories || [];
  if (!memories.length) return '';
  return `[Lumen's memory about this user]\n${memories.map(m => `- ${m.text}`).join('\n')}\n[End of memory]\n\n`;
}

// ── VOICE / TTS ──────────────────────────────
function populateVoicePicker() {
  const picker = document.getElementById('voice-picker');
  if (!picker || !window.speechSynthesis) return;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) { picker.innerHTML = '<div class="project-empty">No voices available on this system.</div>'; return; }

  const shown = voices.slice(0, 8);
  picker.innerHTML = `<div id="voice-picker-grid">${shown.map(v =>
    `<button class="voice-opt ${v.name === state.settings.voice ? 'active' : ''}" data-voice="${v.name}" onclick="setVoice('${v.name.replace(/'/g,"\\'")}')">
      ${v.name.split(' ').slice(0,2).join(' ')}
    </button>`
  ).join('')}</div>`;
}

function setVoice(name) {
  state.settings.voice = name;
  window.tower.saveSettings(state.settings);
  document.querySelectorAll('.voice-opt').forEach(b => b.classList.toggle('active', b.dataset.voice === name));
}

function testVoice() {
  speakText('Hello! I am Lumen, your personal AI assistant.');
}

function speakText(text) {
  if (!state.settings.voiceEnabled || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text.replace(/[#*`_]/g, '').slice(0, 500));
  const voices = window.speechSynthesis.getVoices();
  const chosen = voices.find(v => v.name === state.settings.voice);
  if (chosen) utterance.voice = chosen;
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  window.speechSynthesis.speak(utterance);
}

// ── EXPORT / IMPORT DATA ─────────────────────
async function exportData() {
  const data = {
    version: '1.0',
    exportDate: new Date().toISOString(),
    conversations: state.conversations,
    settings: state.settings,
    connectors: state.connectors,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lumen-backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importData(input) {
  const file = input.files[0];
  if (!file) return;
  const status = document.getElementById('import-status');
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.conversations || !data.settings) throw new Error('Invalid backup file format');
      if (!confirm(`Import ${data.conversations.length} conversations from ${data.exportDate?.split('T')[0] || 'unknown date'}? This will MERGE with existing data.`)) return;
      const existingIds = new Set(state.conversations.map(c => c.id));
      const newConvs = data.conversations.filter(c => !existingIds.has(c.id));
      state.conversations = [...state.conversations, ...newConvs];
      await save();
      renderSidebar();
      status.textContent = `✓ Imported ${newConvs.length} new conversations`;
      status.style.color = '#4caf50';
      setTimeout(() => status.textContent = '', 4000);
    } catch(err) {
      status.textContent = `✗ Import failed: ${err.message}`;
      status.style.color = '#ef4444';
    }
  };
  reader.readAsText(file);
  input.value = '';
}

// ── MOBILE CONTROL ──────────────────────────
async function testMobileWebhook() {
  const url = document.getElementById('s-mobile-webhook').value.trim();
  const status = document.getElementById('mobile-webhook-status');
  if (!url) { status.textContent = 'Enter a webhook URL first.'; return; }
  status.textContent = 'Testing…';
  try {
    const res = await fetch(url, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({test:true,source:'lumen'}) });
    status.textContent = `✓ Webhook responded with HTTP ${res.status}`;
    status.style.color = '#4caf50';
  } catch(err) {
    status.textContent = `✗ ${err.message}`;
    status.style.color = '#ef4444';
  }
}

async function mobileQuickAction(prompt) {
  const res = await fetchChat([{role:'user',content:prompt}], state.settings.model);
  alert(res.slice(0, 500));
}

// ── CHROME CONTROL ──────────────────────────
function chromeGo(url) {
  if (!url?.trim()) return;
  url = url.trim();
  if (!url.startsWith('http')) url = 'https://' + url;
  const wv = document.getElementById('webview-chrome');
  const overlay = document.getElementById('chrome-overlay');
  wv.src = url;
  overlay.classList.add('hidden');
  document.getElementById('chrome-url-input').value = url;
}

function initChrome() {
  const wv = document.getElementById('webview-chrome');
  const overlay = document.getElementById('chrome-overlay');
  if (!wv) return;
  wv.addEventListener('did-navigate', (e) => {
    document.getElementById('chrome-url-input').value = e.url;
  });
  wv.addEventListener('did-fail-load', () => overlay.classList.remove('hidden'));
  wv.addEventListener('did-finish-load', () => overlay.classList.add('hidden'));

  document.getElementById('chrome-go').addEventListener('click', () => {
    chromeGo(document.getElementById('chrome-url-input').value);
  });
  document.getElementById('chrome-reload').addEventListener('click', () => wv.reload());
  document.getElementById('chrome-url-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') chromeGo(document.getElementById('chrome-url-input').value);
  });

  const aiInput = document.getElementById('chrome-ai-input');
  const aiSend = document.getElementById('chrome-ai-send');
  const aiSendFn = async () => {
    const q = aiInput.value.trim();
    if (!q) return;
    aiInput.value = '';
    const msgs = document.getElementById('chrome-ai-messages');
    msgs.innerHTML += `<div class="chrome-ai-msg user">${esc(q)}</div>`;
    msgs.innerHTML += `<div class="chrome-ai-msg ai" id="chrome-thinking">⏳ Thinking…</div>`;
    msgs.scrollTop = msgs.scrollHeight;

    try {
      let pageContext = '';
      try { pageContext = `Current page: ${wv.getTitle()} (${document.getElementById('chrome-url-input').value})`; } catch{}

      const res = await fetchChat([
        { role: 'system', content: `You are a web browsing assistant. ${pageContext}. Help the user navigate, understand, and interact with web content. Give concise, actionable responses.` },
        { role: 'user', content: q }
      ], state.settings.model);

      document.getElementById('chrome-thinking').outerHTML = `<div class="chrome-ai-msg ai">${mdToHtml(res)}</div>`;
    } catch(err) {
      document.getElementById('chrome-thinking').outerHTML = `<div class="chrome-ai-msg ai">✗ ${err.message}</div>`;
    }
    msgs.scrollTop = msgs.scrollHeight;
  };
  aiSend.addEventListener('click', aiSendFn);
  aiInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); aiSendFn(); } });
}

// ── CHAT SEARCH ──────────────────────────────
function toggleChatSearch() {
  const bar = document.getElementById('chat-search-bar');
  const input = document.getElementById('chat-search-input');
  const hidden = bar.classList.toggle('hidden');
  if (!hidden) { input.focus(); input.select(); }
  else { input.value = ''; state.searchQuery = ''; renderSidebar(); }
}
function filterSidebar(query) {
  state.searchQuery = query.toLowerCase().trim();
  renderSidebar();
}

// ── NOTIFICATIONS ────────────────────────────
function notify(title, body) {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: '' });
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(p => {
      if (p === 'granted') new Notification(title, { body });
    });
  }
}
function testNotification() {
  Notification.requestPermission().then(p => {
    if (p === 'granted') notify('Lumen', 'Notifications are working!');
    else alert('Please allow notifications in your system settings for Lumen.');
  });
}

// ── FONT ─────────────────────────────────────
function applyFont(font) {
  const fonts = {
    default: 'Georgia, "Times New Roman", serif',
    sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    system: 'system-ui, sans-serif',
    dyslexic: '"OpenDyslexic", "Courier New", monospace',
  };
  document.getElementById('chat-messages').style.fontFamily = fonts[font] || fonts.default;
  state.settings.font = font;
  document.querySelectorAll('.font-opt').forEach(o => o.classList.toggle('active', o.dataset.font === font));
}

// ── PROFILE ──────────────────────────────────
function saveProfile() {
  state.settings.profile = {
    name: document.getElementById('s-display-name').value.trim() || 'Will',
    email: document.getElementById('s-email').value.trim(),
    nickname: document.getElementById('s-nickname').value.trim(),
    bio: document.getElementById('s-bio').value.trim(),
  };
  const ppn2 = document.getElementById('pp-name'); if(ppn2) ppn2.textContent = state.settings.profile.name;
  const ppe2 = document.getElementById('pp-email'); if(ppe2) ppe2.textContent = state.settings.profile.email;
  const ppa2 = document.getElementById('pp-avatar'); if(ppa2) ppa2.textContent = (state.settings.profile.name||'W')[0].toUpperCase();
  const pbn2 = document.getElementById('prof-name'); if(pbn2) pbn2.textContent = state.settings.profile.name;
  const pbe2 = document.getElementById('prof-email'); if(pbe2) pbe2.textContent = state.settings.profile.email;
  window.tower.saveSettings(state.settings);
  closeSettings();
}

// ── PROJECT INLINE INPUT ────────────────────────
function showNewProjectInput() {
  const row = document.getElementById('new-project-input-row');
  const input = document.getElementById('new-project-input');
  if (!row || !input) return;
  row.classList.remove('hidden');
  input.value = '';
  input.focus();
}
function hideNewProjectInput() {
  const row = document.getElementById('new-project-input-row');
  if (row) row.classList.add('hidden');
}
function confirmNewProject() {
  const input = document.getElementById('new-project-input');
  const name = input?.value?.trim();
  if (!name) { hideNewProjectInput(); return; }
  if (!state.projects) state.projects = [];
  state.projects.push({ id: genId(), name });
  saveProjects();
  renderProjects();
  hideNewProjectInput();
}

// ── SKILL POPUP ──────────────────────────────
function openSkillPopup() {
  const popup = document.getElementById('skill-popup');
  const list = document.getElementById('skill-popup-list');
  const btn = document.getElementById('btn-skill-pick');
  if (!popup || !list) return;

  const allSkills = [...(state.settings.skills||[]), ...BUILTIN_SKILLS];
  list.innerHTML = allSkills.length ? allSkills.map(s => `
    <button class="skill-pop-item ${s.id === state.settings.activeSkillId ? 'active' : ''}" onclick="setActiveSkillFromPopup('${s.id}')">
      <div>
        <div class="skill-pop-item-name">${esc(s.name)}</div>
        <span class="skill-pop-item-preview">${esc(s.prompt.slice(0, 60))}…</span>
      </div>
    </button>`).join('')
    : '<div style="padding:12px 14px;font-size:12px;color:var(--text-muted)">No skills yet — create one in Settings → Skills</div>';

  popup.classList.remove('hidden');
  btn?.classList.add('active');
}
function closeSkillPopup() {
  document.getElementById('skill-popup')?.classList.add('hidden');
  document.getElementById('btn-skill-pick')?.classList.remove('active');
}
function setActiveSkillFromPopup(id) {
  setActiveSkill(id);
  // Update skill pick button label
  const skill = getSkillById(id);
  const label = document.getElementById('btn-skill-pick-label');
  if (label) label.textContent = skill ? skill.name : 'Skill';
  closeSkillPopup();
}
// (clearActiveSkill is defined above with all label/popup logic merged in)

// ── FILE ATTACHMENT ──────────────────────────
let attachedFiles = []; // { name, type, dataUrl, text }

function openFileAttach() {
  document.getElementById('file-attach-input')?.click();
}

async function handleFileAttach(files) {
  for (const file of files) {
    if (attachedFiles.length >= 4) { alert('Max 4 attachments per message.'); break; }
    const isImage = file.type.startsWith('image/');
    const entry = { name: file.name, type: file.type, isImage };

    if (isImage) {
      entry.dataUrl = await readFileAsDataUrl(file);
    } else {
      entry.text = await readFileAsText(file);
      entry.dataUrl = null;
    }
    attachedFiles.push(entry);
  }
  renderAttachPreviews();
}

function readFileAsDataUrl(file) {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = e => resolve(e.target.result);
    r.readAsDataURL(file);
  });
}
function readFileAsText(file) {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = e => resolve(e.target.result);
    r.readAsText(file);
  });
}

function renderAttachPreviews() {
  const container = document.getElementById('attach-previews');
  if (!container) return;
  container.innerHTML = attachedFiles.map((f, i) => `
    <div class="attach-chip">
      ${f.isImage ? `<img src="${f.dataUrl}" alt="${esc(f.name)}"/>` : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`}
      <span class="attach-chip-name" title="${esc(f.name)}">${esc(f.name)}</span>
      <button class="attach-chip-remove" onclick="removeAttachment(${i})" title="Remove">✕</button>
    </div>`).join('');
}

function removeAttachment(i) {
  attachedFiles.splice(i, 1);
  renderAttachPreviews();
}

function getAttachmentContext() {
  if (!attachedFiles.length) return { text: '', images: [] };
  const textParts = attachedFiles.filter(f => !f.isImage).map(f =>
    `\n\n[Attached file: ${f.name}]\n\`\`\`\n${f.text?.slice(0, 8000)}\n\`\`\``
  );
  const images = attachedFiles.filter(f => f.isImage).map(f => f.dataUrl);
  return { text: textParts.join(''), images };
}

function clearAttachments() {
  attachedFiles = [];
  renderAttachPreviews();
}

// ── TEXT COLOR ───────────────────────────────
function applyTextColor(color) {
  const el = document.getElementById('chat-messages');
  const root = document.documentElement;
  if (!color || color === 'default') {
    root.style.removeProperty('--text-primary-override');
    document.body.style.removeProperty('--text-primary');
  } else {
    document.body.style.setProperty('--text-primary', color);
  }
  state.settings.textColorOverride = (color === 'default') ? null : color;
  document.querySelectorAll('.text-color-opt').forEach(o =>
    o.classList.toggle('active', o.dataset.textcolor === color ||
      (!color && o.dataset.textcolor === 'default'))
  );
}

function applyCustomTextColor() {
  const val = document.getElementById('s-text-color')?.value;
  if (val) applyTextColor(val);
}

function resetTextColor() {
  applyTextColor('default');
  const tc = document.getElementById('s-text-color');
  if (tc) tc.value = '#ececec';
}

// ── ACCENT COLOR ──────────────────────────────
function hexToRgb(hex) {
  const h = hex.replace('#','');
  return {
    r: parseInt(h.slice(0,2),16),
    g: parseInt(h.slice(2,4),16),
    b: parseInt(h.slice(4,6),16)
  };
}
function lightenHex(hex, amount) {
  let {r,g,b} = hexToRgb(hex);
  r = Math.min(255, Math.round(r + (255-r)*amount));
  g = Math.min(255, Math.round(g + (255-g)*amount));
  b = Math.min(255, Math.round(b + (255-b)*amount));
  return '#' + [r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');
}
function applyAccentColor(hex) {
  const root = document.documentElement.style;
  if (!hex || hex === 'default') {
    root.removeProperty('--accent');
    root.removeProperty('--accent-hover');
    root.removeProperty('--accent-dim');
    root.removeProperty('--accent-text');
    state.settings.accentColor = 'default';
  } else {
    const {r,g,b} = hexToRgb(hex);
    const lum = (0.299*r + 0.587*g + 0.114*b)/255;
    root.setProperty('--accent', hex);
    root.setProperty('--accent-hover', lightenHex(hex, 0.18));
    root.setProperty('--accent-dim', `rgba(${r},${g},${b},0.14)`);
    root.setProperty('--accent-text', lum > 0.55 ? '#111' : '#fff');
    state.settings.accentColor = hex;
  }
  document.querySelectorAll('.accent-color-opt').forEach(b =>
    b.classList.toggle('active', b.dataset.accentcolor === (hex || 'default'))
  );
}
function applyCustomAccentColor() {
  const val = document.getElementById('s-accent-color')?.value;
  if (val) applyAccentColor(val);
}
function resetAccentColor() {
  applyAccentColor('default');
  const inp = document.getElementById('s-accent-color');
  if (inp) inp.value = '#2d8cf0';
}

// ── EVENTS ────────────────────────────────────
function bindEvents() {
  // Titlebar
  document.getElementById('btn-minimize').addEventListener('click', window.tower.minimize);
  document.getElementById('btn-maximize').addEventListener('click', window.tower.maximize);
  document.getElementById('btn-close').addEventListener('click',    window.tower.close);

  // Top tabs
  document.querySelectorAll('.top-tab').forEach(b => b.addEventListener('click', () => switchMode(b.dataset.mode)));

  // Code sub-tabs
  document.querySelectorAll('.code-tab').forEach(b => b.addEventListener('click', () => switchCodeTab(b.dataset.codetab)));

  // New chat
  document.getElementById('btn-new-chat').addEventListener('click', newConversation);

  // Search chats
  document.getElementById('btn-search-chats').addEventListener('click', toggleChatSearch);
  document.getElementById('chat-search-input').addEventListener('input', e => filterSidebar(e.target.value));
  document.getElementById('chat-search-input').addEventListener('keydown', e => { if (e.key === 'Escape') toggleChatSearch(); });

  // New project button
  document.getElementById('btn-new-project').addEventListener('click', newProject);

  // Chat input
  const chatIn = document.getElementById('chat-input');
  chatIn.addEventListener('keydown', e => { if (e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendChat();} });
  chatIn.addEventListener('input', () => { chatIn.style.height='auto'; chatIn.style.height=Math.min(chatIn.scrollHeight,200)+'px'; });
  document.getElementById('btn-send').addEventListener('click', sendChat);

  // Suggestion chips
  document.querySelectorAll('.suggestion-chip').forEach(chip => {
    chip.addEventListener('click', () => { chatIn.value = chip.dataset.prompt; chatIn.focus(); });
  });

  // Vault modal search — Enter key
  const vaultIn = document.getElementById('vault-search-input');
  if (vaultIn) vaultIn.addEventListener('keydown', e => { if (e.key==='Enter') searchVault(); });

  // Code task input
  const codeIn = document.getElementById('code-task-input');
  codeIn.addEventListener('keydown', e => { if (e.key==='Enter'&&!e.shiftKey){e.preventDefault();runCodeTask();} });
  codeIn.addEventListener('input', () => { codeIn.style.height='auto'; codeIn.style.height=Math.min(codeIn.scrollHeight,100)+'px'; });
  document.getElementById('code-task-send').addEventListener('click', runCodeTask);

  // Terminal
  const termIn = document.getElementById('terminal-input');
  termIn.addEventListener('keydown', e => {
    if (e.key==='Enter') { runTerminalCmd(termIn.value); }
    else if (e.key==='ArrowUp') {
      e.preventDefault();
      state.termHistoryIdx = Math.min(state.termHistoryIdx+1, state.termHistory.length-1);
      if (state.termHistory[state.termHistoryIdx]) termIn.value = state.termHistory[state.termHistoryIdx];
    } else if (e.key==='ArrowDown') {
      e.preventDefault();
      state.termHistoryIdx = Math.max(state.termHistoryIdx-1, -1);
      termIn.value = state.termHistoryIdx>=0 ? state.termHistory[state.termHistoryIdx] : '';
    }
  });
  document.getElementById('terminal-send').addEventListener('click', () => runTerminalCmd(termIn.value));

  // Theme swatches
  document.querySelectorAll('.swatch').forEach(s => s.addEventListener('click', () => applyTheme(s.dataset.theme)));

  // Stop button — abort current streaming generation
  document.getElementById('btn-stop').addEventListener('click', () => {
    if (state.streamController) {
      state.stopRequested = true;
      state.streamController.abort();
    }
  });

  // Profile button — toggle profile popup
  document.getElementById('btn-profile').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('profile-popup').classList.toggle('hidden');
  });

  // Settings nav profile footer — close settings and open profile popup
  document.getElementById('snav-profile-btn').addEventListener('click', () => {
    closeSettings();
    setTimeout(() => document.getElementById('profile-popup').classList.remove('hidden'), 150);
  });
  // Close profile popup when clicking outside
  document.addEventListener('click', () => {
    const pp = document.getElementById('profile-popup');
    if (pp) pp.classList.add('hidden');
  });
  // Profile popup items
  document.querySelectorAll('.pp-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('profile-popup').classList.add('hidden');
      openSettings(btn.dataset.sec);
    });
  });

  document.getElementById('settings-close').addEventListener('click', closeSettings);
  document.getElementById('btn-save-settings').addEventListener('click', saveSettings);
  document.getElementById('btn-fetch-models').addEventListener('click', fetchModels);
  document.getElementById('s-fontsize').addEventListener('input', e => {
    document.getElementById('s-fontsize-label').textContent = e.target.value+'px';
  });
  document.getElementById('btn-clear-history').addEventListener('click', () => {
    if (confirm('Delete all conversations? This cannot be undone.')) {
      state.conversations=[]; state.currentId=null; renderSidebar(); showChatWelcome(); save();
    }
  });
  document.getElementById('model-select').addEventListener('change', e => {
    const c = getConv(state.currentId); if(c){c.model=e.target.value;save();}
  });

  // Settings navigation
  document.querySelectorAll('.snav-item').forEach(b => {
    b.addEventListener('click', () => switchSettingsSection(b.dataset.sec));
  });

  // Theme options in Appearance section
  document.querySelectorAll('.theme-opt').forEach(b => {
    b.addEventListener('click', () => {
      applyTheme(b.dataset.theme);
      document.querySelectorAll('.theme-opt').forEach(o => o.classList.toggle('active', o.dataset.theme === b.dataset.theme));
      window.tower.saveSettings(state.settings);
    });
  });

  // Font picker handlers
  document.querySelectorAll('.font-opt').forEach(b => {
    b.addEventListener('click', () => {
      applyFont(b.dataset.font);
      window.tower.saveSettings(state.settings);
    });
  });

  // Close settings on Escape key
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (!document.getElementById('settings-panel').classList.contains('hidden')) closeSettings();
      const pp = document.getElementById('profile-popup'); if (pp) pp.classList.add('hidden');
    }
  });

  // ── Connector modal ──
  let currentModalConnector = null;

  function openConnectorModal(key) {
    currentModalConnector = key;
    document.querySelectorAll('.connector-cfg').forEach(el => el.classList.add('hidden'));
    const cfg = document.getElementById(`cfg-${key}`);
    if (cfg) cfg.classList.remove('hidden');
    const name = document.querySelector(`.connector-card[data-connector="${key}"] .connector-name`)?.textContent || key;
    document.getElementById('cmodal-title').textContent = `Configure ${name}`;
    loadConnectorValues(key);
    document.getElementById('connector-modal').classList.remove('hidden');
  }

  function closeConnectorModal() {
    document.getElementById('connector-modal').classList.add('hidden');
    currentModalConnector = null;
  }

  function loadConnectorValues(key) {
    const c = state.connectors[key] || {};
    const set = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
    switch(key) {
      case 'github':        set('github-token', c.token); break;
      case 'telegram':      set('telegram-token', c.token); set('telegram-chatid', c.chatId); break;
      case 'n8n':           set('n8n-url', c.url); break;
      case 'flowise':       set('flowise-url', c.url); break;
      case 'obsidian':      set('obsidian-url', c.url); set('obsidian-key', c.key); set('obsidian-folder', c.folder); break;
      case 'skyvern':       set('skyvern-url', c.url); set('skyvern-key', c.key); break;
      case 'openhands':     set('openhands-conn-url', c.url); break;
      case 'homeassistant': set('homeassistant-url', c.url); set('homeassistant-token', c.token); break;
      case 'netdata':       set('netdata-url', c.url); break;
    }
  }

  // Gear buttons → open modal
  document.querySelectorAll('.connector-settings-btn').forEach(btn => {
    btn.addEventListener('click', () => openConnectorModal(btn.dataset.for));
  });

  // Connect buttons → test connection (or open modal for Gmail OAuth)
  document.querySelectorAll('.connector-connect-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const key = btn.dataset.for;
      if (key === 'gmail') { openConnectorModal('gmail'); }
      else { await testConnector(key); }
    });
  });

  // Modal close / cancel / backdrop
  document.getElementById('cmodal-close')?.addEventListener('click', closeConnectorModal);
  document.getElementById('cmodal-cancel')?.addEventListener('click', closeConnectorModal);
  document.querySelector('.cmodal-backdrop')?.addEventListener('click', closeConnectorModal);

  // Modal Save & Test
  document.getElementById('cmodal-save')?.addEventListener('click', async () => {
    if (currentModalConnector && currentModalConnector !== 'gmail') {
      await testConnector(currentModalConnector);
    }
  });

  // Test buttons inside modal
  document.querySelectorAll('.test-btn').forEach(btn => {
    btn.addEventListener('click', () => testConnector(btn.dataset.test));
  });

  // Settings topbar window controls
  document.getElementById('s-btn-minimize')?.addEventListener('click', window.tower.minimize);
  document.getElementById('s-btn-maximize')?.addEventListener('click', window.tower.maximize);
  document.getElementById('s-btn-close')?.addEventListener('click', window.tower.close);

  // Google OAuth — Connect button (inside modal)
  document.getElementById('btn-connect-google')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-connect-google');
    const status = document.getElementById('google-connect-status');
    btn.disabled = true;
    btn.textContent = 'Opening browser…';
    if (status) status.textContent = 'A Google sign-in page is opening in your browser. Complete it there, then come back.';
    try {
      await window.tower.connectGoogle();
      // Success handled by onGoogleConnected event
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Connect with Google';
      if (status) status.textContent = '❌ Error: ' + e.message;
    }
  });

  // Listen for google-error event from main process
  window.tower.onGoogleError?.((err) => {
    const btn = document.getElementById('btn-connect-google');
    const status = document.getElementById('google-connect-status');
    if (btn) { btn.disabled = false; btn.textContent = 'Connect with Google'; }
    if (status) status.textContent = '❌ Error: ' + err;
  });

  window.tower.onGoogleConnected(() => {
    const btn = document.getElementById('btn-connect-google');
    const status = document.getElementById('google-connect-status');
    const pill = document.querySelector('.connector-status-pill[data-for="gmail"]');
    if (btn) { btn.textContent = '✓ Connected'; btn.disabled = true; }
    if (status) status.textContent = 'Google account connected successfully.';
    if (pill) { pill.textContent = 'Connected'; pill.className = 'connector-status-pill connected'; }
    const card = document.querySelector('.connector-card[data-connector="gmail"]');
    if (card) card.classList.add('connected');
    closeConnectorModal();
  });

  // Skill overlay click handler
  document.getElementById('skill-overlay').addEventListener('click', closeSkillEditor);

  // Voice loading
  if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = populateVoicePicker;
  }

  // ── NEW PROJECT inline input ──
  document.getElementById('btn-new-project').addEventListener('click', showNewProjectInput);
  document.getElementById('new-project-confirm').addEventListener('click', confirmNewProject);
  document.getElementById('new-project-cancel').addEventListener('click', hideNewProjectInput);
  document.getElementById('new-project-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') confirmNewProject();
    if (e.key === 'Escape') hideNewProjectInput();
  });

  // ── SKILL POPUP ──
  document.getElementById('btn-skill-pick').addEventListener('click', (e) => {
    e.stopPropagation();
    const popup = document.getElementById('skill-popup');
    if (popup.classList.contains('hidden')) openSkillPopup();
    else closeSkillPopup();
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#skill-popup') && !e.target.closest('#btn-skill-pick')) {
      closeSkillPopup();
    }
  });

  // ── FILE ATTACHMENT ──
  document.getElementById('btn-attach').addEventListener('click', openFileAttach);
  document.getElementById('file-attach-input').addEventListener('change', e => {
    if (e.target.files.length) handleFileAttach(Array.from(e.target.files));
    e.target.value = ''; // reset so same file can be re-selected
  });

  // ── TEXT COLOR PRESETS ──
  document.querySelectorAll('.text-color-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      applyTextColor(btn.dataset.textcolor);
      window.tower.saveSettings(state.settings);
    });
  });
  document.querySelectorAll('.accent-color-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      applyAccentColor(btn.dataset.accentcolor);
      window.tower.saveSettings(state.settings);
    });
  });
}

// ── BOOT ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
