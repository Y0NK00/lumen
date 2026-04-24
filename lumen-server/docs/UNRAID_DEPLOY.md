# Unraid Deployment Guide

Step-by-step for getting Lumen Server running on Unraid and exposed to your family over the internet.

## Prerequisites

- Unraid server reachable on your LAN (you already have this)
- Docker and Docker Compose plugin installed on Unraid (should be already)
- A domain name on Cloudflare (e.g., `yourname.com`). If you don't have one, register via Cloudflare Registrar (~$10/yr).
- All required values from `.env.example` gathered

## Step 1: Clone onto Unraid

SSH into Unraid:
```bash
ssh root@10.0.0.22
mkdir -p /mnt/user/appdata/lumen
cd /mnt/user/appdata/lumen
git clone <your-lumen-repo> .
cd lumen-server
```

## Step 2: Configure

```bash
cp .env.example .env
vim .env   # or use Unraid's File Manager
```

Fill in every `REQUIRED` and `RECOMMENDED` value. Verify:
- `ANTHROPIC_API_KEY` is correct and has a spending limit set on console.anthropic.com
- `JWT_SECRET`, `SESSION_SECRET`, `ENCRYPTION_KEY` are each freshly generated with `openssl rand -hex`
- `ADMIN_BOOTSTRAP_EMAIL` is your real email
- `PUBLIC_URL` matches what your Cloudflare Tunnel will expose (e.g., `https://lumen.yourname.com`)

## Step 3: First Boot

```bash
docker compose up -d --build
docker compose logs -f
```

Watch for:
```
[entrypoint] First boot: initializing database...
[entrypoint] Running migrations...
[server] Admin user created: will@example.com
[server] Listening on 0.0.0.0:7747
```

Verify locally: `curl http://10.0.0.22:7747/api/health` should return `{"ok":true}`.

## Step 4: Set Up Cloudflare Tunnel

You want family to reach Lumen without exposing your Unraid IP or opening ports.

1. Log into Cloudflare → Zero Trust → Networks → Tunnels
2. "Create a tunnel" → Cloudflared → give it a name like `unraid-lumen`
3. Install connector. Two options:
   - **Easiest:** Copy the token shown, paste into your `.env` as `CLOUDFLARE_TUNNEL_TOKEN`, uncomment the `cloudflared` service in `docker-compose.yml`, `docker compose up -d`
   - **Alternative:** Install Cloudflared container via Unraid Community Applications directly
4. In the tunnel config → Public Hostname:
   - Subdomain: `lumen`
   - Domain: `yourname.com` (must be on Cloudflare)
   - Service: `HTTP` → `lumen-server:7747`
5. Save. Wait 30 seconds. Visit `https://lumen.yourname.com` → should see Lumen.

## Step 5: Add Cloudflare Access (the auth wall)

This keeps random internet traffic out. Only people you whitelist can reach Lumen.

1. Zero Trust → Access → Applications → Add Application → Self-Hosted
2. Name: `Lumen`, Domain: `lumen.yourname.com`
3. Policy: "Allow", Include: "Emails" → list your family's emails:
   - `will@example.com`
   - `daughter@example.com`
   - `cousin@example.com`
   - `brother@example.com`
4. Identity providers → enable "One-time PIN" (they get a 6-digit code via email to log in)
5. Save

Now when anyone visits `https://lumen.yourname.com`, Cloudflare asks for their email, emails them a code, and only then proxies them to Lumen.

**This is a second auth layer on top of Lumen's own login.** Belt + suspenders. A leaked Lumen password isn't enough to get in.

## Step 6: Onboard Family

For each family member:
1. Log in as admin on Lumen UI
2. Admin → Users → Create User
3. Fill in email, display name, monthly budget (e.g., $25), initial password
4. They get a welcome email via Resend with their password
5. Cloudflare Access also emails them a PIN on first visit
6. Tell them the URL: `https://lumen.yourname.com`

## Step 7: Monitoring

Set up on Unraid:
1. Uptime Kuma (Unraid Community Apps) → Add HTTP monitor → `https://lumen.yourname.com/api/health`
2. Alert on Discord webhook or email if it goes down

Budget monitoring is built into Lumen itself: `GET /api/admin/usage` shows household-wide spend; alerts fire at threshold.

## Step 8: Backups

Weekly SQLite backup cron (on Unraid's User Scripts plugin):
```bash
#!/bin/bash
STAMP=$(date +%F)
docker exec lumen-server sqlite3 /data/lumen.db ".backup /data/backups/lumen-${STAMP}.db"
find /data/backups -name 'lumen-*.db' -mtime +30 -delete
```

Schedule: Weekly. Also include `/mnt/user/appdata/lumen/` in Unraid's existing appdata backup.

## Updates

When you push new code:
```bash
cd /mnt/user/appdata/lumen/lumen-server
git pull
docker compose up -d --build
```

Migrations run automatically on boot. Zero-downtime deploys are not a goal for a 4-user household; a 10 second restart is fine.

## Troubleshooting

| Symptom | Check |
|---|---|
| 502 from Cloudflare | Container not running: `docker compose ps` |
| Login fails immediately | Check `JWT_SECRET` is set in `.env` and didn't change recently |
| "Budget exceeded" unexpectedly | `GET /api/usage/summary` → raw events tell you what's spending |
| Extension won't connect | Extension needs new token per user; check `extension_tokens` table |
| Cloudflare Access loop | Policy must include the user's email exactly |
