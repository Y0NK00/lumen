"""
Lumen Jarvis — voice daemon + HUD (single Python process).

The Flask HUD (`hud_server`) runs in a background thread inside this process — not a separate OS
service. Production stack: `lumen-server` (Docker) + this script.

Default: push-to-talk voice pipeline → Lumen SSE → Edge TTS, with HUD phases wired to real state.
Use `--demo` for HUD-only phase cycling (visual QA).
"""

from __future__ import annotations

import argparse
import random
import threading
import time
import uuid
import webbrowser
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Literal

from dotenv import load_dotenv

# Load `.env` from this folder — not cwd — so voice keys work when you run:
#   python C:\...\lumen-jarvis\lumen-jarvis.py
# from another directory.
_ROOT_DIR = Path(__file__).resolve().parent
_ENV_PATH = _ROOT_DIR / ".env"
load_dotenv(_ENV_PATH)

import os

Phase = Literal[
    "idle",
    "listening",
    "transcribing",
    "thinking",
    "speaking",
    "error",
    "demo",
]


@dataclass
class JarvisRuntimeState:
    phase: Phase = "idle"
    core_message: str = ""
    user_transcript: str = ""
    assistant_text: str = ""
    user_meta: str = ""
    assistant_meta: str = ""
    hotkey_hint: str = ""
    server_url_display: str = ""
    uplink_status: str = "STANDBY"
    footer_message: str = "HUD synchronized"
    session_id: str = ""
    log_lines: list[str] = field(default_factory=list)
    telemetry: dict[str, str] = field(default_factory=dict)


