# Lumen PWA — UI Cleanup Handoff
**Date:** 2026-05-03  
**Project:** `C:\Dev\tower-ai-app\lumen-pwa\`  
**Status:** App works correctly. UI has several fixable issues detailed below.

---

## Desktop shell — Claude-style main header (done 2026-05-03)

**Full write-up:** repo root **`SESSION_HANDOFF.md`**.

**Summary:** The **Chat / Cowork / Code** strip and **+ New chat** are rendered by **`Layout.tsx`** as the `workspacePanel` child of **`DesktopMainHeader`** in **`WindowChrome.tsx`** (desktop only, `sm+`). Iterations fixed: (1) **centered** grid → **left-aligned** `flex justify-start`, (2) removed **outer rounded card** (border/shadow) so controls sit on the **same chrome plane** as the toolbar row, (3) removed **duplicate “New chat”** from **`Sidebar.tsx`**. **`npm run build`** in `lumen-pwa` passes.

**Optional follow-ups:** Tweak **`max-w-[420px]`**, tab density, or full-bleed segment bar if matching Claude pixels exactly; empty chat still shows a large dark **`ChatPane`** below the header — expected until content or empty-state design fills it.

---

## Cursor vs Claude — Which to Use

**Use Cursor** for this work. Reasons:
- Most fixes are systematic find-replace patterns across multiple files (hover states, hardcoded colors, aria-labels)
- You need the dev server running (`npm run dev` from root) to see changes as you make them
- Cursor can see all files simultaneously and do multi-file edits in one pass

**Use Claude** only if you want to redesign a full component from scratch (e.g., completely rethink the Settings layout). For the fixes below, Cursor is the right tool.

**Dev server command:**
```bash
# From C:\Dev\tower-ai-app (project root)
npm run dev
# Opens: http://localhost:5173 and Electron window
```

---

## Issue 1 — Inline JS Hover States (All Files)

**The problem:** Every interactive element uses `onMouseEnter`/`onMouseLeave` with direct `e.currentTarget.style.X = value` manipulation. This is ~25+ instances across the codebase. It's fragile, misses keyboard/focus states, and is hard to maintain.

**Files affected:**
- `src/components/Layout.tsx` — lines 100–101, 132–133
- `src/components/Sidebar.tsx` — lines 159–160, 278–289, 300–301, 348–349, 381–382
- `src/components/MessageList.tsx` — lines 22–25, 145–151
- `src/components/InputBox.tsx` — lines 126–127

**Fix pattern:** Replace all `onMouseEnter`/`onMouseLeave` pairs with Tailwind CSS hover classes using CSS variable references.

Before (Layout.tsx hamburger button):
```tsx
<button
  className="w-9 h-9 flex items-center justify-center rounded-xl transition-colors"
  style={{ color: 'var(--color-text-muted)' }}
  onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-text-primary)'; e.currentTarget.style.background = 'var(--color-surface-hover)' }}
  onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-muted)'; e.currentTarget.style.background = 'transparent' }}
>
```

After:
```tsx
<button
  className="w-9 h-9 flex items-center justify-center rounded-xl transition-colors
             text-[--color-text-muted] hover:text-[--color-text-primary] hover:bg-[--color-surface-hover]"
>
```

**Note:** Tailwind 4 supports `text-[--color-text-muted]` syntax directly referencing CSS variables. This works for `text-`, `bg-`, `border-`, `fill-`, `stroke-` etc.

**Do this for every `onMouseEnter`/`onMouseLeave` pair in the codebase.** The conversation list item hover in Sidebar.tsx is slightly different because it also needs to respect the active state — keep the `style` for `background` there but remove the mouse event handlers:

```tsx
// Sidebar.tsx conversation item — keep inline style, remove mouse events
<div
  className="group relative flex items-center mx-2 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-150 select-none hover:bg-[--color-surface] hover:text-[--color-text-primary]"
  style={{
    background: conv.id === activeId ? 'var(--color-surface-active)' : undefined,
    color: conv.id === activeId ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
  }}
  // remove onMouseEnter and onMouseLeave entirely
>
```

---

## Issue 2 — Hardcoded Hex Colors in SVGs

**The problem:** The Lumen hexagon SVG in `LumenAvatar`, the empty state, and the Sidebar header uses hardcoded `#8b5cf6` instead of `var(--color-accent)`. If the user switches themes, the SVG stays purple even when the accent is a different color.

**Files affected:**
- `src/components/MessageList.tsx` — lines 41, 42, 122, 123
- `src/components/Sidebar.tsx` — lines 145, 146

