"""provider_state.py — Shared auth state machine, usage tracking, and model display.

Pattern:
  - Auth states: ok | missing | expired | invalid | refresh_failed | unconfigured
  - Token refresh tracking with 5-minute buffer
  - Per-call usage logging (model, tokens in/out, cache, latency)
  - Session-level metrics tracking
  - Right-side panel / dashboard data emission via MCP resources
"""

from __future__ import annotations

from dataclasses import dataclass, field
import datetime
import enum
import json
import os
from pathlib import Path
import time
from typing import Any, Callable


class AuthState(str, enum.Enum):
    OK = "ok"
    MISSING = "missing"
    EXPIRED = "expired"
    INVALID = "invalid"
    REFRESH_FAILED = "refresh_failed"
    UNCONFIGURED = "unconfigured"


@dataclass
class SessionUsage:
    totalInputTokens: int = 0
    totalOutputTokens: int = 0
    totalCacheTokens: int = 0
    totalCalls: int = 0
    totalErrors: int = 0
    totalLatencyMs: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "totalInputTokens": self.totalInputTokens,
            "totalOutputTokens": self.totalOutputTokens,
            "totalCacheTokens": self.totalCacheTokens,
            "totalCalls": self.totalCalls,
            "totalErrors": self.totalErrors,
            "totalLatencyMs": round(self.totalLatencyMs),
        }


