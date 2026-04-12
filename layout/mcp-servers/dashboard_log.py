"""dashboard_log.py — Real-time activity logging for Megan tmux dashboard.

Writes timestamped, human-readable log entries to:
  ~/.config/crush/logs/<provider>.log

These logs are tailed by the megan-tmux.sh dashboard to show
real-time MCP server activity per agent.
"""

from __future__ import annotations

import datetime
from pathlib import Path
import sys
from typing import Any

LOG_DIR = Path.home() / ".config" / "crush" / "logs"


def ensure_log_dir() -> None:
    try:
        LOG_DIR.mkdir(parents=True, exist_ok=True)
    except OSError:
        pass


class Logger:
    def __init__(self, provider_name: str) -> None:
        self.provider_name = provider_name
        ensure_log_dir()
        self.log_path = LOG_DIR / f"{provider_name}.log"

    def log(self, level: str, message: str, **meta: Any) -> None:
        ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
        meta_str = ""
        if meta:
            meta_str = " " + " ".join(f"{k}={v}" for k, v in meta.items())
        line = f"[{ts}] [{level.upper():<5}] [{self.provider_name}] {message}{meta_str}\n"

        try:
            with open(self.log_path, "a", encoding="utf-8") as f:
                f.write(line)
        except OSError:
            pass

        try:
            sys.stderr.write(line)
            sys.stderr.flush()
        except OSError:
            pass

    def info(self, msg: str, **meta: Any) -> None:
        self.log("info", msg, **meta)

    def warn(self, msg: str, **meta: Any) -> None:
        self.log("warn", msg, **meta)

    def error(self, msg: str, **meta: Any) -> None:
        self.log("error", msg, **meta)

    def call(self, msg: str, **meta: Any) -> None:
        self.log("call", msg, **meta)

    def auth(self, msg: str, **meta: Any) -> None:
        self.log("auth", msg, **meta)

    def log_call(
        self,
        model: str,
        prompt: str,
        latency_ms: float,
        error: Exception | str | None = None,
    ) -> None:
        trunc_prompt = prompt[:120] + "…" if len(prompt) > 120 else prompt
        # Replace newlines in preview
        trunc_prompt = trunc_prompt.replace("\n", " ")
        latency_sec = f"{(latency_ms / 1000):.1f}s"
        if error:
            err_msg = str(error)
            self.log(
                "error",
                "CALL FAILED",
                model=model,
                latency=latency_sec,
                error=err_msg,
            )
        else:
            self.log("call", trunc_prompt, model=model, latency=latency_sec)

    def log_init(self, status: str, detail: str = "") -> None:
        detail_str = f": {detail}" if detail else ""
        self.log("auth", f"INIT {status}{detail_str}")

    def log_mcp_method(self, method: str) -> None:
        self.log("info", f"MCP ← {method}")

    def get_log_path(self) -> Path:
        return self.log_path


def create_logger(provider_name: str) -> Logger:
    return Logger(provider_name)