**Fix:** Replace every `stroke="#8b5cf6"` and `fill="#8b5cf6"` with `stroke="var(--color-accent)"` and `fill="var(--color-accent)"`.

Before:
```tsx
<path d="M10 2L17 6V14L10 18L3 14V6L10 2Z" stroke="#8b5cf6" strokeWidth="1.8" strokeLinejoin="round"/>
<circle cx="10" cy="10" r="2.5" fill="#8b5cf6"/>
```

After:
```tsx
<path d="M10 2L17 6V14L10 18L3 14V6L10 2Z" stroke="var(--color-accent)" strokeWidth="1.8" strokeLinejoin="round"/>
<circle cx="10" cy="10" r="2.5" fill="var(--color-accent)"/>
```

Also check `src/components/InputBox.tsx` and `src/components/ChatPane.tsx` for any hardcoded hex colors in SVGs.

---

## Issue 3 — Broken Placeholder CSS in Sidebar Search

**The problem:** `Sidebar.tsx` line 231 has:
```tsx
style={{
  color: 'var(--color-text-primary)',
  // @ts-ignore
  '::placeholder': { color: 'var(--color-text-muted)' },
}}
```
This doesn't work. Inline styles cannot target pseudo-elements. The `@ts-ignore` is a red flag that this was known to be wrong.

**File:** `src/components/Sidebar.tsx` — lines 228–233

**Fix:** Remove the broken inline style and add a real CSS class. Add this to `src/index.css` or `src/globals.css`:
```css
.sidebar-search::placeholder {
  color: var(--color-text-muted);
  opacity: 1;
}
```

Then update the input:
```tsx
<input
  type="text"
  placeholder="Search…"
  value={search}
  onChange={(e) => setSearch(e.target.value)}
  className="flex-1 bg-transparent text-[13px] outline-none text-[--color-text-primary] sidebar-search"
/>
```

---

## Issue 4 — Duplicate Settings Buttons in Sidebar Footer

**The problem:** `Sidebar.tsx` footer has TWO elements that both open Settings — the user name button (lines 345–373) and the gear icon button (lines 376–388). This is redundant and confusing.

**File:** `src/components/Sidebar.tsx` — lines 344–390

**Fix:** Remove the separate gear icon button. The user profile row already opens settings. Keep the user row, delete the gear button entirely:
```tsx
// DELETE these lines (376–388):
<button
  onClick={onSettings}
  title="Settings"
  className="w-8 h-8 flex items-center justify-center rounded-xl transition-colors shrink-0"
  ...
>
  <svg ...gear icon... />
</button>
```

Alternatively, keep the gear and make the user row navigate to a profile sub-page instead of settings — but removing the duplicate is the quick win.

---

## Issue 5 — Nav Tabs Showing Disabled Features

**The problem:** `Sidebar.tsx` shows 5 nav tabs (Chats, Projects, Artifacts, Code, Dispatch) but 4 of them are disabled with `opacity: 0.45` and open a "Coming soon" pane. This pollutes the UI with placeholder UI that users will click and see dead ends.

**File:** `src/components/Sidebar.tsx` — lines 36–84, 178–204

**Fix option A (simple):** Remove the nav tabs entirely until the features are built. Just show the Chats content directly without the tab row.

**Fix option B (clean):** Keep only the Chats tab for now and hide the others. Change the NAV_ITEMS array to only include Chats:
```tsx
const NAV_ITEMS = [
  { id: 'chats', label: 'Chats', icon: <...chat icon...> },
  // add others back when they're implemented
]
```
And remove the `isLive` conditional logic since there's only one tab.

---

## Issue 6 — Missing aria-labels on Icon-Only Buttons

**The problem:** Every icon-only button lacks an `aria-label`. Screen readers and accessibility tools will announce these as generic "button" with no context. There are ~15+ affected buttons.

**Files affected:** All component files

**Complete list of buttons needing `aria-label`:**
- `Layout.tsx` — hamburger button ("Open menu"), new chat button ("New conversation")
- `Sidebar.tsx` — new chat button ("New conversation"), delete conversation button ("Delete conversation"), settings gear ("Open settings")
- `InputBox.tsx` — system prompt button ("Set system prompt"), voice button ("Start voice input" / "Stop voice input"), send button ("Send message"), stop button ("Stop generating")
- `MessageList.tsx` — ResendButton ("Resend message"), code block copy button ("Copy code")

**Fix:** Add `aria-label` to each. Example:
```tsx
<button
  aria-label="Open menu"
  onClick={() => setSidebarOpen(true)}
  className="..."
>
```

