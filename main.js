const { app, BrowserWindow, BrowserView, ipcMain, nativeTheme, shell } = require('electron');
const path = require('path');
const fs = require('fs');                          // sync fs — used by readJSON/writeJSON
const { exec, spawn } = require('child_process');
const { google } = require('googleapis');
const { WebSocketServer } = require('ws');         // Phase 5: browser extension bridge
const cron = require('node-cron');                 // Scheduled task execution
 
let mainWindow;
let driverView = null;
let driverViewAttached = false;
let codeView = null;
let codeViewAttached = false;
const userDataPath = app.getPath('userData');
const conversationsFile = path.join(userDataPath, 'conversations.json');
const settingsFile      = path.join(userDataPath, 'settings.json');
const connectorsFile    = path.join(userDataPath, 'connectors.json');
const TOKEN_PATH        = path.join(userDataPath, 'google_token.json');
const mobileConversationsFile = path.join(userDataPath, 'mobile-conversations.json');

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}
 
// OAuth credentials — loaded from oauth.config.json (gitignored, never committed)
// Copy oauth.config.example.json → oauth.config.json and fill in your credentials.
let OAUTH_CONFIG = {
  google: {
    clientId: '',
    clientSecret: '',
    scopes: [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/calendar.readonly'
    ]
  }
};
try {
  const cfgPath = path.join(__dirname, 'oauth.config.json');
  const loaded = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  if (loaded.google) OAUTH_CONFIG.google = { ...OAUTH_CONFIG.google, ...loaded.google };
} catch {
  // oauth.config.json not present — Google OAuth will be disabled until configured
}
 
// ── Google OAuth helpers ──
const OAUTH_PORT = 9741;
 
async function connectGoogle(mainWin) {
  const http = require('http');
  const redirectUri = `http://localhost:${OAUTH_PORT}`;
 
  const oAuth2Client = new google.auth.OAuth2(
    OAUTH_CONFIG.google.clientId,
    OAUTH_CONFIG.google.clientSecret,
    redirectUri
  );
 
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: OAUTH_CONFIG.google.scopes,
    prompt: 'consent',
  });
 
  return new Promise((resolve, reject) => {
    let server;
    const cleanup = () => { try { server.close(); } catch {} };
 
    server = require('http').createServer(async (req, res) => {
      try {
        const code = new URL(req.url, redirectUri).searchParams.get('code');
        if (!code) { res.end('Missing code'); return; }
 
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0f0f0f;color:#fff">
          <div style="text-align:center"><div style="font-size:48px">✅</div><h2>Connected to Google!</h2><p style="color:#888">You can close this tab and return to Lumen.</p></div>
        </body></html>`);
 
        cleanup();
        const { tokens } = await oAuth2Client.getToken(code);
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
        mainWin.webContents.send('google-connected', true);
        resolve();
      } catch (e) {
        cleanup();
        mainWin.webContents.send('google-error', e.message);
        reject(e);
      }
    });
 
    server.on('error', (e) => reject(new Error(`Port ${OAUTH_PORT} busy: ${e.message}`)));
    server.listen(OAUTH_PORT, 'localhost', () => {
      shell.openExternal(authUrl);
    });
 
    setTimeout(() => { cleanup(); reject(new Error('Google auth timed out.')); }, 300000);
  });
}
 
function createWindow() {
  // Apply saved color mode before window is visible to prevent flash of wrong theme.
  // nativeTheme controls titlebars + system chrome so they match the app theme.
  const savedSettings = readJSON(settingsFile, {});
  const savedColorMode = savedSettings.colorMode ?? 'dark';
  nativeTheme.themeSource = savedColorMode === 'light' ? 'light' : 'dark';

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1000,
    minHeight: 640,
    frame: false,
    show: false,  // reveal only after content loads — prevents flash of wrong theme
    backgroundColor: savedColorMode === 'light' ? '#ffffff' : '#0f0f0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      webSecurity: false,
    },
  });
 
  const IS_V2 = process.env.LUMEN_V2 === 'true';
  const IS_DEV = !app.isPackaged;
 
  if (IS_V2 && IS_DEV) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else if (IS_V2) {
    mainWindow.loadFile(path.join(__dirname, 'lumen-pwa', 'dist', 'index.html'));
  } else {
    mainWindow.loadFile(path.join(__dirname, 'lumen-pwa', 'dist', 'index.html'));
  }
 
  // Show the window once the renderer has finished its first paint.
  // Combined with show:false above, this eliminates the flash of default/wrong theme.
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}
 
// =============================================================================
// PHASE 5: WebSocket server — Chrome extension bridge
// The Lumen Browser extension connects here. Claude sends browser commands
// through this socket to control the user's real Chrome browser.
// =============================================================================
 
const LUMEN_BROWSER_PORT = 7745
let browserExtensionSocket = null
const pendingBrowserCommands = new Map()
 
const browserWSS = new WebSocketServer({ port: LUMEN_BROWSER_PORT })
 
browserWSS.on('listening', () => {
  console.log(`[Lumen] Browser WebSocket server listening on ws://localhost:${LUMEN_BROWSER_PORT}`)
})
 
browserWSS.on('connection', (socket) => {
  console.log('[Lumen] Browser extension connected')
  browserExtensionSocket = socket
  // Notify renderer so StatusWidget can update live
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('browser:connected')
  }

  socket.on('message', (data) => {
    let message
    try { message = JSON.parse(data.toString()) } catch { return }

    if (message.type === 'hello') {
      console.log('[Lumen] Extension identified:', message.source)
      return
    }

    const { id, success, result, error } = message
    const pending = pendingBrowserCommands.get(id)
    if (pending) {
      pendingBrowserCommands.delete(id)
      if (success) {
        pending.resolve(result)
      } else {
        pending.reject(new Error(error ?? 'Browser command failed'))
      }
    }
  })

  socket.on('close', () => {
    console.log('[Lumen] Browser extension disconnected')
    browserExtensionSocket = null
    for (const [id, pending] of pendingBrowserCommands) {
      pending.reject(new Error('Browser extension disconnected'))
      pendingBrowserCommands.delete(id)
    }
    // Notify renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('browser:disconnected')
    }
  })

  socket.on('error', (err) => {
    console.error('[Lumen] Browser socket error:', err.message)
  })
})
 
browserWSS.on('error', (err) => {
  console.error('[Lumen] Browser WebSocket server error:', err.message)
})
 
function executeBrowserCommand(command, payload = {}, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    if (!browserExtensionSocket || browserExtensionSocket.readyState !== 1) {
      return reject(new Error(
        'Browser extension not connected. Install the Lumen Browser extension in Chrome and make sure Lumen is running.'
      ))
    }
 
    const id = require('crypto').randomUUID()
 
    const timer = setTimeout(() => {
      pendingBrowserCommands.delete(id)
      reject(new Error(`Browser command timed out after ${timeoutMs / 1000}s: ${command}`))
    }, timeoutMs)
 
    pendingBrowserCommands.set(id, {
      resolve: (result) => { clearTimeout(timer); resolve(result) },
      reject: (err) => { clearTimeout(timer); reject(err) },
    })
 
    browserExtensionSocket.send(JSON.stringify({ id, command, payload }))
  })
}
 
// =============================================================================
// PHASE 4 + 5: Claude tool definitions
// These are sent on every Claude API call. Claude decides when to use them.
// =============================================================================
 
const CLAUDE_TOOLS = [
  // ── File system tools (Phase 4) ────────────────────────────────────────────
  {
    name: 'read_file',
    description:
      'Read the contents of a file from the filesystem and return them as text. ' +
      'Use this when the user asks you to look at a file, summarize a file, ' +
      'or when you need to inspect file contents before doing anything else.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'The absolute path to the file. On Windows use forward slashes ' +
            'or escaped backslashes. Example: C:/Users/will/notes.txt',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description:
      'Write text content to a file. Creates the file if it does not exist; ' +
      'overwrites it if it does. Use this when the user explicitly asks you to ' +
      'save, create, or update a file on disk.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The absolute path to write the file to.',
        },
        content: {
          type: 'string',
          description: 'The full text content to write.',
        },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'list_dir',
    description:
      'List the files and subdirectories inside a directory. Returns each entry ' +
      "prefixed with FILE or DIR. Use this when the user asks what's in a folder " +
      'or when you need to explore a directory structure.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The absolute path of the directory to list.',
        },
      },
      required: ['path'],
    },
  },
 
  // ── Browser tools (Phase 5) ────────────────────────────────────────────────
  {
    name: 'browser_navigate',
    description:
      "Navigate the user's Chrome browser to a URL. The Lumen Browser extension must be installed. " +
      "This uses the user's REAL Chrome — their existing logged-in sessions, cookies, and tabs. " +
      'Use this to open websites, do Google searches, access web apps the user is already logged into. ' +
      'After navigating, use browser_get_content to read the page, or browser_screenshot to see it.',
    input_schema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Full URL including https://. For searches: https://www.google.com/search?q=your+query',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'browser_get_content',
    description:
      'Read the visible text content of the current browser page. Returns the page URL, title, ' +
      'and cleaned text (up to 50,000 characters). Use after browser_navigate to read search results, ' +
      'articles, or any web page. Strips scripts, styles, and hidden elements.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'browser_screenshot',
    description:
      'Take a screenshot of the current browser tab and return it as an image. ' +
      'Use this when you need to SEE the page visually — to understand layout, find buttons, ' +
      "verify something rendered correctly, or when text extraction isn't enough. " +
      'Claude can analyze the screenshot and describe what it sees.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'browser_click',
    description:
      'Click an element on the current browser page. Provide a CSS selector OR the visible text ' +
      'of the element. For links and buttons, visible text is usually easier. ' +
      'For form elements, use a CSS selector like "button[type=submit]" or "#search-button".',
    input_schema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector of the element to click (e.g. "button.submit", "#login-btn")',
        },
        text: {
          type: 'string',
          description: 'Visible text of the element to click (e.g. "Sign In", "Search", "Next")',
        },
      },
    },
  },
  {
    name: 'browser_type',
    description:
      'Type text into an input field on the current page. Works with React, Vue, and plain HTML forms. ' +
      'Clears the field first, then types the text character by character to trigger all events. ' +
      'Set submit: true to press Enter and submit after typing.',
    input_schema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector of the input to type into (e.g. "input[name=q]", "#search", "textarea")',
        },
        text: {
          type: 'string',
          description: 'The text to type',
        },
        submit: {
          type: 'boolean',
          description: 'If true, press Enter after typing (default: false)',
        },
      },
      required: ['selector', 'text'],
    },
  },

  // ── Code Mode tools (Phase 6) ──────────────────────────────────────────────
  {
    name: 'execute_bash',
    description: 'Execute a shell command and return stdout/stderr. Use for running scripts, git commands, npm, checking system state. Avoid commands needing interactive input.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command to run.' },
        working_dir: { type: 'string', description: 'Directory to run in. Defaults to process cwd.' },
        timeout_ms: { type: 'number', description: 'Timeout in ms. Default 30000, max 120000.' },
      },
      required: ['command'],
    },
  },
  {
    name: 'grep_files',
    description: 'Search files for a regex pattern. Returns matching lines with file:line context. Use to find where things are defined or used across a codebase.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regex pattern to search for.' },
        path: { type: 'string', description: 'Directory or file to search. Defaults to cwd.' },
        glob_pattern: { type: 'string', description: 'File filter e.g. "*.ts" or "src/**/*.tsx".' },
        case_sensitive: { type: 'boolean', description: 'Default false.' },
        max_results: { type: 'number', description: 'Max matching lines to return. Default 100.' },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'git_status',
    description: 'Get git branch, modified files, and recent commit history for a repository.',
    input_schema: {
      type: 'object',
      properties: {
        working_dir: { type: 'string', description: 'Path to git repo root. Defaults to cwd.' },
      },
      required: [],
    },
  },
  {
    name: 'git_diff',
    description: 'Show uncommitted changes in a git repo as a diff.',
    input_schema: {
      type: 'object',
      properties: {
        working_dir: { type: 'string', description: 'Path to git repo root.' },
        staged: { type: 'boolean', description: 'Show staged changes. Default false.' },
        file: { type: 'string', description: 'Limit diff to a specific file.' },
      },
      required: [],
    },
  },
  {
    name: 'list_processes',
    description: 'List running system processes, optionally filtered by a search term.',
    input_schema: {
      type: 'object',
      properties: {
        grep_pattern: { type: 'string', description: 'Filter processes by this string.' },
      },
      required: [],
    },
  },
]
 
