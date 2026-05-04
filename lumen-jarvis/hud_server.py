"""
Local Flask server for the Iron Man–style Jarvis HUD.

Intended to run in a daemon thread inside `lumen-jarvis.py` only — same OS process as the voice
daemon. Not a separate deployable service.
"""

from __future__ import annotations

import threading
from pathlib import Path
from typing import Callable

from flask import Flask, jsonify, send_from_directory

_HUD_DIR = Path(__file__).resolve().parent / "hud"


def create_app(get_state: Callable[[], dict]) -> Flask:
    app = Flask(__name__)

    @app.get("/")
    def index():
        return send_from_directory(_HUD_DIR, "index.html")

    @app.get("/style.css")
    def style_css():
        return send_from_directory(_HUD_DIR, "style.css")

    @app.get("/app.js")
    def app_js():
        return send_from_directory(_HUD_DIR, "app.js")

    @app.get("/particles.js")
    def particles_js():
        return send_from_directory(_HUD_DIR, "particles.js")

    @app.get("/api/state")
    def api_state():
        return jsonify(get_state())

    return app


def run_hud_server(
    app: Flask,
    host: str,
    port: int,
    *,
    debug: bool = False,
) -> None:
    # threaded=True so HUD stays responsive while Jarvis runs hotkey/recording
    app.run(host=host, port=port, debug=debug, use_reloader=False, threaded=True)


def start_hud_background(
    app: Flask,
    host: str,
    port: int,
) -> threading.Thread:
    t = threading.Thread(
        target=run_hud_server,
        args=(app, host, port),
        kwargs={"debug": False},
        name="jarvis-hud",
        daemon=True,
    )
    t.start()
    return t
