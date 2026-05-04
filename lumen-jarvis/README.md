# Lumen Jarvis (Phase 4)

Desktop “Jarvis” client for [Lumen](https://github.com/Y0NK00/lumen): **push-to-talk** → Groq Whisper → **lumen-server** (same SSE API as the PWA) → Edge TTS, plus an optional **Iron Man–style HUD** in the browser.

## Architecture (what actually runs)

| Piece | Role |
|-------|------|
| **lumen-server** | Real backend (Docker on your Tower). Auth, Claude streaming, DB. |
| **lumen-jarvis.py** | Single **Python process** on your PC: registers the hotkey, records audio, calls Groq + Lumen, plays TTS, and **embeds** the HUD. |
| **hud_server.py** | Tiny Flask app started as a **daemon thread inside that same process** — not a second service you deploy separately. |

So you are **not** juggling three servers as three processes: it is **`lumen-server` + one Jarvis process** (HUD included).

Build priority: **voice path first**, HUD reflects **live** `listening` / `thinking` / `speaking` from `JarvisController`. Use `--demo` only when you want **fake** phase cycling without credentials.

## Quick start

1. Install **Python 3.10+**.

2. Create a venv (recommended), then:

   ```bash
   cd lumen-jarvis
   pip install -r requirements.txt
   ```

3. **Create `lumen-jarvis/.env`** (same folder as `lumen-jarvis.py`). The repo **gitignores** `.env`, so it will not appear on GitHub — you create it locally:

   ```powershell
   cd C:\Dev\tower-ai-app\lumen-jarvis
   copy .env.example .env
   notepad .env
   ```

   In File Explorer, enable **View → Show → Hidden items** if you do not see files starting with a dot. The file name must be **`.env`** (with the leading dot).

   Set at least:

   - `LUMEN_SERVER_URL`, `LUMEN_EMAIL`, `LUMEN_PASSWORD`
   - `GROQ_API_KEY` ([console.groq.com](https://console.groq.com))

   Replace every **placeholder** (`your-email@example.com`, empty `GROQ_API_KEY`, etc.). Voice stays disabled until all three are non-empty.

4. Run:

   ```bash
   python lumen-jarvis.py
   ```

   Hold **`ctrl+space`** (or `JARVIS_HOTKEY`) **while speaking**, release to send. The HUD should move through real phases as audio is captured, transcribed, streamed, and spoken.

### Flags

| Flag | Meaning |
|------|--------|
| `--demo` | **No voice** — cycles simulated phases for HUD/visual checks only. |
| `--no-voice` | HUD only — skips push-to-talk registration (UI work without mic/API). |

## HUD display modes (Iron Man UI)

The dashboard is a **normal browser tab** unless you later wrap it with **pywebview** or similar. Inside the tab:

- **Immersive** — Full layout, 3D-tilted rings, particle field, ticker.
- **Desktop** — Floating draggable panel (bottom-right); telemetry column hidden for compact layout.
- **Fullscreen** — Uses the browser **Fullscreen API** (first-run gate or **Fullscreen** button). Add `?nogate=1` to skip the gate.

## Windows notes

- **`keyboard`** global hooks sometimes need **Run as administrator** on Windows.
- **TTS playback** saves MP3 from Edge TTS, then plays via **`ffplay`** (install [FFmpeg](https://ffmpeg.org/download.html) and ensure `ffplay` is on `PATH`), else VLC / mpv if installed, else optional **`pip install playsound`**.
- **PyAudio:** Either install a **prebuilt wheel** when available (`pip install pyaudio`), or **build from source** with PortAudio — see **Windows: PyAudio + PortAudio (latest Python)** below.

### Windows: PyAudio + PortAudio (latest Python)

Use this when there is **no PyAudio wheel** for your Python version yet and you want to stay on **current** Python long-term. You supply **PortAudio** (C library + headers); MSVC compiles the PyAudio extension.

#### 1. C++ build toolchain

Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with workload **“Desktop development with C++”** (includes MSVC, Windows SDK, CMake). Restart the terminal after install.

#### 2. PortAudio via vcpkg (recommended)

[vcpkg](https://vcpkg.io/) installs headers and libs into one tree — repeatable across machines and Python upgrades.

```powershell
# Pick a permanent folder (example)
cd C:\Dev
git clone https://github.com/microsoft/vcpkg.git
cd vcpkg
.\bootstrap-vcpkg.bat
.\vcpkg integrate install
.\vcpkg install portaudio:x64-windows
```

Note the install root, e.g. `C:\Dev\vcpkg\installed\x64-windows`.

#### 3. Confirm PortAudio headers exist

```powershell
Test-Path C:\Dev\vcpkg\installed\x64-windows\include\portaudio.h
```

Should print **`True`**. If **`False`**, fix the path or re-run `.\vcpkg install portaudio:x64-windows`.

#### 4. Install PyAudio — MSVC must see `INCLUDE` / `LIB`

Setting `$env:INCLUDE` in **plain PowerShell** is **not always** passed through to the compiler that builds PyAudio. If `pip install pyaudio` still fails with **`Cannot open include file: 'portaudio.h'`**, use the **Visual Studio environment**.

**Recommended:** open **“x64 Native Tools Command Prompt for VS 2022”** (Start menu, under Visual Studio / Build Tools). Then either:

**Option A — helper script** (same repo folder; set `VCPKG_ROOT` if vcpkg is not `C:\Dev\vcpkg`).

Use the **x64 Native Tools Command Prompt for VS 2022** (opens `cmd.exe`, not PowerShell — MSVC’s setup is tuned for that). Then:

```cmd
cd /d C:\Dev\tower-ai-app\lumen-jarvis
install-pyaudio-windows.cmd
```

**If you stay in PowerShell:** there is no `cd /d` — use `cd C:\Dev\tower-ai-app\lumen-jarvis`. To run a script in the current folder you **must** prefix `.\`:

```powershell
cd C:\Dev\tower-ai-app\lumen-jarvis
Get-ChildItem .\install-pyaudio-windows.cmd
.\install-pyaudio-windows.cmd
```

If `Get-ChildItem` shows nothing, you are in the wrong folder or the file is missing from disk (pull latest / save `install-pyaudio-windows.cmd` from the repo).

**Option B — manual:**

```cmd
set INCLUDE=C:\Dev\vcpkg\installed\x64-windows\include;%INCLUDE%
set LIB=C:\Dev\vcpkg\installed\x64-windows\lib;%LIB%
cd /d C:\Dev\tower-ai-app\lumen-jarvis
python -m pip install --upgrade pip setuptools wheel
python -m pip install pyaudio
python -c "import pyaudio; print('PyAudio OK')"
```

(Adjust `C:\Dev\vcpkg` if your vcpkg root differs. Use `python`/`py` consistently with how you run Jarvis.)

**Also install Python deps for Jarvis** (same env):

```cmd
python -m pip install -r requirements.txt
```

That pulls in **`groq`** and everything else — fixes `ModuleNotFoundError: No module named 'groq'` when that package was never installed in this environment.

If the linker complains about **`portaudio.lib`**, check `C:\Dev\vcpkg\installed\x64-windows\lib\` for the exact `.lib` name (vcpkg usually names it so PyAudio finds it).

#### 5. FFmpeg (`ffplay`) for TTS — separate install

PyAudio does **not** include FFmpeg. Install FFmpeg and add its `bin` folder to **PATH** (e.g. `winget install Gyan.FFmpeg`, or unzip a [Windows build](https://www.gyan.dev/ffmpeg/builds/) and add `bin` to user PATH). Confirm: `ffplay -version`.

#### Trade-off (honest)

Building PyAudio against vcpkg PortAudio is **correct** for “always newest Python,” but each **major Python upgrade** may require running **`pip install --force-reinstall --no-cache-dir pyaudio`** again after toolchain/headers are still valid. Many teams instead standardize on **one LTS Python (e.g. 3.12)** for audio tooling until wheels catch up — lower ops overhead.

## Troubleshooting

| Problem | What to do |
|--------|------------|
| **`ModuleNotFoundError: No module named 'groq'`** | Run **`pip install -r requirements.txt`** from `lumen-jarvis` in the **same** Python/venv you use to launch the app. |
| **`ModuleNotFoundError: No module named 'pyaudio'`** | Install PyAudio (see above). Until it imports, Jarvis still starts the **HUD**; push-to-talk stays disabled and the HUD footer logs the reason. |
| **`portaudio.h` missing during `pip install pyaudio`** | Use **x64 Native Tools Command Prompt** + `set INCLUDE` / `set LIB` (see **step 4** above). Plain PowerShell often does not forward those vars to MSVC. |
| **`playsound` pip install fails** | Not required anymore — install **FFmpeg** for `ffplay`, or VLC. |
| **Browser: connection refused to `127.0.0.1:9777`** | The Python process crashed **before** Flask bound the port — usually an **import error** at startup. After the lazy-import fix, run again; if PyAudio is missing, the server should still start. |
| **Hotkey does nothing** | Run terminal **as Administrator**; confirm `keyboard` + PyAudio both import (`python -c "import pyaudio, keyboard"`). |

## Layout

| Path | Role |
|------|------|
| `lumen-jarvis.py` | Entry: HUD thread + voice pipeline orchestration |
| `jarvis_voice.py` | Mic, Groq, Lumen SSE (`text_delta`), Edge TTS, phase updates |
| `hud_server.py` | Flask — `/`, `/api/state`, static HUD assets |
| `hud/` | HUD front-end |
| `.env.example` | Environment template |

## Next steps (see repo `AI_HANDOFF.md`)

- **pywebview** (or similar) for a dedicated window / future always-on-top overlay.
- Screenshot + “look at my screen” once image attachments are wired server-side.
- Wake word (“Hey Lumen”) replacing hotkey.