// =============================================================================
// PHASE 4 + 5: Tool executor
// Runs entirely in main process — no IPC round-trips needed.
// Returns { success, result, imageBase64?, imageDataUrl? }
// imageBase64/imageDataUrl only set for browser_screenshot.
// =============================================================================
 
async function executeTool(name, input) {
  try {
    switch (name) {
 
      // ── File system tools ──────────────────────────────────────────────────
      case 'read_file': {
        if (!isPathAllowed(input.path)) {
          return { success: false, result: `Access denied: path is outside the active project folder (${activeRootPath})` }
        }
        const content = await fs.promises.readFile(input.path, 'utf8')
        return { success: true, result: content }
      }

      case 'write_file': {
        if (!isPathAllowed(input.path)) {
          return { success: false, result: `Access denied: path is outside the active project folder (${activeRootPath})` }
        }
        let oldContent = null
        try { oldContent = await fs.promises.readFile(input.path, 'utf8') } catch { /* new file */ }
        await fs.promises.writeFile(input.path, input.content, 'utf8')
        return {
          success: true,
          result: `Wrote ${input.content.length} characters to ${input.path}`,
          oldContent,
          newContent: input.content,
        }
      }

      case 'list_dir': {
        if (!isPathAllowed(input.path)) {
          return { success: false, result: `Access denied: path is outside the active project folder (${activeRootPath})` }
        }
        const entries = await fs.promises.readdir(input.path, { withFileTypes: true })
        if (entries.length === 0) return { success: true, result: '(empty directory)' }
        const lines = entries.map((e) => `${e.isDirectory() ? 'DIR  ' : 'FILE'} ${e.name}`)
        return { success: true, result: lines.join('\n') }
      }
 
      // ── Browser tools ──────────────────────────────────────────────────────
      case 'browser_navigate': {
        const result = await executeBrowserCommand('navigate', { url: input.url })
        return {
          success: true,
          result: `Navigated to: ${result.title}\nURL: ${result.url}`,
        }
      }
 
      case 'browser_get_content': {
        const result = await executeBrowserCommand('get_content', {})
        const { url, title, text } = result
        return {
          success: true,
          result: `Page: ${title}\nURL: ${url}\n\n${text}`,
        }
      }
 
      case 'browser_screenshot': {
        const result = await executeBrowserCommand('screenshot', {})
        return {
          success: true,
          result: 'Screenshot taken',
          imageBase64: result.base64,     // raw base64 PNG — sent to Claude as vision block
          imageDataUrl: result.dataUrl,   // full data URL — displayed in tool card UI
        }
      }
 
      case 'browser_click': {
        const result = await executeBrowserCommand('click', {
          selector: input.selector ?? null,
          text: input.text ?? null,
        })
        return { success: true, result }
      }
 
      case 'browser_type': {
        const result = await executeBrowserCommand('type', {
          selector: input.selector,
          text: input.text,
          submit: input.submit ?? false,
        })
        return { success: true, result }
      }
 
      // ── Code Mode tools (Phase 6) ──────────────────────────────────────────

      case 'execute_bash': {
        const { command, working_dir, timeout_ms = 30000 } = input
        const BLOCKED = [/rm\s+-rf\s+\//, /mkfs/, /dd\s+if=.*of=\/dev/]
        if (BLOCKED.some((rx) => rx.test(command))) {
          return { success: false, result: 'Command blocked by safety filter.' }
        }
        const result = await new Promise((resolve) => {
          exec(command, {
            cwd: working_dir || process.cwd(),
            timeout: Math.min(timeout_ms, 120000),
            maxBuffer: 1024 * 1024 * 5,
            shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/bash',
          }, (error, stdout, stderr) => {
            const out = [stdout, stderr].filter(Boolean).join('\n').trim()
            resolve({
              success: !error || error.killed === false,
              result: out || (error ? error.message : '(no output)'),
            })
          })
        })
        return result
      }

      case 'grep_files': {
        const { pattern, path: searchPath = '.', glob_pattern, case_sensitive = false, max_results = 100 } = input
        const { execSync } = require('child_process')
        try {
          let hasRg = false
          try { execSync(process.platform === 'win32' ? 'where rg' : 'which rg', { stdio: 'ignore' }); hasRg = true } catch { /* no rg */ }
          let cmd
          if (hasRg) {
            cmd = `rg --line-number --no-heading --color=never ${case_sensitive ? '' : '--ignore-case'} ${glob_pattern ? `--glob "${glob_pattern}"` : ''} "${pattern}" "${searchPath}"`
          } else {
            cmd = `grep -rn ${case_sensitive ? '' : '-i'} ${glob_pattern ? `--include="${glob_pattern}"` : ''} "${pattern}" "${searchPath}"`
          }
          const output = execSync(cmd, { maxBuffer: 1024 * 1024 * 2, encoding: 'utf8' }).trim()
          const matches = output ? output.split('\n').slice(0, max_results) : []
          return { success: true, result: matches.join('\n') || 'No matches found.' }
        } catch (err) {
          if (err.status === 1) return { success: true, result: 'No matches found.' }
          return { success: false, result: err.message }
        }
      }

      case 'git_status': {
        const { working_dir } = input
        const { execSync } = require('child_process')
        const cwd = working_dir || process.cwd()
        try {
          const branch = execSync('git branch --show-current', { cwd, encoding: 'utf8' }).trim()
          const status = execSync('git status --porcelain -b', { cwd, encoding: 'utf8' }).trim()
          const log = execSync('git log --oneline -10', { cwd, encoding: 'utf8' }).trim()
          return { success: true, result: `Branch: ${branch}\n\n${status}\n\nRecent commits:\n${log}` }
        } catch (err) {
          return { success: false, result: err.message }
        }
      }

      case 'git_diff': {
        const { working_dir, staged = false, file } = input
        const { execSync } = require('child_process')
        const cwd = working_dir || process.cwd()
        try {
          const cmd = `git diff ${staged ? '--staged' : ''} ${file ? `-- "${file}"` : ''}`
          const diff = execSync(cmd, { cwd, encoding: 'utf8', maxBuffer: 1024 * 1024 * 5 })
          return { success: true, result: diff.trim() || 'No changes.' }
        } catch (err) {
          return { success: false, result: err.message }
        }
      }

      case 'list_processes': {
        const { grep_pattern } = input
        const { execSync } = require('child_process')
        try {
          const cmd = process.platform === 'win32'
            ? `tasklist${grep_pattern ? ` | findstr /i "${grep_pattern}"` : ''}`
            : `ps aux${grep_pattern ? ` | grep -i "${grep_pattern}" | grep -v grep` : ''}`
          const output = execSync(cmd, { encoding: 'utf8', maxBuffer: 1024 * 1024 }).trim()
          return { success: true, result: output || 'No processes found.' }
        } catch (err) {
          return { success: false, result: err.message }
        }
      }

      default:
        return { success: false, result: `Unknown tool: ${name}` }
    }
  } catch (err) {
    return { success: false, result: `Error: ${err.message}` }
  }
}
 
// =============================================================================
// PHASE 4: Claude streaming handler — agent loop
// This replaces the simple Phase 3 handler. The key difference:
// instead of one fetch → one response, this is a while loop that
// keeps calling the API until Claude stops requesting tool use.
// =============================================================================
 
// =============================================================================
// Core Claude streaming engine — shared by Desktop (IPC) and Mobile (SSE)
// Accepts callback functions so it works in both environments.
// =============================================================================

async function streamClaude({
  messages,
  model,
  apiKey,
  systemPrompt,
  signal,
  onChunk,        // (text) => void
  onToolStart,    // ({ toolId, toolName }) => void
  onToolResult,   // ({ toolId, toolName, input, result, success, imageDataUrl, oldContent, newContent }) => void
  onDone,         // ({ usage }) => void
  onError,        // (message) => void
}) {
  try {
    let conversationMessages = [...messages]

    while (true) {
      if (signal?.aborted) { onDone({ usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }); return }

      const systemParam = systemPrompt
        ? [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }]
        : undefined

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'prompt-caching-2024-07-31',
          accept: 'text/event-stream',
        },
        body: JSON.stringify({
          model,
          messages: conversationMessages,
          max_tokens: 4096,
          stream: true,
          tools: CLAUDE_TOOLS,
          ...(systemParam ? { system: systemParam } : {}),
        }),
        signal,
      })

      if (!response.ok) {
        const errorText = await response.text()
        onError(`Claude API ${response.status}: ${errorText}`)
        return
      }
      if (!response.body) { onError('No response body'); return }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      const contentBlocks = new Map()
      let stopReason = null
      let assistantTextAccumulated = ''
      let apiUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }

      streamLoop: while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || trimmed.startsWith('event:')) continue
          if (trimmed === 'data: [DONE]') continue
          if (!trimmed.startsWith('data: ')) continue

          let data
          try { data = JSON.parse(trimmed.slice(6)) } catch { continue }

          switch (data.type) {
            case 'message_start': {
              const u = data.message?.usage ?? {}
              apiUsage.input      += u.input_tokens                ?? 0
              apiUsage.cacheRead  += u.cache_read_input_tokens     ?? 0
              apiUsage.cacheWrite += u.cache_creation_input_tokens ?? 0
              break
            }
            case 'content_block_start': {
              const block = data.content_block
              if (block.type === 'text') {
                contentBlocks.set(data.index, { type: 'text', text: '' })
              } else if (block.type === 'tool_use') {
                contentBlocks.set(data.index, { type: 'tool_use', id: block.id, name: block.name, inputJson: '' })
                onToolStart?.({ toolId: block.id, toolName: block.name })
              }
              break
            }
            case 'content_block_delta': {
              const block = contentBlocks.get(data.index)
              if (!block) break
              if (data.delta.type === 'text_delta' && block.type === 'text') {
                block.text += data.delta.text
                assistantTextAccumulated += data.delta.text
                onChunk?.(data.delta.text)
              } else if (data.delta.type === 'input_json_delta' && block.type === 'tool_use') {
                block.inputJson += data.delta.partial_json
              }
              break
            }
            case 'message_delta': {
              if (data.delta?.stop_reason) stopReason = data.delta.stop_reason
              apiUsage.output += data.usage?.output_tokens ?? 0
              break
            }
            case 'message_stop': break streamLoop
            case 'error': {
              onError(data.error?.message ?? 'Unknown API error')
              return
            }
          }
        }
      }

      const assistantContentBlocks = []
      if (assistantTextAccumulated) assistantContentBlocks.push({ type: 'text', text: assistantTextAccumulated })

      const toolUseBlocks = []
      for (const [, block] of contentBlocks) {
        if (block.type === 'tool_use') {
          let input = {}
          try { input = JSON.parse(block.inputJson || '{}') } catch {}
          assistantContentBlocks.push({ type: 'tool_use', id: block.id, name: block.name, input })
          toolUseBlocks.push({ id: block.id, name: block.name, input })
        }
      }

      conversationMessages.push({ role: 'assistant', content: assistantContentBlocks })

      if (stopReason === 'tool_use' && toolUseBlocks.length > 0) {
        const toolResultBlocks = []
        for (const tool of toolUseBlocks) {
          const toolExecution = await executeTool(tool.name, tool.input)
          const { success, result } = toolExecution

          onToolResult?.({
            toolId: tool.id, toolName: tool.name,
            input: tool.input, result, success,
            imageDataUrl: toolExecution.imageDataUrl ?? null,
            oldContent: toolExecution.oldContent ?? null,
            newContent: toolExecution.newContent ?? null,
          })

          if (toolExecution.imageBase64) {
            toolResultBlocks.push({
              type: 'tool_result', tool_use_id: tool.id,
              content: [
                { type: 'image', source: { type: 'base64', media_type: 'image/png', data: toolExecution.imageBase64 } },
                { type: 'text', text: 'Screenshot captured. Analyze the image above.' },
              ],
            })
          } else {
            const MAX_RESULT_CHARS = 6000
            const safeResult = typeof result === 'string' && result.length > MAX_RESULT_CHARS
              ? result.slice(0, MAX_RESULT_CHARS) + `\n\n[Result truncated — ${result.length - MAX_RESULT_CHARS} chars omitted]`
              : result
            toolResultBlocks.push({ type: 'tool_result', tool_use_id: tool.id, content: safeResult })
          }
        }
        conversationMessages.push({ role: 'user', content: toolResultBlocks })
        continue
      }

      onDone?.({ usage: apiUsage, finalMessages: conversationMessages })
      return
    }
  } catch (err) {
    if (err.name !== 'AbortError') onError(err.message ?? 'Unknown error')
    else onDone?.({ usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } })
  }
}

