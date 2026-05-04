/**
 * Jarvis HUD — API polling + Iron Man layout modes + fullscreen + desktop overlay drag.
 */
(function () {
  const PHASE_LABELS = {
    idle: "STANDBY",
    listening: "ACQUIRING AUDIO",
    transcribing: "DECODING SPEECH",
    thinking: "NEURAL RELAY",
    speaking: "VOCAL OUTPUT",
    error: "FAULT",
    demo: "DEMO SEQUENCE",
  };

  const LS_UI_MODE = "jarvisHudUIMode";
  const LS_FS_GATE = "jarvisHudFsGateDismissed";

  const el = (sel) => document.querySelector(sel);
  const els = (sel) => document.querySelectorAll(sel);

  function notifyLayout() {
    window.dispatchEvent(new CustomEvent("jarvis-layout"));
  }

  function setPhaseClasses(phase) {
    const body = document.body;
    const keepDesktop = body.classList.contains("ui-mode-desktop");
    body.className = "";
    body.classList.add(keepDesktop ? "ui-mode-desktop" : "ui-mode-immersive");
    body.classList.add(`phase-${phase || "idle"}`);
  }

  function setText(id, text) {
    const node = el(id);
    if (node) node.textContent = text;
  }

  function setField(key, value) {
    els(`[data-field="${key}"]`).forEach((n) => {
      n.textContent = value;
    });
  }

  function updateClock() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const s = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    setField("clock", s);
  }

  function applyPhase(phase) {
    setPhaseClasses(phase);
    const label = PHASE_LABELS[phase] || PHASE_LABELS.idle;
    setField("phase_label", label);
    setText("#core-phase", label);
    const wf = el("#waveform");
    if (wf) {
      wf.classList.toggle("active", phase === "listening" || phase === "speaking");
    }
  }

  function telemetryFromState(t) {
    if (!t) return;
    Object.keys(t).forEach((k) => {
      const n = document.querySelector(`[data-telemetry="${k}"]`);
      if (n) n.textContent = t[k];
    });
  }

  function applyUIMode(mode) {
    const body = document.body;
    body.classList.remove("ui-mode-immersive", "ui-mode-desktop");
    body.classList.add(mode === "desktop" ? "ui-mode-desktop" : "ui-mode-immersive");
    try {
      localStorage.setItem(LS_UI_MODE, mode);
    } catch (_) {}

    const btnIm = el("#btn-immersive");
    const btnDe = el("#btn-desktop");
    if (btnIm) btnIm.setAttribute("aria-pressed", mode === "immersive" ? "true" : "false");
    if (btnDe) btnDe.setAttribute("aria-pressed", mode === "desktop" ? "true" : "false");

    if (mode === "desktop" && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }

    const shell = el("#hud-shell");
    if (shell && mode === "immersive") {
      shell.style.left = "";
      shell.style.top = "";
      shell.style.right = "";
      shell.style.bottom = "";
      shell.style.width = "";
      shell.style.height = "";
    }

    notifyLayout();
  }

  function loadSavedUIMode() {
    try {
      const m = localStorage.getItem(LS_UI_MODE);
      if (m === "desktop") applyUIMode("desktop");
    } catch (_) {}
  }

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.warn("[Jarvis HUD] Fullscreen:", err);
    }
    syncFullscreenButton();
  }

  function syncFullscreenButton() {
    const btn = el("#btn-fullscreen");
    if (!btn) return;
    const on = Boolean(document.fullscreenElement);
    btn.textContent = on ? "Exit fullscreen" : "Fullscreen";
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function setupFullscreenGate() {
    const gate = el("#fs-gate");
    const btnEnter = el("#fs-gate-btn");
    const btnSkip = el("#fs-gate-skip");
    if (!gate || !btnEnter || !btnSkip) return;

    const params = new URLSearchParams(window.location.search);
    const skipParam = params.get("nogate") === "1" || params.get("nogate") === "true";

    let dismissed = false;
    try {
      dismissed = localStorage.getItem(LS_FS_GATE) === "1";
    } catch (_) {}

    if (!dismissed && !skipParam) {
      gate.hidden = false;
    }

    const dismiss = () => {
      gate.hidden = true;
      try {
        localStorage.setItem(LS_FS_GATE, "1");
      } catch (_) {}
    };

    btnEnter.addEventListener("click", async () => {
      try {
        await document.documentElement.requestFullscreen();
      } catch (err) {
        console.warn("[Jarvis HUD] Fullscreen:", err);
      }
      syncFullscreenButton();
      dismiss();
    });

    btnSkip.addEventListener("click", () => {
      dismiss();
    });
  }

  function setupModeButtons() {
    el("#btn-immersive")?.addEventListener("click", () => applyUIMode("immersive"));
    el("#btn-desktop")?.addEventListener("click", () => applyUIMode("desktop"));
    el("#btn-fullscreen")?.addEventListener("click", () => toggleFullscreen());

    document.addEventListener("fullscreenchange", syncFullscreenButton);
    syncFullscreenButton();
  }

  function setupDrag() {
    const shell = el("#hud-shell");
    const handle = el("#top-bar");
    if (!shell || !handle) return;

    let dragging = false;
    let startX = 0;
    let startY = 0;
    let origLeft = 0;
    let origTop = 0;

    function shellRectToAbsolute() {
      const r = shell.getBoundingClientRect();
      shell.style.width = `${r.width}px`;
      shell.style.left = `${r.left}px`;
      shell.style.top = `${r.top}px`;
      shell.style.right = "auto";
      shell.style.bottom = "auto";
    }

    handle.addEventListener("mousedown", (e) => {
      if (!document.body.classList.contains("ui-mode-desktop")) return;
      if (e.button !== 0) return;
      if (e.target.closest("button")) return;

      dragging = true;
      shellRectToAbsolute();
      const r = shell.getBoundingClientRect();
      origLeft = r.left;
      origTop = r.top;
      startX = e.clientX;
      startY = e.clientY;
      handle.classList.add("top-bar--dragging");
      e.preventDefault();
    });

    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      shell.style.left = `${origLeft + dx}px`;
      shell.style.top = `${origTop + dy}px`;
    });

    window.addEventListener("mouseup", () => {
      if (!dragging) return;
      dragging = false;
      handle.classList.remove("top-bar--dragging");
    });
  }

  async function poll() {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      if (!res.ok) throw new Error(res.statusText);
      const s = await res.json();

      applyPhase(s.phase);

      const statusMsg =
        s.core_message ||
        {
          idle: "All systems nominal",
          listening: "Capture active — release hotkey to finalize",
          transcribing: "Translating pressure waves to tokens",
          thinking: "Consulting Lumen relay",
          speaking: "Rendering voice matrix",
          error: "Check console / logs",
          demo: "Demonstrating interface modes",
        }[s.phase] ||
        "—";

      setText("#core-status", statusMsg);

      setField("uplink", s.uplink_status || "—");
      setField("session_id", s.session_id || "—");
      setField("hotkey_hint", s.hotkey_hint || "—");
      setField("server_url", s.server_url_display || "—");
      setField("footer_message", s.footer_message || "HUD synchronized");

      setText("#user-text", s.user_transcript || "—");
      setText("#assistant-text", s.assistant_text || "—");
      setText("#user-meta", s.user_meta || "");
      setText("#assistant-meta", s.assistant_meta || "");

      const logBox = el("#system-log");
      if (logBox && Array.isArray(s.log_lines)) {
        logBox.textContent = s.log_lines.join("\n");
        logBox.scrollTop = logBox.scrollHeight;
      }

      telemetryFromState(s.telemetry);
    } catch (e) {
      applyPhase("error");
      setText("#core-status", "Lost link to Jarvis process");
      setField("phase_label", "LINK LOST");
    }
  }

  loadSavedUIMode();
  setupFullscreenGate();
  setupModeButtons();
  setupDrag();
  notifyLayout();

  setInterval(updateClock, 500);
  updateClock();
  setInterval(poll, 80);
  poll();
})();