For the voice button, make it dynamic:
```tsx
<button
  aria-label={isListening ? 'Stop listening' : 'Start voice input'}
  ...
>
```

---

## Issue 7 — Conversation List Items Should Be `<button>` Not `<div role="button">`

**The problem:** `Sidebar.tsx` conversation list items use `<div role="button" tabIndex={0}>`. This requires manually handling `onKeyDown` for accessibility and is semantically incorrect.

**File:** `src/components/Sidebar.tsx` — lines 266–309

**Fix:** Replace the outer `<div role="button">` with a `<button>` element. The inner delete button stays as-is.
```tsx
<button
  key={conv.id}
  onClick={() => handleSelect(conv.id)}
  className="group relative flex items-center w-full text-left mx-2 px-3 py-2.5 rounded-xl ..."
  style={{ ... }}
>
  {/* title and delete button stay the same */}
</button>
```
Remove the `role="button"`, `tabIndex={0}`, and `onKeyDown` — native `<button>` handles all of that.

---

## Issue 8 — LumenAvatar SVG Color Needs currentColor

**The problem:** `LumenAvatar` in `MessageList.tsx` wraps the SVG in a div but hardcodes the SVG colors. If you want to adjust the avatar color via CSS, you can't.

**File:** `src/components/MessageList.tsx` — lines 36–46

**Fix:** Use `currentColor` on SVG strokes and fills, then set the color on the wrapper div:
```tsx
function LumenAvatar() {
  return (
    <div
      className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
      style={{
        background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
        border: '1px solid color-mix(in srgb, var(--color-accent) 22%, transparent)',
        color: 'var(--color-accent)',  // ADD THIS
      }}
    >
      <svg width="11" height="11" viewBox="0 0 20 20" fill="none">
        <path d="M10 2L17 6V14L10 18L3 14V6L10 2Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
        <circle cx="10" cy="10" r="2.5" fill="currentColor"/>
      </svg>
    </div>
  )
}
```

---

## Issue 9 — Send Button Indentation Bug

Minor code quality issue. `InputBox.tsx` lines 197–206: the `style` prop is indented inconsistently compared to `className`. Not a runtime bug, just messy. Fix the alignment.

---

## Summary: Priority Order

| # | Issue | Files | Effort | Impact |
|---|-------|-------|--------|--------|
| 1 | Inline hover JS → CSS classes | Layout, Sidebar, MessageList, InputBox | Medium | High — cleaner code, keyboard support |
| 2 | Hardcoded hex → CSS vars | MessageList, Sidebar | Low | Medium — theme correctness |
| 3 | Broken placeholder CSS | Sidebar | Low | Low — minor visual bug |
| 4 | Duplicate settings buttons | Sidebar | Low | Medium — UX confusion |
| 5 | Remove dead nav tabs | Sidebar | Low | High — removes visual clutter |
| 6 | Add aria-labels | All | Low | Medium — accessibility |
| 7 | div[role=button] → button | Sidebar | Low | Medium — accessibility + semantics |
| 8 | LumenAvatar currentColor | MessageList | Low | Low — maintainability |
| 9 | Send button indentation | InputBox | Trivial | Trivial |

**Start with issues 5 then 1** — removing the dead nav tabs makes the sidebar cleaner immediately, and replacing the hover JS with CSS classes has the biggest code quality payoff.

---

## What NOT to Touch

- `useStream.ts` — the delta batching and RAF scroll logic are correct and deliberate. Don't simplify them.
- `useVisualViewport.ts` — the iOS keyboard viewport tracking is correct. Don't change it.
- `MarkdownRenderer.tsx` — the syntax highlighting disable during streaming is intentional (Safari stability). Keep it.
- The `webSecurity: false` in `main.js` — needed for Electron to load localhost in dev.

---

## Codebase Location Reference

```
C:\Dev\tower-ai-app\
├── lumen-pwa\src\
│   ├── components\
│   │   ├── Layout.tsx         ← Issue 1
│   │   ├── Sidebar.tsx        ← Issues 1, 2, 3, 4, 5, 6, 7
│   │   ├── MessageList.tsx    ← Issues 1, 2, 6, 8
│   │   ├── InputBox.tsx       ← Issues 1, 6, 9
│   │   ├── ChatPane.tsx       ← check for hardcoded colors
│   │   ├── MarkdownRenderer.tsx ← Issue 6 (copy button)
│   │   └── SettingsView.tsx   ← Issue 6 (various buttons)
│   ├── index.css or globals.css ← Issue 3 (add placeholder CSS)
```