// ─── Desktop (Electron IPC) streaming — uses shared engine above ──────────────

const claudeStreams = new Map()

// =============================================================================
// Mobile Companion — SSE stream registry + helpers
// =============================================================================

// Map of active mobile SSE streams. Each entry:
//   { sseRes: ServerResponse|null, buffer: string[], done: boolean }
const mobileStreams = new Map()

// Read mobile settings directly from settings.json (no IPC round-trip needed)
function getMobileSettings() {
  const s = readJSON(settingsFile, {})
  return {
    mobileEnabled: s.mobileEnabled !== false,  // default true if unset
    mobileToken:   s.mobileToken   ?? '',
  }
}

function getMobileApiKey()     { return readJSON(settingsFile, {}).claudeApiKey ?? '' }
function getMobileModel()      { return readJSON(settingsFile, {}).defaultClaudeModel ?? 'claude-sonnet-4-6' }

// Push an SSE event to a stream — buffers if SSE connection not yet attached
function pushSSEEvent(streamId, data) {
  const entry = mobileStreams.get(streamId)
  if (!entry) return
  const line = `data: ${JSON.stringify(data)}\n\n`
  if (entry.sseRes) {
    try { entry.sseRes.write(line) } catch {}
  } else {
    entry.buffer.push(line)
  }
}

// Generate a solid-color PNG with pure Node (zlib + manual PNG encoding)
// Used to serve PWA icons without any external npm packages.
function makeSolidPNG(size, r, g, b) {
  const zlib = require('zlib')

  // CRC-32 lookup table
  const CRC32 = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    CRC32[n] = c
  }
  function crc32(buf) {
    let crc = 0xffffffff
    for (let i = 0; i < buf.length; i++) crc = CRC32[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
    return (crc ^ 0xffffffff) >>> 0
  }
  function pngChunk(type, data) {
    const lenBuf = Buffer.alloc(4); lenBuf.writeUInt32BE(data.length)
    const typeBuf = Buffer.from(type)
    const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
    return Buffer.concat([lenBuf, typeBuf, data, crcBuf])
  }

  // Raw image data: filter-byte (0=None) + RGB per row
  const rowStride = size * 3
  const raw = Buffer.alloc((rowStride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (rowStride + 1)] = 0  // filter type None
    for (let x = 0; x < size; x++) {
      const off = y * (rowStride + 1) + 1 + x * 3
      raw[off] = r; raw[off + 1] = g; raw[off + 2] = b
    }
  }
  const idat = zlib.deflateSync(raw)

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 2  // 8-bit RGB

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),  // PNG signature
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

ipcMain.on('claude-stream-start', async (event, { requestId, messages, model, apiKey, systemPrompt }) => {
  const controller = new AbortController()
  claudeStreams.set(requestId, controller)
  await streamClaude({
    messages, model, apiKey, systemPrompt,
    signal: controller.signal,
    onChunk:      (text)   => event.sender.send('claude-chunk',       { requestId, text }),
    onToolStart:  (data)   => event.sender.send('claude-tool-start',  { requestId, ...data }),
    onToolResult: (data)   => event.sender.send('claude-tool-result', { requestId, ...data }),
    onDone:       (data)   => { event.sender.send('claude-done', { requestId, usage: data.usage }); claudeStreams.delete(requestId) },
    onError:      (msg)    => { event.sender.send('claude-error', { requestId, message: msg }); claudeStreams.delete(requestId) },
  })
})

ipcMain.on('claude-stream-abort', (_, { requestId }) => {
  const controller = claudeStreams.get(requestId)
  if (controller) { controller.abort(); claudeStreams.delete(requestId) }
})
 
// =============================================================================
// Settings + project sync
// Renderer pushes these to main so cron tasks and file tools can use them
// without needing to round-trip back to the renderer at execution time.
// =============================================================================

let cronSettings = { apiKey: '', model: 'claude-sonnet-4-5' }
let activeRootPath = null   // set by project switcher — enforces file tool scope

ipcMain.on('settings:sync', (_, data) => {
  cronSettings = { ...cronSettings, ...data }
})

ipcMain.on('project:syncRootPath', (_, rootPath) => {
  activeRootPath = rootPath || null
  console.log(`[project] Root path: ${activeRootPath ?? '(none)'}`)
})

// Path safety check — returns true if filePath is within activeRootPath (if set)
function isPathAllowed(filePath) {
  if (!activeRootPath) return true
  const resolved = path.resolve(filePath)
  const root = path.resolve(activeRootPath)
  return resolved === root || resolved.startsWith(root + path.sep)
}

// =============================================================================
// Cron: Scheduled task execution
// Renderer sends tasks via IPC; main process owns the live cron jobs.
// Supports recurring cadences (node-cron) and one-shot tasks (setTimeout).
// On fire: calls Claude API directly, sends result back to renderer to create
// a conversation. Also sends 'cron:task-ran' so lastRunAt stays current.
// =============================================================================

const cronJobs    = new Map()   // taskId → { job, task }   (recurring)
const onceTimers  = new Map()   // taskId → { timer, task } (one-shot)
const taskRegistry = new Map()  // taskId → task            (all registered, for run-now)

const CRON_EXPRESSIONS = {
  hourly:  '0 * * * *',
  daily:   '0 9 * * *',    // 9am daily
  weekly:  '0 9 * * 1',    // 9am Monday
  monthly: '0 9 1 * *',    // 9am 1st of month
}

async function cronRunTask(task) {
  const ranAt = Date.now()
  console.log(`[cron] Firing: "${task.label}" | ${new Date(ranAt).toLocaleString()}`)

  // Notify renderer so lastRunAt updates immediately
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('cron:task-ran', { taskId: task.id, ranAt })
  }

  const { apiKey, model } = cronSettings
  if (!apiKey) {
    console.warn('[cron] No API key — add a Claude key in Settings to enable execution')
    return
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        messages: [{ role: 'user', content: task.prompt }],
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error(`[cron] API error ${response.status}: ${errText}`)
      return
    }

    const data = await response.json()
    const result = data.content?.[0]?.text ?? '(no response)'

    console.log(`[cron] Done: "${task.label}" (${result.length} chars)`)

    // OS notification — fires even when Lumen is minimized or backgrounded
    const { Notification } = require('electron')
    if (Notification.isSupported()) {
      const preview = result.replace(/\s+/g, ' ').slice(0, 120)
      new Notification({
        title: `Helm ✓ ${task.label}`,
        body:  preview + (result.length > 120 ? '…' : ''),
        silent: false,
      }).show()
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('cron:task-result', {
        taskId: task.id,
        label:  task.label,
        prompt: task.prompt,
        result,
        ranAt,
      })
    }
  } catch (err) {
    console.error(`[cron] Execution failed: ${err.message}`)
  }
}

