# Lumen — Bug Log

> Read this before touching any UI or voice code. Every entry has: symptom, root cause, exact fix, and what file was changed.
> Last updated: 2026-04-26

---

## BUG-001 — Black screen when message reply comes in (iOS Safari)

**Status:** Fixed (Session 3 — real root cause found in Session 4)  
**File:** `lumen-pwa/src/components/Layout.tsx`

**Symptom:** Screen goes completely black when the AI response starts streaming. Refresh fixes it.

**Root cause (real):** `backdropFilter: 'blur(20px)'` + `WebkitBackdropFilter: 'blur(20px)'` on the ALWAYS-VISIBLE mobile top bar in `Layout.tsx`. This forces the entire page into a GPU compositing layer. When React re-renders streaming content at ~30fps, iOS Safari can't maintain that compositing layer and flashes black on every repaint.

**Fix:** Removed `backdropFilter` and `WebkitBackdropFilter` from the mobile top bar. Changed background to solid `rgba(8,8,16,0.97)`.

**Do NOT add backdrop-filter to any always-visible element.** It's a compositing layer trap on iOS. Blur effects are fine on modals/overlays that aren't open during streaming.

**Earlier wrong guess:** Session 3 thought it was `scrollIntoView({ behavior: 'smooth' })`. That was wrong — changing it to `'auto'` didn't fix the black screen because the real cause was the backdrop-filter in Layout.tsx.

---

## BUG-002 — Response not visible / view doesn't follow streaming content

**Status:** Fixed  
**File:** `lumen-pwa/src/components/MessageList.tsx`, `lumen-pwa/src/components/ChatPane.tsx`

**Symptom:** The AI response streams in but the view doesn't scroll to follow it. User has to manually scroll down.

**Root cause:** Original scroll `useEffect` watched `messages.length` only — fired when a message was added, not as its content grew. Added `isStreaming` prop but the first attempt used `[messages]` as the dependency which fired `scrollIntoView` 30x/sec, causing extra repaints.

**Fix (final):**
- `useEffect([messages.length])` handles new message added → immediate scroll to bottom.
- Separate `useEffect([isStreaming])` starts a `requestAnimationFrame` loop while streaming. The RAF loop checks if user is within 150px of bottom (sticky scroll) and sets `scrollTop` directly — no `scrollIntoView` calls during streaming.
- `isStreaming` passed as prop from `ChatPane` (which gets it from `useStream`).

**Rule:** Never watch `[messages]` (full array) in a scroll useEffect. Zustand creates a new array on every delta → fires every 33ms → performance trap.

---

## BUG-003 — Voice input stops after a few seconds

**Status:** Fixed  
**File:** `lumen-pwa/src/components/InputBox.tsx`

**Symptom:** Voice input stops listening after a short pause (a few seconds). Tapping the mic again to retry wipes whatever was already in the textarea.

**Root cause 1:** `recognition.continuous = false` — this tells the browser to stop after the first detected pause in speech. On iOS, that's only a few seconds.

**Root cause 2:** `el.value = transcript` in the `onresult` handler replaces the entire textarea value. If the user had typed text before starting voice, it gets wiped. Same if they retry — the new transcript starts fresh.

**Fix:**
- Set `recognition.continuous = true` so it keeps listening through pauses until the user taps the mic button to stop.
- Added `preVoiceTextRef` — saves the existing textarea text before voice starts.
- Updated `onresult` to prepend `preVoiceTextRef.current` to the new transcript: `el.value = prefix ? \`${prefix} ${transcript}\` : transcript`.

**Note:** With `continuous: true` on iOS Safari, the recognition session may still time out after ~60s of total silence. This is a browser OS limit, not something we can fix in code.

---

## BUG-004 — No resend / retry button on user messages

**Status:** Fixed  
**Files:** `lumen-pwa/src/components/MessageList.tsx`, `lumen-pwa/src/components/ChatPane.tsx`

**Symptom:** If a message fails or the user wants to resend, there's no button to do it. First attempt had the button permanently invisible on mobile (hover states don't work on touch).

