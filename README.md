# Lumen — Private AI Companion

**Lumen** is a self-hosted AI companion app running entirely on your own hardware. Built on [Electron](https://electronjs.org), it connects to local AI services on your Unraid server and gives you a polished, Claude-inspired interface without sending a single byte to a third party.

---

## Features

- **Chat** — Streaming conversations with any Ollama model (Qwen, Llama, Mistral, etc.)
- **AI Driver** — Browser automation via Skyvern (visual AI agent)
- **Code Bot** — Agentic coding via OpenHands + built-in terminal
- **Chrome Control** — AI-assisted browsing in a built-in webview
- **Connectors** — GitHub, Gmail, Telegram, Obsidian, n8n integrations
- **Skills** — Custom AI personas (coding assistant, homelab admin, etc.)
- **Memory** — Persistent cross-session context
- **Mobile Triggers** — n8n webhooks for phone-based automation
- **File Attachments** — Upload images and files directly in chat (llava vision support)
- **Projects** — Organize conversations into project folders
- **Themes** — Tower Dark, Midnight, Forest, Light, Slate, Sunset
- **Voice** — TTS read-aloud using system voices

---

## Stack (Unraid Server)

| Service | Port | Purpose |
|---|---|---|
| Ollama | 11434 | LLM inference engine |
| Skyvern | 8081 (UI) / 8000 (API) | Visual browser automation |
| OpenHands | 3001 | Agentic code assistant |
| n8n | 5678 | Workflow automation / mobile triggers |
| Open WebUI | 3000 | Alternative chat UI |

---

## Quick Start (Development)

```bash
# Prerequisites: Node.js 18+, npm

cd tower-ai-app
npm install
npm start
```

## Build Windows Installer

```bash
npm run build
# Output: dist/Lumen Setup 1.0.0.exe
```

---

## Configuration

All settings are stored in Electron's userData folder (Windows: `%APPDATA%/lumen/`). You can configure:

- **Ollama URL** — default `http://10.0.0.22:11434`
- **Skyvern URL** — default `http://10.0.0.22:8081`
- **OpenHands URL** — default `http://10.0.0.22:3001`
- **Profile** — your name, nickname, AI context
- **Capabilities** — streaming, memory, voice, mobile webhooks
- **Connectors** — API keys for GitHub, Telegram, Obsidian

---

## n8n Workflows

Import any of these into your n8n instance (`http://10.0.0.22:5678`):

| File | Endpoint | Purpose |
|---|---|---|
| `n8n-mobile-trigger-workflow.json` | `/webhook/lumen-chat` | Send messages to Ollama from phone |
| `n8n-server-health-workflow.json` | `/webhook/lumen-health` | Ping all services, get status report |
| `n8n-model-switcher-workflow.json` | `/webhook/lumen-switch-model` | List/validate Ollama models |
| `n8n-skyvern-task-status-workflow.json` | `/webhook/lumen-task-status` | Poll Skyvern task by ID |

---

## Project Structure

```
tower-ai-app/
├── main.js          # Electron main process
├── preload.js       # Context bridge (IPC)
├── package.json
└── renderer/
    ├── index.html   # App shell + all UI panels
    ├── app.js       # All application logic (~2000 lines)
    └── style.css    # Full design system + themes
```

---

## Roadmap

- [ ] OAuth connector flows (GitHub, Gmail, Telegram login)
- [ ] Real-time connector status dots in titlebar
- [ ] Prompt library / starred prompts
- [ ] Conversation search
- [ ] Export conversations as PDF/MD
- [ ] Plugin system for custom panels
- [ ] iOS/Android companion app (Shortcuts / Tasker integration)

---

## Hardware

Developed for an **Unraid Tower** server. Recommended specs for full stack:

- CPU: 8+ cores (for Ollama inference)
- RAM: 32GB+ (for 14B+ models)
- GPU: NVIDIA with 12GB+ VRAM (optional but recommended for fast inference)
- Storage: 100GB+ for models

---

*Built with love for the homelab community. Not affiliated with Anthropic.*
