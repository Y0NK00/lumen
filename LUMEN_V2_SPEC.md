# Lumen v2 Architecture Spec

**Author:** Claude (drafted with Will)
**Date:** 2026-04-17
**Status:** Draft — awaiting Will's approval on open decisions at the bottom

---

## 1. Goal (one paragraph)

Rebuild the **renderer** of Lumen as a modern React + Tailwind + shadcn/ui application with a real design system, so that the app feels like Claude instead of a homebrew Electron tool. Keep the Electron main process, preload bridge, and all backend integrations (Ollama, Skyvern, OpenHands, n8n, Google OAuth) unchanged. The pivot is visual and structural at the UI layer only — we are not rewriting the app, we are rewriting the front face of the app.

---

## 2. What stays vs what changes

| Layer | v1 file | v2 status |
|---|---|---|
| Electron main process | `main.js` | **Stays as-is**. 262 clean lines, no reason to touch it. |
| IPC bridge | `preload.js` | **Stays as-is**. 52 lines, well-organized, exposes `window.tower.*` surface that v2 renderer will consume identically. |
| OAuth config | `oauth.config.json` | **Stays as-is**. |
| n8n workflow JSON | existing files | **Stays as-is**. |
| Renderer HTML | `renderer/index.html` (85KB) | **Replaced**. Single root `<div id="root">` instead. |
| Renderer CSS | `renderer/style.css` (53KB) | **Replaced**. Tailwind + tokens extracted from existing themes. |
| Renderer JS | `renderer/app.js` (116KB / 2545 lines) | **Replaced**. React components + Zustand stores. |
| Build config | none (Electron loads raw files) | **Added**. Vite + electron-vite config. |
| Theme tokens | inline in `style.css` | **Migrated** to Tailwind config + CSS custom properties for theme swapping. |

**Net code delta:** we delete ~3 files, add ~40 React component files + config + tokens. Same total line count, radically different structure.

---

## 3. Target stack

| Choice | Library | Version | Why |
|---|---|---|---|
| UI framework | **React 18** | ^18.3 | Reactive updates eliminate the manual `renderSidebar()` / `renderMessages()` calls that currently cause layout jank. Standard choice, huge ecosystem, easy to hire/onboard. |
| Build tool | **Vite** | ^5 | Instant HMR during dev. 10x faster than webpack. Standard for React in 2026. |
| Electron glue | **electron-vite** | ^2 | Wraps Vite + Electron into one config. Handles main/preload/renderer build targets so we don't hand-roll it. |
| Styling | **Tailwind CSS** | ^3.4 | Utility-first. Eliminates the scattered-CSS problem by forcing consistent spacing/color tokens at the class level. |
| Component primitives | **shadcn/ui** | latest | Not a library — copy-pasted accessible components (Button, Dialog, ScrollArea, Command, etc). We own the code, style it with Tailwind, matches Claude aesthetic out of the box. |
| Icons | **lucide-react** | ^0.400 | Same icon family Claude uses. Replaces the inline SVGs scattered across v1. |
| State management | **Zustand** | ^4.5 | Small, no providers, direct subscribe API. Perfect fit for Electron apps where we want observable global state without Redux ceremony. |
| Markdown rendering | **react-markdown** + **remark-gfm** + **rehype-highlight** | latest | Proper markdown with tables, task lists, syntax-highlighted code blocks. Replaces the homegrown `mdToHtml()` helper. |
| Streaming chat | native `fetch` with `ReadableStream` + custom hook | n/a | Keep the existing Ollama streaming call pattern, wrap in `useOllamaStream` React hook. |
| Animation | **framer-motion** | ^11 | Subtle tab transitions, message enter animations. Sparingly. |
| TypeScript | **TypeScript** | ^5.4 | Strongly recommend. Catches 80% of the "where did this field come from" bugs that plague vanilla JS Electron apps. |

**Total bundle size estimate:** ~450KB gzipped. Fine for Electron (runs locally, no network cost).

---

## 4. Directory structure after v2

