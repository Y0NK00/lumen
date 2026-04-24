# Lumen Server — Session Log, 2026-04-23

Two-session deployment-infra push. Preserved here so the build history stays recoverable.

## Scope of these sessions

Bootstrap the external infrastructure Lumen needs to run publicly for Will and family. Server code scaffolding was already done; this was about everything outside the code: domain, email, tunnel, auth, OAuth.

## What got built

### Part 1 — Resend + DNS (task #8, completed)

1. Added `myspiritdomain.net` to Resend.
2. Committed DKIM/SPF/MX records via Cloudflare Domain Connect (scoped one-time write, no API token needed).
3. Verified `DKIM verified / SPF verified / Domain verified` status in Resend.
4. Region: North Virginia (us-east-1), on Amazon SES infrastructure.

**Gotcha solved:** full DKIM key was truncated in Resend's UI. Fix was pivoting to the Domain Connect confirmation page on Cloudflare's side, which exposes records plainly and avoids brittle DOM extraction.

### Part 2 — Cloudflare Tunnel route (task #9, completed)

Decision: reuse the existing healthy homelab tunnel instead of spinning up a second cloudflared container.

Tunnel id: `dc9095a3-b670-4240-9f3e-62641fcef6a6`

Before this session (7 routes):
- `portainer.myspiritdomain.net → 10.0.0.50:9000`
- `pihole.myspiritdomain.net → 10.0.0.50:80`
- `plex.myspiritdomain.net → 10.0.0.50:32400`
- `chat.myspiritdomain.net → 10.0.0.22:...`
- `code.myspiritdomain.net → 10.0.0.22:...`
- `n8n.myspiritdomain.net → 10.0.0.22:...`
- `flowise.myspiritdomain.net → 10.0.0.22:...`

Added this session (route #8):
- `lumen.myspiritdomain.net → http://10.0.0.22:7747`

Implication for deploy: `docker-compose.yml` should NOT run a cloudflared service. Only `lumen-server` container. No `TUNNEL_TOKEN` env needed. This saves a few hundred MB of RAM and simplifies the image.

### Part 3 — Cloudflare Access (task #10, completed)

Self-hosted application "Lumen" created:
- Public hostname: `lumen.myspiritdomain.net`
- Policy "Family allowlist", action ALLOW, 1 rule
- Policy ID: `d50215e1-2262-4b11-9b50-4fb566a4c609`
- Auth: Email OTP (default, covered by "Accept all available identity providers")
- Initial allowlist: `dejavuyonko@gmail.com` only
- Session duration: 24h

Plan is to add daughter, cousin, brother emails after Lumen is battle-tested with just Will as the first user. That's a one-click edit in the Access dashboard later.

**Friction that ate time:** Cloudflare's dashboard kept putting the tab into a broken "Cannot access a chrome-extension:// URL of different extension" state after any form_input call. Recovered by re-navigating and having Will finish the last two clicks manually. Worth remembering if we automate more CF stuff later: their dashboard fights React-native input setters.

### Part 4 — Google OAuth (task #11, completed)

Project: `Lumen OAUTH` (`lumen-oauth-494205`)

OAuth 2.0 client (Web application) created:
- Name: Lumen Server
- Client ID: `909496381915-lgatm6buqpdrka060kpuuol9nps5hl3d.apps.googleusercontent.com`
- Client Secret: in `.env` (not here)
- Redirect URI: `https://lumen.myspiritdomain.net/api/oauth/google/callback`
- Created: 2026-04-23 11:12 PM ET
- Status: Enabled
- Consent screen: External, with Will as test user

These credentials are shared across all users — each family member links their own Google account via the Lumen UI, storing their own refresh token in the `oauth_tokens` table.

## Architectural decisions captured

### Reuse the homelab tunnel, don't run a second cloudflared

Why: existing tunnel is healthy, already trusts 10.0.0.22, and adding a route is an in-place config change. Running two cloudflared containers would double the connector fleet for zero benefit and fragment logs.

Cost: lumen-server has no control over its own tunnel. If the homelab tunnel dies, lumen dies with it. Acceptable — it's the same blast radius as the other 10.0.0.22 services.

### Cloudflare Access with email OTP instead of passwords for family

Why: eliminates password management for family members who aren't technical. Cloudflare issues a one-time code to the allowlisted email. User clicks it, gets a 24h Access session, then hits Lumen's own auth (bootstrap admin or eventual per-user accounts) underneath.

Cost: two auth hops (Access + Lumen's JWT). Benefit dominates.

### Allowlist = Will only for v1, expand after

Why: ship v1, test with real usage, then invite. Don't give family a broken tool on day one. Adding members is a 10-second edit in the dashboard.

## What didn't get done (handed to next chat)

All server-side code. Task list at end of session:

- #12 Write conversation + message routes with SSE streaming
- #13 Write provider abstractions for OpenAI + Anthropic
- #14 Write settings, usage, vault, admin routes
- #15 Write Google OAuth callback route
- #16 Write one-time migration for conversations.json + mobile-conversations.json
- #17 Update docker-compose.yml + UNRAID_DEPLOY.md for tunnel reuse
- #18 Local boot test

See `HANDOFF.md` for the structured pickup brief.
