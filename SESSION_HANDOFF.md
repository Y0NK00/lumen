# Session handoff — Desktop shell & Claude-style layout

**Last updated:** 2026-05-03  
**Workspace:** `C:\Dev\tower-ai-app`  
**Focus:** `lumen-pwa` — Electron/desktop header: Chat / Cowork / Code + New chat placement vs Claude reference.

---

## Goal (user intent)

Match **Claude desktop** behavior for the **main column chrome**:

1. **Chat / Cowork / Code** and **+ New chat** live in the **main area**, **under** the top toolbar (hamburger, sidebar toggle, search, back/forward), **left-aligned** with that toolbar — not centered in the pane.
2. Controls should read as **integrated app chrome**, not a **small floating card** in empty space.

---

## What was wrong (root causes)

| Problem | Cause in code |
|--------|----------------|
| Block sat in the **center** of the main pane | `DesktopMainHeader` row 2 used a **3-column grid** with the workspace UI in the **center** column (`justify-center`). |
| Block looked like a **detached “island”** | `Layout.tsx` wrapped tabs + New chat in a **`w-fit` + `rounded-2xl` + border + drop-shadow** “card” — visually separate from the toolbar and from the empty `ChatPane` below. |
| **Duplicate New chat** | Sidebar had its own **New chat** row while the main header also had **+ New chat** (Claude stacks it only under the mode tabs in the main column). |

**Left-aligning alone** fixed centering but **not** the “floating widget” look — that required **removing the outer card** and **merging** the header rows visually.

---

## What was implemented (files & behavior)

### `lumen-pwa/src/components/WindowChrome.tsx`

- **`DesktopMainHeader`**
  - **Row 1:** `TopCommandBar` (left) + drag region + `WindowControlButtons`.
  - **Row 2:** **`flex justify-start`** + `px-2` — workspace panel is **flush left**, same horizontal padding as row 1 (no grid centering).
  - Removed **border-t** between row 1 and row 2 so the header reads as **one continuous block** instead of “toolbar | divider | panel.”

### `lumen-pwa/src/components/Layout.tsx`

- **`workspacePanel` prop** to `DesktopMainHeader`:
  - Removed outer **`rounded-2xl` / border / heavy shadow** wrapper.
  - Replaced with a simple **`flex flex-col gap-2 w-full max-w-[420px]`** stack.
  - **`WorkspaceTabs`** (`variant="main"`, `inCard`) — segment control keeps its own surface/inset styling.
  - **+ New chat** button: **`var(--color-surface)`** background so it reads as a row, not nested inside a second frame.

### `lumen-pwa/src/components/Sidebar.tsx`

- Removed the top **NavRow “New chat”** (single entry point is now the main-column button).
- Removed dead code: **`newChatProjectId`**, **`handleNew`**, and unused **`createConversation`** import.

### Build

- **`npm run build`** in `lumen-pwa` succeeds (`tsc && vite build`).

---

## What may still feel “off” vs Claude (not bugs — design deltas)

These are **optional** follow-ups if pixel parity matters:

- **Width:** Workspace stack is **`max-w-[420px]`** — Claude may use a different max width or full-bleed segment bar.
- **Density / typography:** Tab labels, padding, and **selected** tab styling may still differ from Claude.
- **Empty main area:** With no messages, **`ChatPane`** is mostly empty — the header stack will still look small relative to the window; that is expected unless empty-state or layout changes fill the column.
- **Sidebar vs reference:** Sidebar still shows **Projects / Artifacts / Customize / More** — broader product parity is separate from header alignment.

---

## What’s left on the build (broader backlog)

### PWA / UI (see also `UI_HANDOFF.md`)

- Replace **inline `onMouseEnter` / `onMouseLeave`** hover hacks with **Tailwind + CSS variables** where listed.
- **Hardcoded accent hex** in SVGs → `var(--color-accent)`.
- **Sidebar search** placeholder (class-based), duplicate settings control, **aria-labels**, **`div[role=button]` → `<button>`**, etc.

### Product / server (see `LUMEN_BUILD_PLAN.md`)

Examples still accurate at high level: **conversation search** (UI present, not fully wired), **projects/artifacts** depth, **scheduled tasks**, **attachments**, **vault**, etc. — confirm against current `lumen-server` routes when picking up backend work.

### Jarvis / Phase 4

See **`AI_HANDOFF-5-2.md`** — next architectural step called out there: **pywebview** (or similar) desktop shell for HUD.

---

## Quick pointers for the next session

| Topic | Primary files |
|------|----------------|
| Desktop header layout | `lumen-pwa/src/components/WindowChrome.tsx`, `Layout.tsx` |
| Workspace modes & tabs | `lumen-pwa/src/components/WorkspaceTabs.tsx`, `stores/workspaceStore.ts` |
| Command bar / hamburger | `lumen-pwa/src/components/TopCommandBar.tsx` |
| Main chat body | `lumen-pwa/src/components/ChatPane.tsx` |

**Dev:** from repo root, `npm run dev` (or `lumen-pwa`: `npm run dev`); Electron if using `electron:dev` per package scripts.

---

## Related docs in this repo

| File | Purpose |
|------|---------|
| `AI_HANDOFF-5-2.md` | Full project orientation, deploy, API, tripwires, Jarvis |
| `UI_HANDOFF.md` | PWA UI cleanup checklist (hover, a11y, sidebar) |
| `LUMEN_BUILD_PLAN.md` | Long-term build status and startup prompt block |
| `CHANGELOG.md` | Dated change log entries |