```
tower-ai-app/
├── main.js                          # UNCHANGED
├── preload.js                       # UNCHANGED
├── oauth.config.json                # UNCHANGED
├── package.json                     # Updated: adds deps, adds `dev` and `build` scripts
├── electron.vite.config.ts          # NEW: electron-vite config
├── tailwind.config.ts               # NEW: tokens + content globs
├── tsconfig.json                    # NEW
├── tsconfig.node.json               # NEW
├── src/                             # NEW renderer root (replaces `renderer/`)
│   ├── main.tsx                     # React entry point
│   ├── App.tsx                      # Root component
│   ├── index.css                    # Tailwind imports + theme CSS vars
│   │
│   ├── components/
│   │   ├── ui/                      # shadcn primitives (Button, Dialog, etc)
│   │   ├── layout/
│   │   │   ├── AppShell.tsx         # Sidebar + main + titlebar
│   │   │   ├── Titlebar.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── MainPanel.tsx
│   │   ├── chat/
│   │   │   ├── ChatView.tsx         # Orchestrates conversation
│   │   │   ├── MessageList.tsx
│   │   │   ├── Message.tsx
│   │   │   ├── MessageMarkdown.tsx  # react-markdown wrapper
│   │   │   ├── Composer.tsx         # Input area
│   │   │   ├── ModelSelector.tsx
│   │   │   ├── WelcomeScreen.tsx
│   │   │   └── PromptSuggestions.tsx
│   │   ├── tools/                   # NEW: inline tool invocations
│   │   │   ├── ToolInvocation.tsx   # Base wrapper
│   │   │   ├── DriverTool.tsx       # Skyvern integration UI
│   │   │   ├── CodeTool.tsx         # OpenHands integration UI
│   │   │   ├── BrowserTool.tsx      # Chrome integration UI
│   │   │   └── TerminalTool.tsx
│   │   ├── sidebar/
│   │   │   ├── ConversationList.tsx
│   │   │   ├── ConversationItem.tsx
│   │   │   ├── ProjectList.tsx
│   │   │   └── SearchBar.tsx
│   │   └── settings/
│   │       ├── SettingsModal.tsx
│   │       ├── GeneralTab.tsx
│   │       ├── AppearanceTab.tsx
│   │       ├── CapabilitiesTab.tsx
│   │       ├── ConnectorsTab.tsx
│   │       ├── SkillsTab.tsx
│   │       ├── MemoryTab.tsx
│   │       └── DataPrivacyTab.tsx
│   │
│   ├── hooks/
│   │   ├── useOllamaStream.ts       # Streaming chat hook
│   │   ├── useClaudeAPI.ts          # Anthropic SDK wrapper
│   │   ├── useOpenRouter.ts
│   │   ├── useSettings.ts
│   │   ├── useConversations.ts
│   │   ├── useTheme.ts
│   │   └── useKeyboardShortcuts.ts
│   │
│   ├── stores/                      # Zustand stores
│   │   ├── conversationStore.ts
│   │   ├── settingsStore.ts
│   │   ├── connectorStore.ts
│   │   ├── projectStore.ts
│   │   ├── skillStore.ts
│   │   └── memoryStore.ts
│   │
│   ├── lib/
│   │   ├── ollama.ts                # API client
│   │   ├── anthropic.ts             # API client
│   │   ├── openrouter.ts            # API client
│   │   ├── ipc.ts                   # Typed wrapper around window.tower
│   │   ├── utils.ts                 # cn(), formatters, etc
│   │   └── markdown.ts              # react-markdown config
│   │
│   └── types/
│       ├── conversation.ts
│       ├── settings.ts
│       ├── message.ts
│       └── ipc.ts                   # Window.tower type definitions
│
├── public/
│   ├── mascot.svg                   # Smaller, refined lightbulb
│   └── fonts/
│
└── dist/                            # Build output (gitignored)
```

---

## 5. Component hierarchy (runtime tree)