class JarvisController:
    """Thread-safe state shared by the HUD API and the voice pipeline."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._state = JarvisRuntimeState()
        self._session_id = uuid.uuid4().hex[:8].upper()
        self._reset_defaults()

    def _reset_defaults(self) -> None:
        url = os.getenv("LUMEN_SERVER_URL", "http://tower.local:7747").rstrip("/")
        hotkey = os.getenv("JARVIS_HOTKEY", "ctrl+space")
        self._state.session_id = self._session_id
        self._state.hotkey_hint = f"Hotkey: {hotkey} · hold to talk"
        self._state.server_url_display = url
        self._state.user_transcript = "—"
        self._state.assistant_text = "Standby — hold hotkey when voice is enabled."
        self._state.telemetry = {
            "core_temp": "36.4°C",
            "neural_load": "12%",
            "buffer": "stable",
        }

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return asdict(self._state)

    def set_phase(self, phase: Phase, core_message: str | None = None) -> None:
        with self._lock:
            self._state.phase = phase
            if core_message is not None:
                self._state.core_message = core_message
            self._sync_uplink()

    def log(self, line: str) -> None:
        stamp = time.strftime("%H:%M:%S")
        entry = f"[{stamp}] {line}"
        with self._lock:
            self._state.log_lines.append(entry)
            self._state.log_lines = self._state.log_lines[-80:]

    def patch(self, **kwargs: Any) -> None:
        with self._lock:
            for k, v in kwargs.items():
                if hasattr(self._state, k):
                    setattr(self._state, k, v)
            self._sync_uplink()

    def _sync_uplink(self) -> None:
        p = self._state.phase
        if p == "idle":
            self._state.uplink_status = "STANDBY"
        elif p in ("listening", "transcribing"):
            self._state.uplink_status = "RX"
        elif p == "thinking":
            self._state.uplink_status = "TX/RX"
        elif p == "speaking":
            self._state.uplink_status = "AUDIO OUT"
        elif p == "error":
            self._state.uplink_status = "DEGRADED"
        else:
            self._state.uplink_status = "CALIBRATION"


def open_hud_browser(host: str, port: int) -> None:
    if os.getenv("JARVIS_OPEN_BROWSER", "1").strip() not in ("1", "true", "yes"):
        return
    url = f"http://{host}:{port}/"
    threading.Timer(0.6, lambda: webbrowser.open(url)).start()


def run_demo_sequence(ctrl: JarvisController, stop: threading.Event) -> None:
    """Cycles HUD phases — simulation only; use for UI checks."""

    script = [
        (
            "idle",
            "All systems nominal",
            "Operator channel idle.",
            "Neural relay standing by.",
        ),
        (
            "listening",
            "Capture active — acoustic sensors online",
            "(Simulated) Hold hotkey — relay open.",
            "Waiting for transcript stream…",
        ),
        (
            "transcribing",
            "Decoding waveform → lexical tokens",
            "Will, should I alert the tower?",
            "Packet assembly in progress…",
        ),
        (
            "thinking",
            "Routing through Lumen core",
            "Will, should I alert the tower?",
            "Consulting Claude via lumen-server…",
        ),
        (
            "speaking",
            "Rendering vocal matrix",
            "Will, should I alert the tower?",
            "Acknowledged. Tower sensors show nominal drift.",
        ),
        (
            "idle",
            "Cycle complete — returning to standby",
            "Will, should I alert the tower?",
            "Session nominal. Awaiting next directive.",
        ),
    ]

    ctrl.log("Demo sequence armed — HUD visualization only (no voice)")
    idx = 0
    while not stop.is_set():
        phase, core, user_txt, asst_txt = script[idx % len(script)]
        ctrl.set_phase(phase, core)
        ctrl.patch(
            user_transcript=user_txt,
            assistant_text=asst_txt,
            user_meta="VOICE · SIMULATED",
            assistant_meta="LUMEN · CHANNEL A",
            footer_message="Demo mode · visualization loop",
            telemetry={
                "core_temp": f"{36 + random.random():.1f}°C",
                "neural_load": f"{8 + random.randint(0, 22)}%",
                "buffer": random.choice(("stable", "primed", "flushing")),
            },
        )
        ctrl.log(f"Phase → {phase.upper()}")
        idx += 1
        time.sleep(3.2)


def main() -> None:
    parser = argparse.ArgumentParser(description="Lumen Jarvis — voice + HUD (one process)")
    parser.add_argument(
        "--demo",
        action="store_true",
        help="Simulated HUD phases only (no microphone / Lumen / Groq)",
    )
    parser.add_argument(
        "--no-voice",
        action="store_true",
        help="HUD only — do not register push-to-talk (for UI development)",
    )
    parser.add_argument(
        "--host",
        default=os.getenv("JARVIS_HUD_HOST", "127.0.0.1"),
        help="HUD bind address",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.getenv("JARVIS_HUD_PORT", "9777")),
        help="HUD port (default 9777)",
    )
    args = parser.parse_args()

    ctrl = JarvisController()
    ctrl.log("Jarvis boot — HUD thread + voice pipeline")

    if args.demo:
        ctrl.set_phase("demo", "Demonstrating interface modes")
        ctrl.patch(
            footer_message="Demo mode · cinematic loop active",
            user_meta="SIMULATION",
            assistant_meta="LUMEN PREVIEW",
        )

    from hud_server import create_app, start_hud_background

    app = create_app(ctrl.snapshot)
    start_hud_background(app, args.host, args.port)
    ctrl.log(f"HUD embedded at http://{args.host}:{args.port}/ (same process as this script)")

    print(f"[Jarvis] HUD: http://{args.host}:{args.port}/")
    print("[Jarvis] Voice uses push-to-talk unless --demo or --no-voice.")

    open_hud_browser(args.host, args.port)

    stop = threading.Event()
    demo_thread: threading.Thread | None = None
    if args.demo:
        demo_thread = threading.Thread(
            target=run_demo_sequence,
            args=(ctrl, stop),
            name="jarvis-demo",
            daemon=True,
        )
        demo_thread.start()
    elif not args.no_voice:
        import jarvis_voice

        if jarvis_voice.voice_env_ready():
            auth = jarvis_voice.LumenAuth(
                server_url=os.getenv("LUMEN_SERVER_URL", "http://tower.local:7747").rstrip("/"),
                email=os.getenv("LUMEN_EMAIL", ""),
                password=os.getenv("LUMEN_PASSWORD", ""),
            )
            groq_key = os.getenv("GROQ_API_KEY", "")
            hotkey = os.getenv("JARVIS_HOTKEY", "ctrl+space")
            voice = os.getenv("JARVIS_VOICE", "en-US-GuyNeural")
            try:
                jarvis_voice.login(auth)
                jarvis_voice.ensure_jarvis_conversation(auth)
                ctrl.log(f"Lumen session OK · conversation {auth.conversation_id}")
                ctrl.patch(
                    footer_message="Hold hotkey to speak",
                    assistant_text="Ready when you are.",
                )
                ok_deps, dep_msg = jarvis_voice.voice_imports_ok()
                if not ok_deps:
                    ctrl.log(f"Push-to-talk disabled (missing deps): {dep_msg}")
                    ctrl.patch(
                        footer_message="Install PyAudio + keyboard — see lumen-jarvis/README.md",
                        assistant_text=dep_msg[:500],
                    )
                    print(
                        "[Jarvis] PyAudio/keyboard not importable — HUD runs; "
                        "install mic deps or use Python 3.11 + pip install pyaudio.\n"
                        f"       Detail: {dep_msg}"
                    )
                else:
                    jarvis_voice.register_hotkey(ctrl, auth, groq_key, hotkey, voice)
            except Exception as e:
                ctrl.log(f"Voice init failed: {e}")
                ctrl.set_phase("error", str(e))
                print(f"[Jarvis] Voice init error: {e}")
        else:
            missing = jarvis_voice.voice_env_missing_fields()
            ctrl.log(
                "Voice disabled — "
                f"missing/empty: {', '.join(missing)} — "
                f"expect .env at {_ENV_PATH} (exists: {_ENV_PATH.exists()})"
            )
            print(
                "[Jarvis] Voice env not loaded — HUD only.\n"
                f"       Put secrets in: {_ENV_PATH}\n"
                f"       Missing or blank: {', '.join(missing) if missing else '(unknown)'}"
            )

    try:
        while True:
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("\n[Jarvis] Shutdown.")
        stop.set()
        if demo_thread:
            demo_thread.join(timeout=2.0)


if __name__ == "__main__":
    main()
