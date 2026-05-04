"""
Voice + Lumen API pipeline for Jarvis (same contract as lumen-pwa SSE).

Runs in worker threads; reports phase + transcript text to JarvisController for the HUD.
"""

from __future__ import annotations

import asyncio
import json
import os
import tempfile
import threading
import time
import wave
import shutil
import subprocess
from dataclasses import dataclass
from typing import Any, Callable, Protocol

import requests

# groq / PyAudio / keyboard are imported lazily where possible so `import jarvis_voice`
# does not crash before the HUD runs (install deps with: pip install -r requirements.txt).


class JarvisHUD(Protocol):
    def set_phase(self, phase: Any, core_message: str | None = None) -> None: ...

    def patch(self, **kwargs: Any) -> None: ...

    def log(self, line: str) -> None: ...

SAMPLE_RATE = 16000
CHANNELS = 1
CHUNK = 1024

_DEFAULT_MODEL = "claude-sonnet-4-6"

_pipeline_busy = threading.Lock()


@dataclass
class LumenAuth:
    server_url: str
    email: str
    password: str
    token: str | None = None
    conversation_id: str | None = None


def _headers_json(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


def _headers_sse(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
    }


def login(auth: LumenAuth) -> None:
    res = requests.post(
        f"{auth.server_url}/api/auth/login",
        json={"email": auth.email, "password": auth.password},
        timeout=60,
    )
    res.raise_for_status()
    auth.token = res.json()["token"]


def list_conversations(auth: LumenAuth) -> list[dict]:
    assert auth.token
    res = requests.get(
        f"{auth.server_url}/api/conversations",
        headers=_headers_json(auth.token),
        timeout=60,
    )
    res.raise_for_status()
    return res.json().get("items", [])


def ensure_jarvis_conversation(auth: LumenAuth) -> str:
    assert auth.token
    for c in list_conversations(auth):
        if c.get("title") == "Jarvis":
            auth.conversation_id = c["id"]
            return c["id"]

    body = {
        "title": "Jarvis",
        "model": _DEFAULT_MODEL,
        "systemPrompt": (
            "You are Jarvis, Will's personal AI assistant. Be concise, direct, and helpful. "
            "For voice replies, keep answers short enough to speak aloud — "
            "about 3–5 sentences unless detail is explicitly requested."
        ),
    }
    res = requests.post(
        f"{auth.server_url}/api/conversations",
        headers=_headers_json(auth.token),
        json=body,
        timeout=60,
    )
    res.raise_for_status()
    cid = res.json()["conversation"]["id"]
    auth.conversation_id = cid
    return cid


def iter_sse_events(response: requests.Response):
    """Parse lumen-server SSE (event + data lines), matching lumen-pwa stream.ts."""
    buffer = ""
    current_event = ""
    for chunk in response.iter_content(chunk_size=2048):
        if not chunk:
            continue
        buffer += chunk.decode("utf-8", errors="replace")
        while "\n" in buffer:
            line, buffer = buffer.split("\n", 1)
            line = line.rstrip("\r")
            if line.startswith("event: "):
                current_event = line[7:].strip()
            elif line.startswith("data: "):
                raw = line[6:]
                try:
                    data = json.loads(raw)
                except json.JSONDecodeError:
                    current_event = ""
                    continue
                yield current_event, data
                current_event = ""


def send_message_stream(
    auth: LumenAuth,
    text: str,
    on_delta: Callable[[str], None],
) -> str:
    assert auth.token and auth.conversation_id
    full = ""
    with requests.post(
        f"{auth.server_url}/api/conversations/{auth.conversation_id}/messages",
        headers=_headers_sse(auth.token),
        json={"content": text},
        stream=True,
        timeout=600,
    ) as res:
        if res.status_code == 401:
            raise RuntimeError("Unauthorized — token expired or invalid")

        res.raise_for_status()

        for event, data in iter_sse_events(res):
            if event == "text_delta" and isinstance(data, dict):
                delta = data.get("delta") or ""
                full += delta
                on_delta(delta)
            elif event == "error":
                msg = data.get("message", str(data)) if isinstance(data, dict) else str(data)
                raise RuntimeError(msg)
    return full


_INT16_BYTES = 2


def voice_imports_ok() -> tuple[bool, str]:
    """Return whether PyAudio + keyboard can be loaded (needed for push-to-talk)."""
    try:
        import keyboard  # noqa: F401
        import pyaudio  # noqa: F401
    except ImportError as e:
        return False, str(e)
    return True, ""


def record_audio_while_hotkey(hotkey: str) -> str | None:
    """Record mono WAV while hotkey is held; None if nothing captured."""
    import keyboard
    import pyaudio

    pa_format = pyaudio.paInt16
    p = pyaudio.PyAudio()
    stream = p.open(
        format=pa_format,
        channels=CHANNELS,
        rate=SAMPLE_RATE,
        input=True,
        frames_per_buffer=CHUNK,
    )

    frames: list[bytes] = []
    while keyboard.is_pressed(hotkey):
        data = stream.read(CHUNK, exception_on_overflow=False)
        frames.append(data)
        time.sleep(0.01)

    stream.stop_stream()
    stream.close()
    p.terminate()

    if not frames:
        return None

    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    path = tmp.name
    tmp.close()

    with wave.open(path, "wb") as wf:
        wf.setnchannels(CHANNELS)
        wf.setsampwidth(_INT16_BYTES)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(b"".join(frames))

    return path


def transcribe_audio(path: str, groq_key: str) -> str:
    from groq import Groq

    client = Groq(api_key=groq_key)
    with open(path, "rb") as f:
        result = client.audio.transcriptions.create(
            file=(os.path.basename(path), f),
            model="whisper-large-v3-turbo",
            response_format="text",
        )
    if isinstance(result, str):
        return result.strip()
    text = getattr(result, "text", None)
    if isinstance(text, str):
        return text.strip()
    return str(result).strip()


async def _edge_save_mp3(text: str, voice: str, mp3_path: str) -> None:
    import edge_tts

    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(mp3_path)


def play_mp3_blocking(path: str) -> None:
    """
    Play an MP3 to completion. Order: ffplay (ffmpeg) → playsound → VLC → mpv.
    avoids requiring playsound, which often fails to build on Python 3.12+.
    """
    ffplay = shutil.which("ffplay")
    if ffplay:
        r = subprocess.run(
            [ffplay, "-nodisp", "-autoexit", "-loglevel", "quiet", path],
            capture_output=True,
            text=True,
        )
        if r.returncode == 0:
            return

    try:
        from playsound import playsound

        playsound(path, block=True)
        return
    except Exception:
        pass

    for vlc in (
        shutil.which("vlc"),
        r"C:\Program Files\VideoLAN\VLC\vlc.exe",
        r"C:\Program Files (x86)\VideoLAN\VLC\vlc.exe",
    ):
        if vlc and os.path.isfile(vlc):
            subprocess.run(
                [vlc, "-Idummy", "--play-and-exit", "--qt-start-minimized", path],
                capture_output=True,
                text=True,
            )
            return

    mpv = shutil.which("mpv")
    if mpv:
        subprocess.run([mpv, "--no-video", "--really-quiet", path], capture_output=True, text=True)
        return

    raise RuntimeError(
        "Could not play TTS audio. Install FFmpeg (for ffplay), VLC, or mpv — "
        "or: pip install playsound"
    )


def speak_text(text: str, voice: str) -> None:
    """Synthesize with Edge TTS, then play MP3 via play_mp3_blocking."""
    if not text.strip():
        return

    fd, mp3_path = tempfile.mkstemp(suffix=".mp3")
    os.close(fd)
    try:
        asyncio.run(_edge_save_mp3(text, voice, mp3_path))
        play_mp3_blocking(mp3_path)
    finally:
        try:
            os.unlink(mp3_path)
        except OSError:
            pass


_VOICE_ENV_KEYS = ("LUMEN_EMAIL", "LUMEN_PASSWORD", "GROQ_API_KEY")


def _env_strip(key: str) -> str:
    return (os.getenv(key) or "").strip()


def voice_env_ready() -> bool:
    return all(_env_strip(k) for k in _VOICE_ENV_KEYS)


def voice_env_missing_fields() -> list[str]:
    """Which voice-related vars are missing or blank after .env load."""
    return [k for k in _VOICE_ENV_KEYS if not _env_strip(k)]


def run_pipeline_once(
    ctrl: JarvisHUD,
    auth: LumenAuth,
    groq_key: str,
    hotkey: str,
    voice: str,
) -> None:
    """One push-to-talk cycle: listen → transcribe → stream → speak."""

    if not _pipeline_busy.acquire(blocking=False):
        ctrl.log("Skipped — pipeline already running")
        return

    wav_path: str | None = None
    try:
        ctrl.set_phase("listening", "Hold hotkey — capturing audio")
        ctrl.patch(user_meta="MIC · HOTKEY", assistant_meta="LUMEN · RELAY")

        wav_path = record_audio_while_hotkey(hotkey)
        if not wav_path:
            ctrl.set_phase("idle", "No audio captured")
            return

        ctrl.set_phase("transcribing", "Groq Whisper · decoding")
        text = transcribe_audio(wav_path, groq_key)
        try:
            os.unlink(wav_path)
        except OSError:
            pass
        wav_path = None

        if not text:
            ctrl.patch(user_transcript="(silence)")
            ctrl.set_phase("idle", "No speech detected")
            return

        ctrl.patch(user_transcript=text)

        accumulated = ""

        def on_delta(delta: str) -> None:
            nonlocal accumulated
            accumulated += delta
            ctrl.patch(assistant_text=accumulated)

        ctrl.set_phase("thinking", "Lumen · streaming response")
        full = send_message_stream(auth, text, on_delta)

        ctrl.patch(assistant_text=full or accumulated)

        ctrl.set_phase("speaking", "Edge TTS · playback")
        speak_text(full or accumulated, voice)

        ctrl.set_phase("idle", "Standby")
        ctrl.patch(
            footer_message="Ready — hold hotkey to speak",
            assistant_meta="LUMEN · CHANNEL A",
        )
    except Exception as e:
        ctrl.log(f"Voice pipeline error: {e}")
        ctrl.set_phase("error", str(e))
        ctrl.patch(footer_message=str(e)[:120])
    finally:
        if wav_path:
            try:
                os.unlink(wav_path)
            except OSError:
                pass
        _pipeline_busy.release()


def register_hotkey(
    ctrl: JarvisHUD,
    auth: LumenAuth,
    groq_key: str,
    hotkey: str,
    voice: str,
) -> None:
    """Register global push-to-talk (requires keyboard + PyAudio at runtime)."""
    import keyboard

    def on_hotkey():
        threading.Thread(
            target=run_pipeline_once,
            args=(ctrl, auth, groq_key, hotkey, voice),
            name="jarvis-voice",
            daemon=True,
        ).start()

    keyboard.add_hotkey(hotkey, on_hotkey)