```
<App>
  <ThemeProvider>
    <AppShell>
      <Titlebar>
        <AppLogo />
        <WindowControls />
      </Titlebar>

      <div className="flex flex-1">
        <Sidebar>
          <NewChatButton />
          <SearchBar />
          <ProjectList />
          <ConversationList>
            <ConversationGroup label="Today">
              <ConversationItem />...
            </ConversationGroup>
            <ConversationGroup label="Yesterday">...</ConversationGroup>
            ...
          </ConversationList>
          <UserFooter>
            <UserAvatar />
            <SettingsButton />
          </UserFooter>
        </Sidebar>

        <MainPanel>
          <ChatView>
            {conversation.messages.length === 0 ? (
              <WelcomeScreen>
                <Mascot size="sm" />
                <Greeting name={user.name} />
                <PromptSuggestions />
              </WelcomeScreen>
            ) : (
              <MessageList>
                <Message role="user" />
                <Message role="assistant">
                  <MessageMarkdown />
                  <ToolInvocation type="driver" />  {/* inline */}
                </Message>
                ...
              </MessageList>
            )}
            <Composer>
              <FileAttachments />
              <ComposerTextarea />
              <ModelSelector />
              <SkillPicker />
              <SendButton />
            </Composer>
          </ChatView>
        </MainPanel>
      </div>

      <SettingsModal />  {/* shadcn Dialog, shows on demand */}
      <CommandPalette />  {/* shadcn Command, Cmd+K */}
    </AppShell>
  </ThemeProvider>
</App>
```

**Key structural change from v1:** No `<ModeTabs>` at the top. Chat is the root view. Driver / Code / Browser are tools invoked *within* a chat message, rendered inline via `<ToolInvocation>`. This is the Claude pattern (artifacts, code execution, web search are inline tool results, not separate pages).

---

## 6. Design tokens

Port your existing themes into Tailwind config + CSS custom properties. Themes stay, they just become disciplined.

### Color tokens (CSS vars per theme)

```css
/* tower-dark (default) */
:root[data-theme="tower-dark"] {
  --color-bg-app: 15 15 15;          /* #0f0f0f */
  --color-bg-sidebar: 23 23 23;
  --color-bg-panel: 15 15 15;
  --color-bg-surface: 26 26 26;      /* cards */
  --color-bg-input: 30 30 30;
  --color-bg-hover: 37 37 37;
  --color-bg-active: 46 46 46;

  --color-text-primary: 236 236 236;
  --color-text-secondary: 136 136 136;
  --color-text-muted: 85 85 85;

  --color-accent: 217 119 6;         /* orange */
  --color-accent-hover: 245 158 11;
  --color-accent-foreground: 255 255 255;

  --color-border: 255 255 255 / 0.07;
  --color-border-strong: 255 255 255 / 0.13;

  --color-user-msg-bg: 28 48 80;     /* subtle blue */
  --color-code-bg: 13 17 23;
}
```

Tailwind config reads these via `bg-app`, `text-primary`, `border-strong`, etc. Switching themes = toggling `data-theme` on `<html>`. Same pattern as v1, cleaner implementation.

### Spacing scale (Tailwind default + custom)

Standard Tailwind 4/8/12/16/20/24/32/48/64px. No custom values. This alone fixes 70% of the "feels inconsistent" issue — every spacing value in the app becomes one of 8 canonical numbers.

### Typography scale

| Token | Size | Line height | Weight | Usage |
|---|---|---|---|---|
| `text-xs` | 11px | 16px | 500 | Captions, timestamps |
| `text-sm` | 13px | 20px | 400 | Sidebar items, labels |
| `text-base` | 14px | 22px | 400 | **Chat body (default)** |
| `text-lg` | 16px | 24px | 400 | Emphasized body |
| `text-xl` | 18px | 26px | 500 | Section headings |
| `text-2xl` | 22px | 30px | 600 | Welcome screen heading |
| `text-3xl` | 28px | 36px | 700 | Rare, settings page titles |

Single font stack: `Inter` via `fontsource`, with system fallback. Matches Claude.

### Border radius scale

`sm` 4px, `md` 6px, `lg` 8px, `xl` 12px, `2xl` 16px, `full` pill. Buttons use `md`. Cards use `lg`. Pills are `full`. Stop mixing arbitrary 5px/7px/8px values.

---

## 7. State management (Zustand stores)

Port the current `state` object into discrete stores. Each store is independently subscribable and persisted to disk via the existing IPC channels.

```ts
// stores/conversationStore.ts
interface ConversationStore {
  conversations: Conversation[];
  currentId: string | null;
  searchQuery: string;
  activeProject: string | null;

  // Actions
  newConversation: () => void;
  loadConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  renameConversation: (id: string, title: string) => void;
  addMessage: (convId: string, msg: Message) => void;

  // Persistence (wired via useEffect in App.tsx)
  hydrate: () => Promise<void>;
  persist: () => Promise<void>;
}
```