function cronRegisterTask(task) {
  if (!task.enabled) return
  taskRegistry.set(task.id, task)   // always keep registry current

  if (task.cadence === 'once') {
    if (!task.scheduledFor) return
    const delay = task.scheduledFor - Date.now()
    if (delay <= 0) {
      console.log(`[cron] Skipping "${task.label}" — scheduled time is in the past`)
      return
    }
    cronUnregisterTask(task.id)
    const timer = setTimeout(() => {
      onceTimers.delete(task.id)
      cronRunTask(task)
    }, delay)
    onceTimers.set(task.id, { timer, task })
    console.log(`[cron] Scheduled once: "${task.label}" at ${new Date(task.scheduledFor).toLocaleString()}`)
    return
  }

  const expression = CRON_EXPRESSIONS[task.cadence]
  if (!expression) return
  cronUnregisterTask(task.id)
  const job = cron.schedule(expression, () => cronRunTask(task))
  cronJobs.set(task.id, { job, task })
  console.log(`[cron] Registered "${task.label}" (${task.cadence})`)
}

function cronUnregisterTask(id) {
  const entry = cronJobs.get(id)
  if (entry) { entry.job.stop(); cronJobs.delete(id) }
  const timer = onceTimers.get(id)
  if (timer) { clearTimeout(timer.timer); onceTimers.delete(id) }
  taskRegistry.delete(id)
}

// Run a task immediately on demand (bypasses cadence)
ipcMain.on('cron:run-now', (_, task) => {
  console.log(`[cron] Run Now: "${task.label}"`)
  cronRunTask(task)
})

ipcMain.on('cron:register',   (_, task)  => cronRegisterTask(task))
ipcMain.on('cron:unregister', (_, id)    => cronUnregisterTask(id))
ipcMain.on('cron:sync', (_, tasks) => {
  for (const id of [...cronJobs.keys(), ...onceTimers.keys()]) cronUnregisterTask(id)
  tasks.filter(t => t.enabled).forEach(cronRegisterTask)
  console.log(`[cron] Synced ${tasks.length} task(s)`)
})

// =============================================================================
// Remote Dispatch: local HTTP server so phones/scripts can fire tasks at Lumen
// POST http://LOCAL_IP:PORT/dispatch  { "text": "...", "secret": "..." }
// The secret is optional but recommended — set via Settings → Remote Dispatch.
// Main fires 'remote:dispatch' to the renderer, which creates a conversation.
// =============================================================================

const REMOTE_DISPATCH_DEFAULT_PORT = 7747
let remoteDispatchServer = null

// =============================================================================
// Mobile API: addMobileRoutes
// Attaches the full mobile PWA routing logic to an existing http.Server.
// Handles static assets, REST API, and SSE streaming — all in one handler.
// =============================================================================

function addMobileRoutes(server, dispatchSecret) {
  // ── Static assets (cached at module load time) ─────────────────────────────
  const assetsDir    = path.join(__dirname, 'assets')
  const mobileHtml   = (() => {
    const p = path.join(assetsDir, 'mobile.html')
    return fs.existsSync(p) ? fs.readFileSync(p) : Buffer.from('<h1>mobile.html not found in assets/</h1>')
  })()
  const icon192 = (() => {
    const p = path.join(assetsDir, 'icon-192.png')
    return fs.existsSync(p) ? fs.readFileSync(p) : makeSolidPNG(192, 0x7c, 0x3a, 0xed)
  })()
  const icon512 = (() => {
    const p = path.join(assetsDir, 'icon-512.png')
    return fs.existsSync(p) ? fs.readFileSync(p) : makeSolidPNG(512, 0x7c, 0x3a, 0xed)
  })()

  const MANIFEST_JSON = JSON.stringify({
    name: 'Lumen', short_name: 'Lumen',
    description: 'Private AI companion',
    start_url: '/', display: 'standalone',
    background_color: '#0f0f0f', theme_color: '#7c3aed',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  })

  // ── Shared helpers ─────────────────────────────────────────────────────────
  function sendJSON(res, status, data) {
    const body = JSON.stringify(data)
    res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) })
    res.end(body)
  }

  function readBody(req, maxBytes = 512 * 1024) {
    return new Promise((resolve, reject) => {
      let body = ''
      req.on('data', (chunk) => { body += chunk; if (body.length > maxBytes) req.destroy() })
      req.on('end', () => { try { resolve(JSON.parse(body || '{}')) } catch { resolve({}) } })
      req.on('error', reject)
    })
  }

  function checkMobileAuth(req) {
    const { mobileToken } = getMobileSettings()
    if (!mobileToken) return true
    const url = new URL(req.url, 'http://x')
    const token = req.headers['x-lumen-token'] || url.searchParams.get('token') || ''
    return token === mobileToken
  }

  function loadMobileConvs()     { return readJSON(mobileConversationsFile, {}) }
  function saveMobileConvs(data) {
    writeJSON(mobileConversationsFile, data)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('mobile:conversationsUpdated')
    }
  }

  // ── Request router ─────────────────────────────────────────────────────────
  server.on('request', async (req, res) => {
    const CORS = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Lumen-Token, x-lumen-token, X-Lumen-Secret',
    }
    Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v))

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

    const url = new URL(req.url, 'http://x')
    const p   = url.pathname

    // ── Static ───────────────────────────────────────────────────────────────
    if (req.method === 'GET' && p === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(mobileHtml)
      return
    }
    if (req.method === 'GET' && p === '/manifest.json') {
      res.writeHead(200, { 'Content-Type': 'application/manifest+json' })
      res.end(MANIFEST_JSON)
      return
    }
    if (req.method === 'GET' && p === '/icon-192.png') {
      res.writeHead(200, { 'Content-Type': 'image/png' }); res.end(icon192); return
    }
    if (req.method === 'GET' && p === '/icon-512.png') {
      res.writeHead(200, { 'Content-Type': 'image/png' }); res.end(icon512); return
    }

    // ── Legacy remote dispatch (kept for backward compat) ────────────────────
    if (req.method === 'POST' && p === '/dispatch') {
      const body = await readBody(req, 4096)
      const text = (body.text || '').trim()
      if (!text) { sendJSON(res, 400, { error: 'Missing "text" field' }); return }
      if (dispatchSecret) {
        const provided = body.secret || req.headers['x-lumen-secret'] || ''
        if (provided !== dispatchSecret) { sendJSON(res, 401, { error: 'Invalid secret' }); return }
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('remote:dispatch', { text })
        console.log(`[remote-dispatch] Message received: "${text.slice(0, 80)}..."`)
      }
      sendJSON(res, 200, { ok: true, message: 'Dispatched to Lumen' })
      return
    }

    // ── API auth gate ────────────────────────────────────────────────────────
    if (p.startsWith('/api/') && !checkMobileAuth(req)) {
      sendJSON(res, 401, { error: 'Unauthorized — include x-lumen-token header or ?token= query param' })
      return
    }

    // ── GET /api/health ──────────────────────────────────────────────────────
    if (req.method === 'GET' && p === '/api/health') {
      sendJSON(res, 200, { ok: true, version: '1.0.0' })
      return
    }

    // ── GET /api/conversations ───────────────────────────────────────────────
    if (req.method === 'GET' && p === '/api/conversations') {
      const convs = loadMobileConvs()
      const list  = Object.values(convs)
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
        .map(c => ({
          id:           c.id,
          title:        c.title || 'Untitled',
          model:        c.model || getMobileModel(),
          updatedAt:    c.updatedAt,
          messageCount: (c.messages || []).length,
        }))
      sendJSON(res, 200, list)
      return
    }

    // ── GET /api/conversations/:id ───────────────────────────────────────────
    const convDetailM = p.match(/^\/api\/conversations\/([^/]+)$/)
    if (req.method === 'GET' && convDetailM) {
      const convs = loadMobileConvs()
      const conv  = convs[convDetailM[1]]
      if (!conv) { sendJSON(res, 404, { error: 'Conversation not found' }); return }
      const msgs      = conv.messages || []
      const truncated = msgs.length > 100
      sendJSON(res, 200, { ...conv, messages: truncated ? msgs.slice(-100) : msgs, truncated })
      return
    }

    // ── POST /api/conversations ──────────────────────────────────────────────
    if (req.method === 'POST' && p === '/api/conversations') {
      const body  = await readBody(req)
      const model = body.model || getMobileModel()
      const id    = require('crypto').randomUUID()
      const now   = Date.now()
      const conv  = { id, title: 'New Chat', model, mode: 'chat', messages: [], createdAt: now, updatedAt: now }
      const convs = loadMobileConvs()
      convs[id] = conv
      saveMobileConvs(convs)
      sendJSON(res, 200, conv)
      return
    }

    // ── POST /api/conversations/:id/messages ─────────────────────────────────
    const convMsgM = p.match(/^\/api\/conversations\/([^/]+)\/messages$/)
    if (req.method === 'POST' && convMsgM) {
      const convId = convMsgM[1]
      const body   = await readBody(req)
      const text   = (body.text || '').trim()
      if (!text) { sendJSON(res, 400, { error: 'Missing text' }); return }

      const convs = loadMobileConvs()
      const conv  = convs[convId]
      if (!conv) { sendJSON(res, 404, { error: 'Conversation not found' }); return }

      const apiKey = getMobileApiKey()
      if (!apiKey) { sendJSON(res, 500, { error: 'No API key configured in Lumen settings' }); return }

      const streamId   = require('crypto').randomUUID()
      const messageId  = require('crypto').randomUUID()
      const now        = Date.now()

      // Append user message
      const userMsg = { id: require('crypto').randomUUID(), role: 'user', content: text, timestamp: now }
      conv.messages.push(userMsg)
      conv.updatedAt = now
      // Auto-title on first user message
      if (conv.title === 'New Chat' && conv.messages.filter(m => m.role === 'user').length === 1) {
        conv.title = text.slice(0, 60) + (text.length > 60 ? '…' : '')
      }
      writeJSON(mobileConversationsFile, convs)

      // Register stream entry
      mobileStreams.set(streamId, { sseRes: null, buffer: [], done: false })

      // Orphan cleanup: if SSE never connects within 30s, discard the stream
      setTimeout(() => {
        const e = mobileStreams.get(streamId)
        if (e && !e.sseRes && !e.done) {
          console.warn(`[mobile] Stream ${streamId} orphaned — cleaning up`)
          mobileStreams.delete(streamId)
        }
      }, 30000)

      // Build message history for Claude
      const claudeMsgs = conv.messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role, content: m.content }))

      // Fire Claude stream in background (non-blocking)
      let assistantText = ''
      streamClaude({
        messages:     claudeMsgs,
        model:        conv.model || getMobileModel(),
        apiKey,
        systemPrompt: conv.agentSystemPrompt || null,
        signal:       null,
        onChunk:      (chunk) => {
          assistantText += chunk
          pushSSEEvent(streamId, { type: 'chunk', text: chunk })
        },
        onToolStart:  ({ toolName }) => pushSSEEvent(streamId, { type: 'tool_start', name: toolName }),
        onToolResult: ({ toolName, result }) => pushSSEEvent(streamId, {
          type: 'tool_result', name: toolName,
          result: typeof result === 'string' ? result.slice(0, 600) : String(result),
        }),
        onDone: ({ usage }) => {
          // Persist assistant reply
          const freshConvs = loadMobileConvs()
          if (freshConvs[convId]) {
            freshConvs[convId].messages.push({
              id: messageId, role: 'assistant', content: assistantText, timestamp: Date.now(),
            })
            freshConvs[convId].updatedAt = Date.now()
            saveMobileConvs(freshConvs)
          }
          pushSSEEvent(streamId, { type: 'done', usage: { input: usage.input, output: usage.output } })
          const e = mobileStreams.get(streamId)
          if (e) {
            e.done = true
            try { e.sseRes?.end() } catch {}
            setTimeout(() => mobileStreams.delete(streamId), 60000)
          }
        },
        onError: (message) => {
          pushSSEEvent(streamId, { type: 'error', message })
          const e = mobileStreams.get(streamId)
          if (e) {
            e.done = true
            try { e.sseRes?.end() } catch {}
            setTimeout(() => mobileStreams.delete(streamId), 60000)
          }
        },
      })

      sendJSON(res, 200, { messageId, streamId })
      return
    }

    // ── GET /api/stream/:streamId (SSE) ──────────────────────────────────────
    const streamM = p.match(/^\/api\/stream\/([^/]+)$/)
    if (req.method === 'GET' && streamM) {
      const streamId = streamM[1]
      const entry    = mobileStreams.get(streamId)
      if (!entry) { sendJSON(res, 404, { error: 'Stream not found or expired' }); return }

      res.writeHead(200, {
        'Content-Type':  'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection':    'keep-alive',
        'X-Accel-Buffering': 'no',
      })

      // Flush buffered events (race-window protection)
      for (const line of entry.buffer) res.write(line)
      entry.buffer = []

      if (entry.done) { res.end(); mobileStreams.delete(streamId); return }

      // Attach live SSE connection
      entry.sseRes = res
      req.on('close', () => { const e = mobileStreams.get(streamId); if (e) e.sseRes = null })
      return
    }

    // ── 404 ──────────────────────────────────────────────────────────────────
    sendJSON(res, 404, { error: `Not found: ${req.method} ${p}` })
  })
}

