# Lumen — Bug Log

> Read this before touching any UI or voice code. Every entry has: symptom, root cause, exact fix, and what file was changed.
> Last updated: 2026-04-26

---

## BUG-001 — Black screen when message is loading (iOS Safari)

**Status:** Fixed  
**File:** `lumen-pwa/src/components/MessageList.tsx`

**Symptom:** Screen goes black while a message is loading. Refreshing the page fixes it.

**Root cause:** `scrollIntoView({ behavior: 'smooth' })` triggers a known iOS Safari repaint bug. Safari tries to animate the scroll, loses the compositing layer, and paints the screen black until the animation completes.

**Fix:** Changed `behavior: 'smooth'` → `behavior: 'auto'` everywhere in MessageList.

**Do NOT change this back to 'smooth'.** It looks nicer but breaks iOS.

---

## BUG-002 — Response not visible / message stuck at bottom after streaming

**Status:** Fixed  
**File:** `lumen-pwa/src/components/MessageList.tsx`

**Symptom:** The AI response appears but the view doesn't follow it as it streams in. User has to manually scroll down to see the response.

**Root cause:** The scroll `useEffect` only fired when `messages.length` changed, not during streaming when message *content* updates. So after the first token, the view stayed wherever it was.

**Fix:** 
- Changed the `useEffect` dependency from `messages.length` to `messages` (full array).
- Added "sticky scroll" logic: during content updates, only scroll if the user is already within 150px of the bottom. This way users can scroll up to read history without being yanked back down mid-stream.
- Added `containerRef` to the scroll container div for measuring distance from bottom.

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

**Symptom:** If a message fails or the user wants to resend, there's no button to do it.

**Fix:**
- Added `ResendButton` component to `MessageList.tsx` — a small circular arrow icon that appears on hover (`group-hover:opacity-100`) to the left of user message bubbles.
- Added `onResend?: (content: string) => void` prop to `MessageList`.
- Wired `handleSend` → `onResend` in `ChatPane.tsx`.

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