Six stores total (conversation, settings, connector, project, skill, memory). Each ~50-80 lines. Replaces the global `state` object and its ad-hoc `save()` / `render*()` pattern.

---

## 8. IPC bridge — preserved exactly

v2 consumes `window.tower.*` identically to v1. We add one thin typed wrapper for ergonomics:

```ts
// lib/ipc.ts
export const ipc = {
  window: { minimize, maximize, close },
  data: {
    conversations: { load, save },
    settings: { load, save },
    connectors: { load, save },
  },
  terminal: { run },
  fs: { readFile, writeFile, listDir },
  google: { connect, onConnected, onError },
  driver: { init, show, hide, setBounds, reload, navigate, onLoaded, onFailed },
  code: { init, show, hide, setBounds, reload, onLoaded, onFailed },
};
```

**No changes to `preload.js`.** If we add new IPC channels later (e.g. for Claude API key storage in OS keychain), that's a v2.1 concern.

---

## 9. Feature-parity checklist

v2 must match every capability of v1 before we ship. Nothing regresses.

### Chat
- [ ] Streaming responses (Ollama + Claude + OpenRouter)
- [ ] Non-streaming fallback
- [ ] Stop generation mid-stream
- [ ] Model selector per conversation
- [ ] Markdown rendering (tables, lists, code blocks, inline code, headings, bold, italic, links, task lists)
- [ ] Syntax-highlighted code blocks with copy button
- [ ] Image attachments (llava vision passthrough)
- [ ] File text attachments (drag-and-drop into composer)
- [ ] Conversation auto-titling from first user message
- [ ] Copy message button

### Sidebar
- [ ] New chat button
- [ ] Search conversations (title + content)
- [ ] Conversation groups by time (Today / Yesterday / This week / Earlier)
- [ ] Double-click to rename
- [ ] Delete confirmation
- [ ] Assign conversation to project
- [ ] Projects section with CRUD

### Settings
- [ ] All profile fields
- [ ] Server URL config (Ollama, Skyvern, OpenHands)
- [ ] Cloud API keys (OpenRouter, Anthropic) stored locally
- [ ] Theme picker (6 themes)
- [ ] Font picker (4 fonts)
- [ ] Font size slider
- [ ] Accent color picker (8 presets + custom)
- [ ] Text color override
- [ ] Streaming toggle
- [ ] Memory toggle + memory management
- [ ] Obsidian integration toggle
- [ ] Voice TTS toggle + voice picker
- [ ] Desktop notifications
- [ ] n8n mobile webhook config
- [ ] Connector status (10 connectors)
- [ ] Skills CRUD (built-in + custom)

### Tools (reimagined as inline invocations)
- [ ] Driver (Skyvern) — inline task card, status, links to full Skyvern UI on demand
- [ ] Code (OpenHands) — inline task card, with "open full interface" button
- [ ] Terminal — inline REPL widget in chat
- [ ] Chrome — inline browser panel with AI assistant co-located

### Persistence
- [ ] All state saves to Electron userData (existing paths preserved)
- [ ] Import/export settings as JSON

### Window
- [ ] Frameless window with custom titlebar
- [ ] Drag region
- [ ] Min/max/close controls
- [ ] Remembers size/position across restarts

---

## 10. Migration plan (4 phases, weekend-scoped)

### Phase 1 — Scaffold (Weekend 1, ~6 hours)
**Goal:** new repo structure, v2 boots, empty shell rendering.

- Create new branch `v2` off `master`
- Add electron-vite, Tailwind, shadcn/ui, Zustand
- Update `main.js` to load from Vite dev server in dev mode (one-line change to `mainWindow.loadURL`)
- Scaffold `src/main.tsx`, `App.tsx`, empty `AppShell`
- Port theme CSS vars into Tailwind config
- `npm run dev` → sees a blank dark window with titlebar
- **Exit criteria:** Electron opens, React renders "hello", HMR works.

### Phase 2 — Chat core (Weekend 2, ~8 hours)
**Goal:** the chat actually works.

- Build `ChatView`, `MessageList`, `Message`, `Composer`, `ModelSelector`
- Wire `useOllamaStream` hook, port streaming logic
- Wire `conversationStore`, hydrate from `window.tower.loadConversations()`
- Markdown rendering with react-markdown + syntax highlighting
- Sidebar `ConversationList` with grouping
- **Exit criteria:** I can have a streaming chat with Ollama, conversations persist, sidebar updates live.