function startRemoteDispatchServer(port, secret) {
  if (remoteDispatchServer) {
    remoteDispatchServer.close()
    remoteDispatchServer = null
  }

  const http = require('http')
  const os   = require('os')

  // Minimal base server — all routing is done by addMobileRoutes
  remoteDispatchServer = http.createServer()
  addMobileRoutes(remoteDispatchServer, secret)

  remoteDispatchServer.listen(port, '0.0.0.0', () => {
    const ifaces = os.networkInterfaces()
    const ips = Object.values(ifaces).flat()
      .filter(i => i && i.family === 'IPv4' && !i.internal)
      .map(i => i.address)
    console.log(`[remote-dispatch] Server listening on port ${port}`)
    console.log(`[remote-dispatch] Reachable at: ${ips.map(ip => `http://${ip}:${port}`).join(', ')}`)
    // Send local IP list to renderer for display in settings
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('remote:serverStarted', { port, ips })
    }
  })

  remoteDispatchServer.on('error', (err) => {
    console.error(`[remote-dispatch] Server error: ${err.message}`)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('remote:serverError', { message: err.message })
    }
  })
}

function stopRemoteDispatchServer() {
  if (remoteDispatchServer) {
    remoteDispatchServer.close()
    remoteDispatchServer = null
    console.log('[remote-dispatch] Server stopped')
  }
}

// IPC controls from renderer
ipcMain.on('remote:start', (_, { port, secret }) => {
  startRemoteDispatchServer(port || REMOTE_DISPATCH_DEFAULT_PORT, secret || '')
})

ipcMain.on('remote:stop', () => stopRemoteDispatchServer())

ipcMain.handle('remote:getIPs', () => {
  const os = require('os')
  const ifaces = os.networkInterfaces()
  return Object.values(ifaces).flat()
    .filter(i => i && i.family === 'IPv4' && !i.internal)
    .map(i => i.address)
})

// =============================================================================
// Mobile PWA — REST + SSE API served on the same port as Remote Dispatch
// Endpoints are added to the remoteDispatchServer when it starts.
// GET  /            → serves the mobile web app HTML
// GET  /manifest.json → PWA manifest
// GET  /api/status  → { ok, model }
// GET  /api/conversations → list conversations
// GET  /api/conversations/:id → single conversation
// POST /api/conversations → create conversation { title? }
// POST /api/conversations/:id/message → send message, stream SSE response
// =============================================================================

function getMobileAppHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="theme-color" content="#0a0a14">
<title>Lumen</title>
<link rel="manifest" href="/manifest.json">
<style>
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
:root{--bg:#0a0a14;--surface:#0f0f1e;--border:#ffffff18;--text:#e2e2f0;--muted:#6b6b8a;--accent:#8b5cf6;--accent-dim:#8b5cf620;--error:#f87171;--user-bg:#13132a}
html,body{height:100%;overflow:hidden;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px}
#app{display:flex;flex-direction:column;height:100dvh;overflow:hidden}

/* ── Header ── */
.header{display:flex;align-items:center;gap:10px;padding:12px 16px;background:var(--surface);border-bottom:1px solid var(--border);min-height:52px;flex-shrink:0}
.header-title{font-size:15px;font-weight:600;flex:1;truncate:ellipsis;overflow:hidden;white-space:nowrap}
.header-btn{background:none;border:none;color:var(--muted);cursor:pointer;padding:6px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:13px}
.header-btn:active{background:var(--border)}

/* ── Sidebar ── */
.sidebar{position:fixed;top:0;left:0;width:min(300px,85vw);height:100dvh;background:var(--surface);border-right:1px solid var(--border);z-index:100;transform:translateX(-100%);transition:transform .25s ease;display:flex;flex-direction:column}
.sidebar.open{transform:translateX(0)}
.sidebar-overlay{position:fixed;inset:0;background:#00000060;z-index:99;display:none}
.sidebar-overlay.open{display:block}
.sidebar-header{padding:16px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between}
.sidebar-header h2{font-size:15px;font-weight:600}
.new-chat-btn{background:var(--accent);color:#fff;border:none;border-radius:10px;padding:7px 14px;font-size:13px;font-weight:600;cursor:pointer}
.conv-list{flex:1;overflow-y:auto;padding:8px}
.conv-item{padding:10px 12px;border-radius:10px;cursor:pointer;margin-bottom:2px;transition:background .15s}
.conv-item:active,.conv-item.active{background:var(--accent-dim)}
.conv-item-title{font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.conv-item-meta{font-size:11px;color:var(--muted);margin-top:2px}

/* ── Messages ── */
.messages{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:16px;-webkit-overflow-scrolling:touch}
.msg{display:flex;gap:10px;max-width:100%;animation:fadeIn .2s ease}
@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
.msg.user{flex-direction:row-reverse}
.msg-avatar{width:28px;height:28px;border-radius:8px;background:var(--accent-dim);border:1px solid var(--accent)30;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:14px;margin-top:2px}
.msg-bubble{max-width:calc(100% - 42px);padding:10px 14px;border-radius:16px;font-size:14px;line-height:1.55;word-break:break-word}
.msg.user .msg-bubble{background:var(--user-bg);border:1px solid var(--border);border-radius:16px 4px 16px 16px}
.msg.assistant .msg-bubble{color:var(--text);border-radius:4px 16px 16px 16px}
.msg-bubble pre{background:#00000040;border-radius:8px;padding:10px;overflow-x:auto;font-size:12px;margin:8px 0}
.msg-bubble code{font-family:'SF Mono',Menlo,monospace;font-size:12px}
.msg-bubble p{margin-bottom:8px}.msg-bubble p:last-child{margin-bottom:0}
.msg-bubble strong{font-weight:600}
.typing-dots{display:flex;gap:5px;padding:4px 0}
.typing-dots span{width:7px;height:7px;background:var(--muted);border-radius:50%;animation:dot .9s infinite}
.typing-dots span:nth-child(2){animation-delay:.2s}
.typing-dots span:nth-child(3){animation-delay:.4s}
@keyframes dot{0%,80%,100%{transform:scale(0.7);opacity:.4}40%{transform:scale(1);opacity:1}}

/* ── Input ── */
.input-area{padding:10px 12px;background:var(--surface);border-top:1px solid var(--border);display:flex;gap:8px;align-items:flex-end;flex-shrink:0}
.input-wrap{flex:1;background:var(--bg);border:1px solid var(--border);border-radius:14px;display:flex;align-items:flex-end;padding:8px 12px;gap:8px;transition:border-color .15s}
.input-wrap:focus-within{border-color:var(--accent)60}
textarea#inp{flex:1;background:none;border:none;outline:none;color:var(--text);font-size:14px;line-height:1.5;resize:none;max-height:120px;font-family:inherit}
textarea#inp::placeholder{color:var(--muted)}
.send-btn{width:38px;height:38px;border-radius:12px;background:var(--accent);border:none;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:opacity .15s}
.send-btn:disabled{opacity:.4}
.send-btn:active:not(:disabled){opacity:.8}
.empty{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:12px;color:var(--muted)}
.empty svg{opacity:.3}
.model-tag{font-size:11px;color:var(--muted);padding:3px 8px;border:1px solid var(--border);border-radius:6px;font-family:monospace}
</style>
</head>
<body>
<div id="app">
  <div class="header">
    <button class="header-btn" onclick="toggleSidebar()" title="Conversations">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
        <line x1="2" y1="4" x2="16" y2="4"/><line x1="2" y1="9" x2="16" y2="9"/><line x1="2" y1="14" x2="16" y2="14"/>
      </svg>
    </button>
    <span class="header-title" id="conv-title">Lumen</span>
    <span class="model-tag" id="model-tag">claude</span>
    <button class="header-btn" onclick="newChat()" title="New chat">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
        <line x1="9" y1="3" x2="9" y2="15"/><line x1="3" y1="9" x2="15" y2="9"/>
      </svg>
    </button>
  </div>

  <div class="sidebar-overlay" id="overlay" onclick="toggleSidebar()"></div>
  <div class="sidebar" id="sidebar">
    <div class="sidebar-header">
      <h2>Conversations</h2>
      <button class="new-chat-btn" onclick="newChat();toggleSidebar()">+ New</button>
    </div>
    <div class="conv-list" id="conv-list"></div>
  </div>

  <div class="messages" id="messages">
    <div class="empty" id="empty">
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round">
        <circle cx="24" cy="24" r="20"/><path d="M16 20c0-4.4 3.6-8 8-8s8 3.6 8 8c0 3-1.6 5.6-4 7v3h-8v-3c-2.4-1.4-4-4-4-7z"/>
        <line x1="20" y1="38" x2="28" y2="38"/>
      </svg>
      <p>Select a conversation or start a new one</p>
    </div>
  </div>

  <div class="input-area">
    <div class="input-wrap">
      <textarea id="inp" rows="1" placeholder="Message Lumen…" oninput="autoResize(this)" onkeydown="handleKey(event)"></textarea>
    </div>
    <button class="send-btn" id="send-btn" onclick="send()" disabled>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M8 2v12M8 2L4 6M8 2l4 4"/>
      </svg>
    </button>
  </div>
</div>

<script>
let currentConvId = null
let isStreaming = false
let conversations = []

// ── Markdown renderer (minimal, no deps) ─────────────────────────────
function renderMarkdown(text) {
  const escaped = text
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  // Code blocks
  let out = escaped.replace(/\`\`\`([\\s\\S]*?)\`\`\`/g, (_,c)=>\`<pre><code>\${c.trim()}</code></pre>\`)
  // Inline code
  out = out.replace(/\`([^\`]+)\`/g, (_,c)=>\`<code>\${c}</code>\`)
  // Bold
  out = out.replace(/\\*\\*([^*]+)\\*\\*/g, (_,c)=>\`<strong>\${c}</strong>\`)
  // Headers
  out = out.replace(/^### (.+)$/gm, (_,c)=>\`<strong>\${c}</strong>\`)
  out = out.replace(/^## (.+)$/gm, (_,c)=>\`<strong>\${c}</strong>\`)
  out = out.replace(/^# (.+)$/gm, (_,c)=>\`<strong>\${c}</strong>\`)
  // Line breaks → paragraphs
  const paras = out.split(/\\n\\n+/).map(p=>{
    if(p.startsWith('<pre>')) return p
    return \`<p>\${p.replace(/\\n/g,'<br>')}</p>\`
  })
  return paras.join('')
}

// ── UI helpers ────────────────────────────────────────────────────────
function autoResize(el){
  el.style.height='auto'
  el.style.height=Math.min(el.scrollHeight,120)+'px'
  document.getElementById('send-btn').disabled=!el.value.trim()||isStreaming
}

function scrollToBottom(){
  const m=document.getElementById('messages')
  m.scrollTop=m.scrollHeight
}

function setTitle(title){
  document.getElementById('conv-title').textContent=title||'Lumen'
}

function toggleSidebar(){
  document.getElementById('sidebar').classList.toggle('open')
  document.getElementById('overlay').classList.toggle('open')
}

function handleKey(e){
  if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}
}

// ── Conversation management ────────────────────────────────────────────
async function loadConversations(){
  const res=await fetch('/api/conversations').catch(()=>null)
  if(!res||!res.ok) return
  conversations=await res.json()
  renderConvList()
}

function renderConvList(){
  const list=document.getElementById('conv-list')
  if(!conversations.length){list.innerHTML='<p style="color:var(--muted);font-size:12px;padding:8px 12px">No conversations yet</p>';return}
  list.innerHTML=conversations.map(c=>\`
    <div class="conv-item \${c.id===currentConvId?'active':''}" onclick="openConv('\${c.id}')">
      <div class="conv-item-title">\${escHtml(c.title||'Untitled')}</div>
      <div class="conv-item-meta">\${timeAgo(c.updatedAt)}</div>
    </div>
  \`).join('')
}

function escHtml(t){return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}

function timeAgo(ms){
  const d=Date.now()-ms
  if(d<60000) return 'just now'
  if(d<3600000) return Math.floor(d/60000)+'m ago'
  if(d<86400000) return Math.floor(d/3600000)+'h ago'
  return Math.floor(d/86400000)+'d ago'
}

async function openConv(id){
  const res=await fetch(\`/api/conversations/\${id}\`).catch(()=>null)
  if(!res||!res.ok) return
  const conv=await res.json()
  currentConvId=id
  setTitle(conv.title)
  renderMessages(conv.messages||[])
  renderConvList()
  // close sidebar on mobile
  document.getElementById('sidebar').classList.remove('open')
  document.getElementById('overlay').classList.remove('open')
}

function renderMessages(msgs){
  const container=document.getElementById('messages')
  const empty=document.getElementById('empty')
  if(!msgs.length){empty.style.display='flex';container.innerHTML='';container.appendChild(empty);return}
  empty.style.display='none'
  // Keep empty el in DOM
  const html=msgs.map(m=>{
    if(m.role==='user') return \`<div class="msg user"><div class="msg-bubble">\${escHtml(m.content||'')}</div></div>\`
    return \`<div class="msg assistant"><div class="msg-avatar">💡</div><div class="msg-bubble">\${renderMarkdown(m.content||'')}</div></div>\`
  }).join('')
  container.innerHTML=html+empty.outerHTML
  scrollToBottom()
}

async function newChat(){
  const res=await fetch('/api/conversations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:'New Chat'})}).catch(()=>null)
  if(!res||!res.ok) return
  const conv=await res.json()
  conversations.unshift(conv)
  currentConvId=conv.id
  setTitle(conv.title)
  const m=document.getElementById('messages')
  const e=document.getElementById('empty')
  e.style.display='flex'
  m.innerHTML=''
  m.appendChild(e)
  renderConvList()
}

// ── Send + SSE streaming ──────────────────────────────────────────────
async function send(){
  const inp=document.getElementById('inp')
  const text=inp.value.trim()
  if(!text||isStreaming||!currentConvId) return

  isStreaming=true
  inp.value=''
  inp.style.height='auto'
  document.getElementById('send-btn').disabled=true

  // Append user bubble
  const messages=document.getElementById('messages')
  document.getElementById('empty').style.display='none'
  const userEl=document.createElement('div')
  userEl.className='msg user'
  userEl.innerHTML=\`<div class="msg-bubble">\${escHtml(text)}</div>\`
  messages.appendChild(userEl)

  // Append assistant bubble with typing indicator
  const asstEl=document.createElement('div')
  asstEl.className='msg assistant'
  asstEl.innerHTML=\`<div class="msg-avatar">💡</div><div class="msg-bubble" id="stream-bubble"><div class="typing-dots"><span></span><span></span><span></span></div></div>\`
  messages.appendChild(asstEl)
  scrollToBottom()

  // SSE stream
  const bubble=document.getElementById('stream-bubble')
  let accum=''

  try {
    const res=await fetch(\`/api/conversations/\${currentConvId}/message\`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({content:text})
    })

    if(!res.ok||!res.body){bubble.textContent='Error: could not connect';isStreaming=false;return}

    const reader=res.body.getReader()
    const dec=new TextDecoder()
    let buf=''

    while(true){
      const{done,value}=await reader.read()
      if(done) break
      buf+=dec.decode(value,{stream:true})
      const lines=buf.split('\\n')
      buf=lines.pop()??''
      for(const line of lines){
        if(!line.startsWith('data:')) continue
        const data=line.slice(5).trim()
        if(data==='[DONE]') break
        try{
          const obj=JSON.parse(data)
          if(obj.type==='chunk'){
            accum+=obj.text
            bubble.innerHTML=renderMarkdown(accum)
            scrollToBottom()
          } else if(obj.type==='error'){
            bubble.textContent='Error: '+obj.message
          }
        }catch{}
      }
    }
  } catch(err){
    bubble.textContent='Connection error: '+err.message
  }

  bubble.removeAttribute('id')
  isStreaming=false
  document.getElementById('send-btn').disabled=false
  // Refresh conv list to update timestamps
  loadConversations()
}

// ── Status check ──────────────────────────────────────────────────────
fetch('/api/status').then(r=>r.json()).then(d=>{
  document.getElementById('model-tag').textContent=(d.model||'claude').replace('claude-','').split('-').slice(0,2).join('-')
}).catch(()=>{})

// ── Init ──────────────────────────────────────────────────────────────
loadConversations()
</script>
</body>
</html>`
}

function getPWAManifest(port) {
  return JSON.stringify({
    name: 'Lumen',
    short_name: 'Lumen',
    description: 'Your private AI assistant',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0a14',
    theme_color: '#0a0a14',
    orientation: 'any',
    icons: [
      { src: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="%238b5cf6"/><text y=".9em" font-size="80" x="10">💡</text></svg>', sizes: '192x192', type: 'image/svg+xml' },
    ],
  }, null, 2)
}

// Wire mobile routes into the remote dispatch server
// Called after startRemoteDispatchServer() — patches the request handler
function addMobileRoutes(server, secret) {
  // We rebuild the server's request listener to handle mobile routes first,
  // then fall through to remote dispatch for POST /dispatch
  server.removeAllListeners('request')

  server.on('request', (req, res) => {
    const url = new URL(req.url, 'http://localhost')
    const pathname = url.pathname

    // Auth check (skip for root + manifest so browsers can load the app)
    if (secret && pathname !== '/' && pathname !== '/manifest.json') {
      const provided = req.headers['x-lumen-secret'] || url.searchParams.get('secret') || ''
      if (provided !== secret) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid secret' }))
        return
      }
    }

    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Lumen-Secret')

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

    // ── GET / → mobile web app ──────────────────────────────────────────
    if (req.method === 'GET' && pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(getMobileAppHTML())
      return
    }

    // ── GET /manifest.json ──────────────────────────────────────────────
    if (req.method === 'GET' && pathname === '/manifest.json') {
      res.writeHead(200, { 'Content-Type': 'application/manifest+json' })
      res.end(getPWAManifest())
      return
    }

    // ── GET /api/status ─────────────────────────────────────────────────
    if (req.method === 'GET' && pathname === '/api/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, model: cronSettings.model || 'claude-sonnet-4-6' }))
      return
    }

    // ── GET /api/conversations ──────────────────────────────────────────
    if (req.method === 'GET' && pathname === '/api/conversations') {
      try {
        const data = readJSON(conversationsFile, [])
        const list = (Array.isArray(data) ? data : Object.values(data))
          .map(c => ({ id: c.id, title: c.title || 'Untitled', model: c.model, updatedAt: c.updatedAt || 0, createdAt: c.createdAt || 0 }))
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, 50)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(list))
      } catch { res.writeHead(500); res.end('{"error":"read failed"}') }
      return
    }

    // ── GET /api/conversations/:id ──────────────────────────────────────
    const convMatch = pathname.match(/^\/api\/conversations\/([^/]+)$/)
    if (req.method === 'GET' && convMatch) {
      try {
        const id = convMatch[1]
        const data = readJSON(conversationsFile, [])
        const convArr = Array.isArray(data) ? data : Object.values(data)
        const conv = convArr.find(c => c.id === id)
        if (!conv) { res.writeHead(404); res.end('{"error":"not found"}'); return }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(conv))
      } catch { res.writeHead(500); res.end('{"error":"read failed"}') }
      return
    }

    // ── POST /api/conversations — create new ────────────────────────────
    if (req.method === 'POST' && pathname === '/api/conversations') {
      let body = ''
      req.on('data', d => { body += d })
      req.on('end', () => {
        try {
          const { title } = JSON.parse(body || '{}')
          const conv = {
            id: require('crypto').randomUUID(),
            title: title || 'New Chat',
            model: cronSettings.model || 'claude-sonnet-4-6',
            mode: 'chat',
            messages: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }
          const data = readJSON(conversationsFile, [])
          const arr = Array.isArray(data) ? data : Object.values(data)
          arr.unshift(conv)
          writeJSON(conversationsFile, arr)
          // Notify renderer so sidebar updates
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('remote:newConversation', { id: conv.id })
          }
          res.writeHead(201, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(conv))
        } catch { res.writeHead(400); res.end('{"error":"bad request"}') }
      })
      return
    }

    // ── POST /api/conversations/:id/message — send + SSE stream ─────────
    const msgMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/message$/)
    if (req.method === 'POST' && msgMatch) {
      const convId = msgMatch[1]
      let body = ''
      req.on('data', d => { body += d })
      req.on('end', async () => {
        let content = ''
        try { content = JSON.parse(body).content || '' } catch {}
        if (!content.trim()) { res.writeHead(400); res.end(); return }

        const apiKey = cronSettings.apiKey
        const model  = cronSettings.model || 'claude-sonnet-4-6'

        if (!apiKey) {
          res.writeHead(503, { 'Content-Type': 'text/plain' })
          res.end('No API key configured in Lumen — open Settings → Models')
          return
        }

        // Load conversation history
        let conv, convArr
        try {
          const data = readJSON(conversationsFile, [])
          convArr = Array.isArray(data) ? data : Object.values(data)
          conv = convArr.find(c => c.id === convId)
          if (!conv) { res.writeHead(404); res.end(); return }
        } catch { res.writeHead(500); res.end(); return }

        // Build history
        const MAX = 30
        const history = (conv.messages || [])
          .filter(m => !m.isStreaming)
          .slice(-MAX)
          .map(m => ({ role: m.role, content: m.content }))
        history.push({ role: 'user', content })

        // Add user message to conversation
        const userMsg = { id: require('crypto').randomUUID(), role: 'user', content, timestamp: Date.now() }
        conv.messages = [...(conv.messages || []), userMsg]

        // SSE headers
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        })

        const sseWrite = (obj) => {
          if (!res.destroyed) res.write('data: ' + JSON.stringify(obj) + '\n\n')
        }

        let fullResponse = ''

        await streamClaude({
          messages: history,
          model,
          apiKey,
          signal: req.socket ? undefined : undefined,
          onChunk: (text) => {
            fullResponse += text
            sseWrite({ type: 'chunk', text })
          },
          onToolStart: (data) => sseWrite({ type: 'tool_start', ...data }),
          onToolResult: (data) => sseWrite({ type: 'tool_result', ...data }),
          onDone: () => {
            // Save assistant response to conversation
            const asstMsg = { id: require('crypto').randomUUID(), role: 'assistant', content: fullResponse, timestamp: Date.now() }
            conv.messages.push(asstMsg)
            conv.updatedAt = Date.now()
            // Auto-title from first user message
            if (conv.title === 'New Chat' && conv.messages.length <= 3) {
              conv.title = content.slice(0, 50) + (content.length > 50 ? '…' : '')
            }
            // Persist conversation
            const idx = convArr.findIndex(c => c.id === convId)
            if (idx >= 0) convArr[idx] = conv
            try { writeJSON(conversationsFile, convArr) } catch {}
            sseWrite({ type: 'done' })
            if (!res.destroyed) { res.write('data: [DONE]\n\n'); res.end() }
          },
          onError: (msg) => {
            sseWrite({ type: 'error', message: msg })
            if (!res.destroyed) { res.write('data: [DONE]\n\n'); res.end() }
          },
        })
      })
      return
    }

    // ── POST /dispatch — original remote dispatch ────────────────────────
    if (req.method === 'POST' && pathname === '/dispatch') {
      let body = ''
      req.on('data', d => { body += d; if (body.length > 4096) req.destroy() })
      req.on('end', () => {
        try {
          const data = JSON.parse(body)
          const text = (data.text || '').trim()
          if (!text) { res.writeHead(400); res.end(JSON.stringify({ error: 'Missing text' })); return }
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('remote:dispatch', { text })
          }
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true }))
        } catch { res.writeHead(400); res.end(JSON.stringify({ error: 'Invalid JSON' })) }
      })
      return
    }

    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found' }))
  })
}

