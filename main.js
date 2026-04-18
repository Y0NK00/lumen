const { app, BrowserWindow, BrowserView, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');                          // sync fs — used by readJSON/writeJSON
const { exec, spawn } = require('child_process');
const { google } = require('googleapis');
const { WebSocketServer } = require('ws');         // Phase 5: browser extension bridge
 
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
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1000,
    minHeight: 640,
    frame: false,
    backgroundColor: '#0f0f0f',
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
    mainWindow.loadFile(path.join(__dirname, 'dist', 'renderer', 'index.html'));
  } else {
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  }
 
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
        const content = await fs.promises.readFile(input.path, 'utf8')
        return { success: true, result: content }
      }
 
      case 'write_file': {
        await fs.promises.writeFile(input.path, input.content, 'utf8')
        return {
          success: true,
          result: `Wrote ${input.content.length} characters to ${input.path}`,
        }
      }
 
      case 'list_dir': {
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
 
const claudeStreams = new Map()
 
ipcMain.on('claude-stream-start', async (event, { requestId, messages, model, apiKey }) => {
  const controller = new AbortController()
  claudeStreams.set(requestId, controller)
 
  try {
    let conversationMessages = [...messages]
 
    while (true) {
      if (controller.signal.aborted) {
        event.sender.send('claude-done', { requestId })
        break
      }
 
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          accept: 'text/event-stream',
        },
        body: JSON.stringify({
          model,
          messages: conversationMessages,
          max_tokens: 4096,
          stream: true,
          tools: CLAUDE_TOOLS,
        }),
        signal: controller.signal,
      })
 
      if (!response.ok) {
        const errorText = await response.text()
        event.sender.send('claude-error', {
          requestId,
          message: `Claude API ${response.status}: ${errorText}`,
        })
        return
      }
 
      if (!response.body) {
        event.sender.send('claude-error', { requestId, message: 'No response body' })
        return
      }
 
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      const contentBlocks = new Map()
      let stopReason = null
      let assistantTextAccumulated = ''
 
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
            case 'content_block_start': {
              const block = data.content_block
              if (block.type === 'text') {
                contentBlocks.set(data.index, { type: 'text', text: '' })
              } else if (block.type === 'tool_use') {
                contentBlocks.set(data.index, {
                  type: 'tool_use',
                  id: block.id,
                  name: block.name,
                  inputJson: '',
                })
                event.sender.send('claude-tool-start', {
                  requestId,
                  toolId: block.id,
                  toolName: block.name,
                })
              }
              break
            }
 
            case 'content_block_delta': {
              const block = contentBlocks.get(data.index)
              if (!block) break
 
              if (data.delta.type === 'text_delta' && block.type === 'text') {
                block.text += data.delta.text
                assistantTextAccumulated += data.delta.text
                event.sender.send('claude-chunk', { requestId, text: data.delta.text })
              } else if (data.delta.type === 'input_json_delta' && block.type === 'tool_use') {
                block.inputJson += data.delta.partial_json
              }
              break
            }
 
            case 'message_delta': {
              if (data.delta?.stop_reason) stopReason = data.delta.stop_reason
              break
            }
 
            case 'message_stop': {
              break streamLoop
            }
 
            case 'error': {
              event.sender.send('claude-error', {
                requestId,
                message: data.error?.message ?? 'Unknown API error',
              })
              claudeStreams.delete(requestId)
              return
            }
          }
        }
      }
 
      // Build assistant turn for conversation history
      const assistantContentBlocks = []
      if (assistantTextAccumulated) {
        assistantContentBlocks.push({ type: 'text', text: assistantTextAccumulated })
      }
 
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
 
      // Execute tools if Claude requested them
      if (stopReason === 'tool_use' && toolUseBlocks.length > 0) {
        const toolResultBlocks = []
 
        for (const tool of toolUseBlocks) {
          const toolExecution = await executeTool(tool.name, tool.input)
          const { success, result } = toolExecution
 
          // Send result to renderer for the tool card UI
          event.sender.send('claude-tool-result', {
            requestId,
            toolId: tool.id,
            toolName: tool.name,
            input: tool.input,
            result,
            success,
            imageDataUrl: toolExecution.imageDataUrl ?? null, // for screenshot display in UI
          })
 
          // Screenshots go to Claude as image vision blocks so it can SEE them
          if (toolExecution.imageBase64) {
            toolResultBlocks.push({
              type: 'tool_result',
              tool_use_id: tool.id,
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: 'image/png',
                    data: toolExecution.imageBase64,
                  },
                },
                { type: 'text', text: 'Screenshot captured. Analyze the image above.' },
              ],
            })
          } else {
            toolResultBlocks.push({
              type: 'tool_result',
              tool_use_id: tool.id,
              content: result,
            })
          }
        }
 
        conversationMessages.push({ role: 'user', content: toolResultBlocks })
        continue // Loop — Claude will respond to tool results
      }
 
      // No tool calls — we're done
      event.sender.send('claude-done', { requestId })
      claudeStreams.delete(requestId)
      return
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      event.sender.send('claude-done', { requestId })
    } else {
      event.sender.send('claude-error', {
        requestId,
        message: err.message ?? 'Unknown error',
      })
    }
  } finally {
    claudeStreams.delete(requestId)
  }
})
 
ipcMain.on('claude-stream-abort', (event, { requestId }) => {
  const controller = claudeStreams.get(requestId)
  if (controller) {
    controller.abort()
    claudeStreams.delete(requestId)
  }
})
 
// =============================================================================
// App lifecycle
// =============================================================================
 
app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
 
// ── Window controls ──
ipcMain.on('win:minimize', () => mainWindow?.minimize());
ipcMain.on('win:maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize());
ipcMain.on('win:close',    () => mainWindow?.close());
 
// ── Data persistence ──
ipcMain.handle('data:loadConversations', () => readJSON(conversationsFile, []));
ipcMain.handle('data:saveConversations', (_, v) => { writeJSON(conversationsFile, v); return true; });
ipcMain.handle('data:loadSettings',      () => readJSON(settingsFile, null));
ipcMain.handle('data:saveSettings',      (_, v) => { writeJSON(settingsFile, v); return true; });
ipcMain.handle('data:loadConnectors',    () => readJSON(connectorsFile, {}));
ipcMain.handle('data:saveConnectors',    (_, v) => { writeJSON(connectorsFile, v); return true; });
 
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