### Phase 3 — Settings + Tools (Weekend 3, ~8 hours)
**Goal:** feature parity minus polish.

- `SettingsModal` with all 7 tabs
- Port every setting, every toggle
- Claude API + OpenRouter integration via `useClaudeAPI`, `useOpenRouter`
- Reimagine Driver/Code/Browser as inline tool invocations
- Command palette (Cmd+K) for quick actions
- **Exit criteria:** feature-parity checklist is green.

### Phase 4 — Polish + ship (Weekend 4, ~6 hours)
**Goal:** the "feels like Claude" pass.

- Welcome screen with greeting ("Good afternoon, Will")
- Empty states across the app (consistent typography-first, no giant mascots)
- Message enter animations (framer-motion, subtle)
- Syntax highlight theme tuning
- Keyboard shortcuts (Cmd+Enter send, Cmd+K palette, Cmd+, settings, Cmd+N new chat)
- Final accessibility pass (focus rings, ARIA labels)
- Build Windows installer
- Update README + LUMEN_FEATURE_GUIDE
- Merge `v2` → `master`, tag `v2.0.0`
- Push to public GitHub
- **Exit criteria:** screenshots of v2 side-by-side with Claude look like cousins, not strangers.

**Total:** 4 weekends, ~28 hours of focused work.

---

## 11. Out of scope for v2 (defer to v2.1+)

- Rewriting Skyvern/OpenHands integrations to not use BrowserView (keep embedded views, just wrap them nicer)
- Plugin system for custom panels
- iOS/Android companion app
- Conversation export to PDF/Markdown
- Prompt library / starred prompts
- Multi-window support

---

## 12. Open decisions — need Will's call

### Decision 1: TypeScript or plain JavaScript?

| | TypeScript | Plain JS |
|---|---|---|
| Setup time | +30 min initial | 0 |
| Catches typos/shape errors | Yes, at compile time | Only at runtime |
| Hiring story for Anthropic | **Stronger** (industry standard) | Weaker |
| Learning curve for Will | Moderate (you'll learn as you go) | None |

**My recommendation:** TypeScript. The learning cost is low, the payoff for a multi-weekend project is huge, and it tells Anthropic reviewers "this person ships real software."

### Decision 2: Branch strategy

- **Option A:** `v2` branch on existing repo, merge to master when done
- **Option B:** Keep v1 on `master`, new repo `lumen-v2` for the rewrite

**My recommendation:** Option A. Preserves history, lets you `git diff master v2` to see the scope, and a single repo tells a cleaner story on your GitHub.

### Decision 3: Keep the mascot or ditch it?

The lightbulb has personality. But it currently dominates the welcome screen at ~200px.

- **Option A:** Keep it, shrink to 40px, show only on empty states
- **Option B:** Keep at medium size (80px), add subtle breathing animation
- **Option C:** Retire it, go full Claude-minimalist

**My recommendation:** Option A. Identity without clutter.

### Decision 4: Tool invocation UX

When you ask Lumen "go apply to this job," the AI should invoke the Driver tool. How does the tool result render?

- **Option A:** Inline card in the message (like Claude's artifacts)
- **Option B:** Side panel that slides in from the right
- **Option C:** Full-screen overlay

**My recommendation:** Option A. Keeps the chat central, matches Claude, scales to many tools without a UI explosion.

---

## 13. Success criteria

v2 ships when:

1. All items in section 9 feature-parity checklist are checked
2. Side-by-side screenshots of Lumen v2 chat and Claude chat look like the same design family
3. First-token latency from Ollama feels <1 second on qwen2.5:14b (measure it)
4. Repo is public on GitHub with a real README, screenshots, install instructions
5. You use it daily as your primary AI chat app

---

## 14. Next session kickoff

When you're ready to start Phase 1, the session prompt is:

> Starting Lumen v2 scaffold. Decisions I've made: [TypeScript yes/no], [branch strategy], [mascot treatment], [tool UX]. Repo is moved to `C:\Dev\tower-ai-app`. Let's scaffold the electron-vite + React + Tailwind project.

I'll take it from there — package.json edits, config files, first React components.