**Fix:**
- Added `ResendButton` component — circular arrow icon to the left of each user message bubble.
- Button is always visible at 40% opacity (not hover-only). Highlights on `onMouseEnter` / `onTouchStart`.
- Added `onResend?: (content: string) => void` prop to `MessageList`.
- Wired `handleSend` → `onResend` in `ChatPane.tsx`.

**Rule:** Never use `opacity-0 group-hover:opacity-100` for touch-primary UI. Hover doesn't exist on mobile. Use low base opacity instead.

---

## BUG-008 — Message list jumps to top when keyboard opens on iOS

**Status:** Fixed  
**File:** `lumen-pwa/src/hooks/useVisualViewport.ts`

**Symptom:** Tapping the input box to type causes the message list to jump to the top instead of staying at the last message.

**Root cause:** `useVisualViewport` used `requestAnimationFrame` to scroll after the viewport height changed. On iOS, `rAF` fires during the keyboard animation before the layout has finished settling. `scrollHeight` is measured incorrectly mid-animation, so the scroll lands in the wrong place.

**Fix:** Changed `requestAnimationFrame` → `setTimeout(..., 150)` to wait for the keyboard animation to finish before measuring and scrolling.

---

## BUG-005 — Migration runner crash (UNIQUE constraint on schema_version)

**Status:** Fixed — Session 2 (2026-04-26)  
**Files:** `lumen-server/src/db/migrations/002_memories.sql`, `lumen-server/docker/Dockerfile`, `lumen-server/docker-compose.yml`

**Symptom:** Container restart loop. Migration runner crashes with UNIQUE constraint violation.

**Root cause:** `002_memories.sql` contained its own `INSERT OR IGNORE INTO schema_version (version) VALUES (2)`. `db-migrate.ts` also inserts into `schema_version` after running each migration. Double insert → UNIQUE crash.

**Fix:** Removed the `INSERT OR IGNORE INTO schema_version` line from `002_memories.sql`. The migration runner in `db-migrate.ts` owns schema_version — **never put schema_version inserts inside `.sql` migration files.**

---

## BUG-006 — Healthcheck always failing (localhost = IPv6 on this container)

**Status:** Fixed — Session 2 (2026-04-26)  
**File:** `lumen-server/docker-compose.yml`

**Symptom:** Container shows `(unhealthy)` even though the server is running fine.

**Root cause:** Healthcheck used `http://localhost:7747/api/health`. Inside this container, `localhost` resolves to `::1` (IPv6). Node server only binds `0.0.0.0` (IPv4 only). IPv6 connect → connection refused → healthcheck fails.

**Fix:** Changed healthcheck URL to `http://127.0.0.1:7747/api/health`.

**Rule:** Always use `127.0.0.1` explicitly in healthchecks for this container — never `localhost`.

---

## BUG-007 — .sql migration files not included in Docker image

**Status:** Fixed — Session 1  
**File:** `lumen-server/docker/Dockerfile`

**Symptom:** App hung on every message ("Generating…" forever). `listMemories()` crashed every request.

**Root cause:** `tsc` does not copy `.sql` files. The Dockerfile multi-stage build compiled TypeScript but the `COPY` for `src/db/migrations` was missing from the runtime stage. So the `memories` table never got created.

**Fix:** Added explicit `COPY` in Dockerfile:
```
COPY --from=server-builder --chown=lumen:lumen /app/src/db/migrations ./dist/src/db/migrations
```

**Rule:** Every new `src/db/migrations/` folder requires an explicit `COPY` line added to the Dockerfile. TypeScript compilation does NOT carry non-TS files along.

---

## Adding Future Migrations — Correct Pattern

```sql
-- src/db/migrations/003_your_feature.sql
-- Migration 003: describe what this does
ALTER TABLE ...;
CREATE INDEX ...;
-- NO INSERT INTO schema_version here — the runner handles it
```

Then in `db-migrate.ts`, add version 3 to the migrations array. Add a COPY line for the migrations folder to the Dockerfile if it's a new directory. Rebuild.