// =============================================================================
// Vault: Obsidian / folder file system access
// Renderer can read, write, list, and search files within a user-configured
// vault path. All operations are sandboxed to the configured vaultPath.
// The renderer sets vaultPath via settings sync; main enforces scope here.
// =============================================================================

let vaultPath = null  // set by renderer via settings sync

ipcMain.on('vault:setPath', (_, p) => {
  vaultPath = p || null
  console.log(`[vault] Path set to: ${vaultPath ?? '(none)'}`)
})

function isVaultPathAllowed(filePath) {
  if (!vaultPath) return false  // no vault configured = no access
  const resolved = path.resolve(filePath)
  const root = path.resolve(vaultPath)
  return resolved === root || resolved.startsWith(root + path.sep)
}

ipcMain.handle('vault:readFile', async (_, filePath) => {
  if (!isVaultPathAllowed(filePath)) return { error: 'Path not within vault' }
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    return { content }
  } catch (err) {
    return { error: err.message }
  }
})

ipcMain.handle('vault:writeFile', async (_, filePath, content) => {
  if (!isVaultPathAllowed(filePath)) return { error: 'Path not within vault' }
  try {
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(filePath, content, 'utf-8')
    return { ok: true }
  } catch (err) {
    return { error: err.message }
  }
})

ipcMain.handle('vault:listFiles', async (_, dirPath, ext) => {
  const target = dirPath || vaultPath
  if (!target || !isVaultPathAllowed(target)) return { error: 'Path not within vault', files: [] }
  try {
    function walkDir(dir, extFilter, results = []) {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          if (!entry.name.startsWith('.')) walkDir(full, extFilter, results)
        } else if (!extFilter || entry.name.endsWith(extFilter)) {
          results.push(full)
        }
      }
      return results
    }
    const files = walkDir(target, ext || '.md')
    return { files }
  } catch (err) {
    return { error: err.message, files: [] }
  }
})

ipcMain.handle('vault:search', async (_, query, dirPath) => {
  const target = dirPath || vaultPath
  if (!target || !isVaultPathAllowed(target)) return { error: 'Path not within vault', results: [] }
  if (!query) return { results: [] }
  try {
    const results = []
    const lower = query.toLowerCase()
    function walkAndSearch(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          if (!entry.name.startsWith('.')) walkAndSearch(full)
        } else if (entry.name.endsWith('.md')) {
          const content = fs.readFileSync(full, 'utf-8')
          if (content.toLowerCase().includes(lower)) {
            // Return filename + a snippet around the first match
            const idx = content.toLowerCase().indexOf(lower)
            const snippet = content.slice(Math.max(0, idx - 80), idx + 200)
            results.push({ file: full, snippet: snippet.trim() })
            if (results.length >= 20) return  // cap at 20 results
          }
        }
      }
    }
    walkAndSearch(target)
    return { results }
  } catch (err) {
    return { error: err.message, results: [] }
  }
})

ipcMain.handle('vault:getStats', async () => {
  if (!vaultPath) return { error: 'No vault configured' }
  try {
    let count = 0
    function countFiles(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          countFiles(path.join(dir, entry.name))
        } else if (entry.name.endsWith('.md')) {
          count++
        }
      }
    }
    countFiles(vaultPath)
    return { path: vaultPath, fileCount: count }
  } catch (err) {
    return { error: err.message }
  }
})

// =============================================================================
// Vault Semantic Index — pure-JS cosine similarity, no native addons
// Embeds vault notes via Ollama (on Unraid or localhost), stores flat JSON index
// to {userData}/vault-index.json. Supports incremental re-index.
// =============================================================================

const VAULT_INDEX_VERSION = 1
let vaultIndexCache = null   // in-memory cache of the loaded index

// Index file path in Electron userData
function getVaultIndexPath() {
  return path.join(app.getPath('userData'), 'vault-index.json')
}

// Load index from disk (or return cached)
function loadVaultIndex() {
  if (vaultIndexCache) return vaultIndexCache
  const p = getVaultIndexPath()
  if (!fs.existsSync(p)) return null
  try {
    const raw = fs.readFileSync(p, 'utf-8')
    vaultIndexCache = JSON.parse(raw)
    return vaultIndexCache
  } catch {
    return null
  }
}

// Save index to disk
function saveVaultIndex(index) {
  vaultIndexCache = index
  fs.writeFileSync(getVaultIndexPath(), JSON.stringify(index), 'utf-8')
}

// Cosine similarity between two float arrays
function cosine(a, b) {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na  += a[i] * a[i]
    nb  += b[i] * b[i]
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom === 0 ? 0 : dot / denom
}

// Chunk a markdown file into ~500 char pieces, split at paragraph boundaries
function chunkMarkdown(text, maxChars = 500) {
  const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(p => p.length > 20)
  const chunks = []
  let current = ''
  for (const para of paragraphs) {
    if (current.length + para.length > maxChars && current.length > 0) {
      chunks.push(current.trim())
      // 20% overlap: keep last sentence of current chunk as start of next
      const overlap = current.slice(-Math.floor(maxChars * 0.2))
      current = overlap + '\n\n' + para
    } else {
      current = current ? current + '\n\n' + para : para
    }
  }
  if (current.trim().length > 20) chunks.push(current.trim())
  return chunks
}