class ProviderState:
    def __init__(
        self,
        name: str,
        credential_paths: list[str] | None = None,
        env_vars: list[str] | None = None,
        auth_command: str = "",
    ) -> None:
        self.name = name
        self.credential_paths = credential_paths or []
        self.env_vars = env_vars or []
        self.auth_command = auth_command

        self.auth_state: str = AuthState.UNCONFIGURED.value
        self.auth_detail: str = ""
        self.last_auth_check: str | None = None
        self.token_expires_at: datetime.datetime | None = None

        self.current_model: str | None = None
        self.call_log: list[dict[str, Any]] = []
        self.session_usage = SessionUsage()

    def check_credentials(self) -> dict[str, Any]:
        for env_var in self.env_vars:
            if os.environ.get(env_var):
                self.auth_state = AuthState.OK.value
                self.auth_detail = f"env:{env_var}"
                self.last_auth_check = datetime.datetime.now(datetime.timezone.utc).isoformat()
                return {"state": AuthState.OK.value, "source": f"env:{env_var}"}

        home = Path.home()
        for cred_path in self.credential_paths:
            resolved = Path(cred_path.replace("~", str(home))).resolve()
            if resolved.exists() and resolved.is_file():
                try:
                    content = resolved.read_text(encoding="utf-8").strip()
                    if content:
                        self.auth_state = AuthState.OK.value
                        self.auth_detail = f"file:{resolved}"
                        self.last_auth_check = datetime.datetime.now(datetime.timezone.utc).isoformat()
                        return {"state": AuthState.OK.value, "source": f"file:{resolved}"}
                except OSError:
                    pass

        self.auth_state = AuthState.MISSING.value
        self.auth_detail = f"No credentials found. Run: {self.auth_command}"
        self.last_auth_check = datetime.datetime.now(datetime.timezone.utc).isoformat()
        return {"state": AuthState.MISSING.value, "source": None}

    def set_token_expiry(self, expires_at: datetime.datetime | str | float) -> None:
        if isinstance(expires_at, datetime.datetime):
            self.token_expires_at = expires_at
        elif isinstance(expires_at, (int, float)):
            self.token_expires_at = datetime.datetime.fromtimestamp(expires_at, tz=datetime.timezone.utc)
        elif isinstance(expires_at, str):
            try:
                self.token_expires_at = datetime.datetime.fromisoformat(expires_at)
            except ValueError:
                self.token_expires_at = None

    def needs_refresh(self, buffer_ms: int = 5 * 60 * 1000) -> bool:
        if not self.token_expires_at:
            return False
        now = datetime.datetime.now(datetime.timezone.utc)
        if self.token_expires_at.tzinfo is None:
            now = datetime.datetime.now()
        diff_ms = (self.token_expires_at - now).total_seconds() * 1000
        return diff_ms < buffer_ms

    def is_expired(self) -> bool:
        if not self.token_expires_at:
            return False
        now = datetime.datetime.now(datetime.timezone.utc)
        if self.token_expires_at.tzinfo is None:
            now = datetime.datetime.now()
        return self.token_expires_at <= now

    def mark_ok(self, detail: str = "") -> None:
        self.auth_state = AuthState.OK.value
        if detail:
            self.auth_detail = detail
        self.last_auth_check = datetime.datetime.now(datetime.timezone.utc).isoformat()

    def mark_expired(self, detail: str = "") -> None:
        self.auth_state = AuthState.EXPIRED.value
        self.auth_detail = detail or "Token expired"
        self.last_auth_check = datetime.datetime.now(datetime.timezone.utc).isoformat()

    def mark_invalid(self, detail: str = "") -> None:
        self.auth_state = AuthState.INVALID.value
        self.auth_detail = detail or "Credentials invalid (revoked or corrupted)"
        self.last_auth_check = datetime.datetime.now(datetime.timezone.utc).isoformat()

    def mark_refresh_failed(self, detail: str = "") -> None:
        self.auth_state = AuthState.REFRESH_FAILED.value
        self.auth_detail = detail or "Token refresh failed"
        self.last_auth_check = datetime.datetime.now(datetime.timezone.utc).isoformat()

    def classify_error(self, err: Exception | str) -> str | None:
        msg = str(err).lower()
        if "invalid_grant" in msg or "revoked" in msg:
            self.mark_invalid(str(err))
            return AuthState.INVALID.value
        if "401" in msg or "authentication" in msg or "unauthorized" in msg:
            self.mark_expired(str(err))
            return AuthState.EXPIRED.value
        if "403" in msg or "forbidden" in msg or "permission" in msg:
            self.mark_invalid(f"Forbidden: {err}")
            return AuthState.INVALID.value
        if "refresh" in msg and "fail" in msg:
            self.mark_refresh_failed(str(err))
            return AuthState.REFRESH_FAILED.value
        return None

    def record_call(
        self,
        model: str,
        input_tokens: int = 0,
        output_tokens: int = 0,
        cache_tokens: int = 0,
        latency_ms: float = 0.0,
        error: Exception | str | None = None,
    ) -> dict[str, Any]:
        self.current_model = model
        entry = {
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "model": model,
            "inputTokens": input_tokens,
            "outputTokens": output_tokens,
            "cacheTokens": cache_tokens,
            "latencyMs": round(latency_ms),
            "error": str(error) if error else None,
        }
        self.call_log.append(entry)

        if not error:
            self.session_usage.totalInputTokens += input_tokens
            self.session_usage.totalOutputTokens += output_tokens
            self.session_usage.totalCacheTokens += cache_tokens
            self.session_usage.totalCalls += 1
            self.session_usage.totalLatencyMs += latency_ms
        else:
            self.session_usage.totalErrors += 1

        self.persist_usage()
        return entry

    def format_model_tag(self, model: str, metadata: dict[str, Any] | None = None) -> str:
        parts = [f"Model: {model}"]
        metadata = metadata or {}

        if "inputTokens" in metadata and "outputTokens" in metadata:
            parts.append(f"Tokens: {metadata['inputTokens']}→{metadata['outputTokens']}")
        if metadata.get("cacheTokens", 0) > 0:
            parts.append(f"Cache: {metadata['cacheTokens']}")
        latency_ms = metadata.get("latencyMs", 0)
        if latency_ms > 0:
            parts.append(f"{(latency_ms / 1000):.1f}s")

        return f"[{' | '.join(parts)}]"

    def get_status_snapshot(self) -> dict[str, Any]:
        expires_str = None
        if self.token_expires_at:
            expires_str = self.token_expires_at.isoformat()
        return {
            "provider": self.name,
            "auth": {
                "state": self.auth_state,
                "detail": self.auth_detail,
                "lastCheck": self.last_auth_check,
                "tokenExpiresAt": expires_str,
                "needsRefresh": self.needs_refresh(),
            },
            "currentModel": self.current_model,
            "session": self.session_usage.to_dict(),
            "recentCalls": self.call_log[-10:],
        }

    def persist_usage(self) -> None:
        try:
            state_dir = Path.home() / ".config" / "crush" / "provider-state"
            state_dir.mkdir(parents=True, exist_ok=True)
            file_path = state_dir / f"{self.name}.json"
            file_path.write_text(json.dumps(self.get_status_snapshot(), indent=2), encoding="utf-8")
        except OSError:
            pass

    def load_persisted_usage(self) -> dict[str, Any] | None:
        try:
            file_path = Path.home() / ".config" / "crush" / "provider-state" / f"{self.name}.json"
            if file_path.exists():
                data = json.loads(file_path.read_text(encoding="utf-8"))
                session = data.get("session", {})
                if session:
                    self.session_usage.totalInputTokens = session.get("totalInputTokens", 0)
                    self.session_usage.totalOutputTokens = session.get("totalOutputTokens", 0)
                    self.session_usage.totalCacheTokens = session.get("totalCacheTokens", 0)
                    self.session_usage.totalCalls = session.get("totalCalls", 0)
                    self.session_usage.totalErrors = session.get("totalErrors", 0)
                    self.session_usage.totalLatencyMs = session.get("totalLatencyMs", 0.0)
                if data.get("recentCalls"):
                    self.call_log = data["recentCalls"]
                return data
        except (OSError, json.JSONDecodeError):
            pass
        return None


def create_claude_state() -> ProviderState:
    return ProviderState("claude", auth_command="claude auth login")


def create_gemini_state() -> ProviderState:
    return ProviderState("gemini", auth_command="gcloud auth application-default login")


def create_codex_state() -> ProviderState:
    return ProviderState("codex", auth_command="codex auth login")


def get_all_provider_snapshots() -> dict[str, Any]:
    state_dir = Path.home() / ".config" / "crush" / "provider-state"
    snapshots: dict[str, Any] = {}
    if not state_dir.exists():
        return snapshots

    for f in state_dir.iterdir():
        if f.suffix == ".json":
            try:
                data = json.loads(f.read_text(encoding="utf-8"))
                provider = data.get("provider", f.stem)
                snapshots[provider] = data
            except (OSError, json.JSONDecodeError):
                pass
    return snapshots


def start_timer() -> Callable[[], float]:
    start = time.perf_counter()
    return lambda: (time.perf_counter() - start) * 1000.0