// Embed a single text via Ollama
async function embedText(text, ollamaBaseUrl, model) {
  const res = await fetch(`${ollamaBaseUrl}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt: text }),
  })
  if (!res.ok) throw new Error(`Ollama embed failed: ${res.status}`)
  const data = await res.json()
  if (!data.embedding || !Array.isArray(data.embedding)) throw new Error('No embedding returned')
  return data.embedding
}

// Walk vault and collect all .md files
function collectVaultFiles(dir) {
  const files = []
  function walk(d) {
    try {
      const entries = fs.readdirSync(d, { withFileTypes: true })
      for (const e of entries) {
        if (e.isDirectory() && !e.name.startsWith('.')) walk(path.join(d, e.name))
        else if (e.name.endsWith('.md')) files.push(path.join(d, e.name))
      }
    } catch {}
  }
  walk(dir)
  return files
}

// Main: build the semantic index
ipcMain.handle('vault:buildIndex', async (_, { ollamaBaseUrl, model }) => {
  if (!vaultPath) return { error: 'No vault path set' }
  if (!ollamaBaseUrl || !model) return { error: 'Ollama base URL and model required' }

  // Test Ollama connectivity first
  try {
    await embedText('test', ollamaBaseUrl, model)
  } catch (err) {
    return { error: `Cannot reach Ollama: ${err.message}. Check that the model is pulled and the URL is correct.` }
  }

  const files = collectVaultFiles(vaultPath)
  if (files.length === 0) return { error: 'No .md files found in vault' }

  const chunks = []   // { file, text, vector }
  let processed = 0
  let skipped = 0

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf-8')
      const fileChunks = chunkMarkdown(content)

      for (const chunkText of fileChunks) {
        const vector = await embedText(chunkText, ollamaBaseUrl, model)
        chunks.push({ file, text: chunkText, vector })
      }
      processed++
    } catch (err) {
      console.warn(`[vault-index] Skipping ${file}: ${err.message}`)
      skipped++
    }

    // Progress update — sent as IPC event so UI can show a progress bar
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('vault:indexProgress', {
        done: processed + skipped,
        total: files.length,
        currentFile: path.basename(file),
      })
    }
  }

  const index = {
    version: VAULT_INDEX_VERSION,
    model,
    ollamaBaseUrl,
    builtAt: Date.now(),
    fileCount: processed,
    chunkCount: chunks.length,
    chunks,
  }

  saveVaultIndex(index)
  console.log(`[vault-index] Built: ${chunks.length} chunks from ${processed} files`)
  return { ok: true, fileCount: processed, chunkCount: chunks.length, skipped }
})

// Semantic search against the stored index
ipcMain.handle('vault:semanticSearch', async (_, { query, ollamaBaseUrl, model, topK = 5 }) => {
  if (!query) return { results: [] }

  const index = loadVaultIndex()
  if (!index) return { results: [], error: 'Index not built yet. Build it in Settings → Workspace.' }
  if (!index.chunks || index.chunks.length === 0) return { results: [] }

  // Embed the query (use stored model if not overridden)
  const embedModel  = model || index.model
  const embedBase   = ollamaBaseUrl || index.ollamaBaseUrl
  let queryVector
  try {
    queryVector = await embedText(query, embedBase, embedModel)
  } catch (err) {
    // Fall through gracefully — caller can fall back to keyword search
    return { results: [], error: `Embed query failed: ${err.message}` }
  }

  // Score all chunks
  const scored = index.chunks.map((chunk, i) => ({
    ...chunk,
    score: cosine(queryVector, chunk.vector),
    idx: i,
  }))

  scored.sort((a, b) => b.score - a.score)
  const top = scored.slice(0, topK).filter(c => c.score > 0.3)

  return {
    results: top.map(c => ({
      file:    c.file,
      text:    c.text,
      score:   Math.round(c.score * 1000) / 1000,
    })),
    indexMeta: {
      builtAt:    index.builtAt,
      model:      index.model,
      chunkCount: index.chunkCount,
    },
  }
})

// Return index metadata (for settings UI)
ipcMain.handle('vault:indexMeta', () => {
  const index = loadVaultIndex()
  if (!index) return { exists: false }
  return {
    exists:     true,
    builtAt:    index.builtAt,
    model:      index.model,
    fileCount:  index.fileCount,
    chunkCount: index.chunkCount,
  }
})

// Clear index from disk + memory
ipcMain.handle('vault:clearIndex', () => {
  vaultIndexCache = null
  const p = getVaultIndexPath()
  if (fs.existsSync(p)) fs.unlinkSync(p)
  return { ok: true }
})

// =============================================================================
// App lifecycle
// =============================================================================

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
 
// ── Window controls ──
ipcMain.on('win:minimize', () => mainWindow?.minimize());
ipcMain.on('win:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});
ipcMain.on('win:close', () => mainWindow?.close());

// Sync maximize state to renderer
if (mainWindow) {
  mainWindow.on('maximize',   () => mainWindow.webContents.send('win:maximized', true));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('win:maximized', false));
}

// ── Open conversation in new window ──
ipcMain.on('win:openConversation', (_, { conversationId }) => {
  const IS_DEV = !app.isPackaged;
  const IS_V2  = process.env.LUMEN_V2 === 'true';

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    backgroundColor: '#080810',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const query = `?conv=${encodeURIComponent(conversationId)}`;

  if (IS_V2 && IS_DEV) {
    win.loadURL(`http://localhost:5173/${query}`);
  } else {
    win.loadFile(path.join(__dirname, 'lumen-pwa', 'dist', 'index.html'), { query: { conv: conversationId } });
  }

  // Sync maximize state for child window too
  win.on('maximize',   () => win.webContents.send('win:maximized', true));
  win.on('unmaximize', () => win.webContents.send('win:maximized', false));

  // Child window controls forward to itself
  ipcMain.on('win:minimize', () => {});   // already registered; BrowserWindow handles its own focus
});

// ── Folder picker dialog ──
ipcMain.handle('dialog:openFolder', async (event) => {
  const { dialog } = require('electron');
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory'],
    title: 'Select Working Folder',
  });
  return result.canceled ? null : result.filePaths[0];
});
 
// ── Data persistence ──
ipcMain.handle('data:loadConversations', () => readJSON(conversationsFile, []));
ipcMain.handle('data:saveConversations', (_, v) => { writeJSON(conversationsFile, v); return true; });
ipcMain.handle('data:loadSettings',      () => readJSON(settingsFile, null));
ipcMain.handle('data:saveSettings',      (_, patch) => {
  // MERGE patch into existing settings — never overwrite the whole file with a partial update.
  // This prevents the API key (and other fields) from disappearing when a single setting changes.
  const existing = readJSON(settingsFile, {})
  writeJSON(settingsFile, { ...existing, ...patch })
  return true
});
ipcMain.handle('data:loadConnectors',    () => readJSON(connectorsFile, {}));
ipcMain.handle('data:saveConnectors',    (_, v) => { writeJSON(connectorsFile, v); return true; });

// ── Browser extension status ──────────────────────────────────────────────────
// Renderer calls this to check if the extension WS is actually live.
ipcMain.handle('browser:status', () => ({
  connected: !!(browserExtensionSocket && browserExtensionSocket.readyState === 1)
}))
 
// ── Google OAuth ──
ipcMain.handle('connect-google', async () => {
  await connectGoogle(mainWindow);
  return { success: true };
});
 
// ── Terminal command execution ──
ipcMain.handle('terminal:run', async (_, cmd) => {
  return new Promise((resolve) => {
    exec(cmd, { timeout: 60000, maxBuffer: 1024 * 1024 * 10 }, (err, stdout, stderr) => {
      resolve({ stdout: stdout || '', stderr: stderr || '', exitCode: err?.code ?? 0, error: err?.message });
    });
  });
});
 
// ── File system helpers ──
ipcMain.handle('fs:readFile',  (_, filePath) => {
  try { return { content: fs.readFileSync(filePath, 'utf8'), error: null }; }
  catch (e) { return { content: null, error: e.message }; }
});
ipcMain.handle('fs:writeFile', (_, filePath, content) => {
  try { fs.writeFileSync(filePath, content, 'utf8'); return { error: null }; }
  catch (e) { return { error: e.message }; }
});
ipcMain.handle('fs:listDir', (_, dirPath) => {
  try {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    return { items: items.map(i => ({ name: i.name, isDir: i.isDirectory() })), error: null };
  } catch (e) { return { items: [], error: e.message }; }
});
 
// ── AI Driver BrowserView ──
function driverBounds({ x, y, width, height }) {
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}
 
ipcMain.handle('driver:init', (_, { url }) => {
  if (!driverView) {
    driverView = new BrowserView({
      webPreferences: { nodeIntegration: false, contextIsolation: true, webSecurity: false },
    });
    driverView.webContents.on('did-finish-load', () => {
      mainWindow?.webContents.send('driver:loaded');
    });
    driverView.webContents.on('did-fail-load', (_, errCode) => {
      if (errCode !== -3) mainWindow?.webContents.send('driver:failed');
    });
  }
  driverView.webContents.loadURL(url);
  return true;
});
 
ipcMain.handle('driver:show', (_, bounds) => {
  if (!driverView) return;
  if (!driverViewAttached) {
    mainWindow.addBrowserView(driverView);
    driverViewAttached = true;
  }
  driverView.setBounds(driverBounds(bounds));
});
 
ipcMain.handle('driver:hide', () => {
  if (driverView && driverViewAttached) {
    mainWindow.removeBrowserView(driverView);
    driverViewAttached = false;
  }
});
 
ipcMain.handle('driver:setBounds', (_, bounds) => {
  if (driverView && driverViewAttached) driverView.setBounds(driverBounds(bounds));
});
 
ipcMain.handle('driver:reload', () => { driverView?.webContents.reload(); });
ipcMain.handle('driver:navigate', (_, url) => { driverView?.webContents.loadURL(url); });
 
// ── OpenHands (Code Bot) BrowserView ──
ipcMain.handle('code:init', (_, { url }) => {
  if (!codeView) {
    codeView = new BrowserView({
      webPreferences: { nodeIntegration: false, contextIsolation: true, webSecurity: false },
    });
    codeView.webContents.on('did-finish-load', () => {
      mainWindow?.webContents.send('code:loaded');
    });
    codeView.webContents.on('did-fail-load', (_, errCode) => {
      if (errCode !== -3) mainWindow?.webContents.send('code:failed');
    });
  }
  codeView.webContents.loadURL(url);
  return true;
});
 
ipcMain.handle('code:show', (_, bounds) => {
  if (!codeView) return;
  if (!codeViewAttached) {
    mainWindow.addBrowserView(codeView);
    codeViewAttached = true;
  }
  codeView.setBounds(driverBounds(bounds));
});
 
ipcMain.handle('code:hide', () => {
  if (codeView && codeViewAttached) {
    mainWindow.removeBrowserView(codeView);
    codeViewAttached = false;
  }
});
 
ipcMain.handle('code:setBounds', (_, bounds) => {
  if (codeView && codeViewAttached) codeView.setBounds(driverBounds(bounds));
});
 
ipcMain.handle('code:reload', () => { codeView?.webContents.reload(); });