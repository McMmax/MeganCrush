"""session_client.py — Client library for Crush instances to communicate with the session daemon.

Provides:
- Auto-start daemon if not running
- Register/deregister sessions
- Heartbeat with activity updates
- Query sibling sessions
- Send/receive messages between sessions
"""

from __future__ import annotations

import asyncio
import atexit
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
from typing import Any

STATE_DIR = Path.home() / ".config" / "crush" / "sessions"
SOCKET_PATH = STATE_DIR / "megan-daemon.sock"
PID_FILE = STATE_DIR / "daemon.pid"
DAEMON_SCRIPT = Path(__file__).resolve().parent / "daemon.py"

HEARTBEAT_INTERVAL_SEC = 15.0
CONNECT_TIMEOUT_SEC = 5.0


class SessionClient:
    def __init__(self) -> None:
        self.session_id: str | None = None
        self._current_task: str = ""
        self._tools_in_use: list[str] = []
        self._status: str = "active"
        self._heartbeat_task: asyncio.Task[None] | None = None

    def is_daemon_running(self) -> bool:
        try:
            if not PID_FILE.exists():
                return False
            pid = int(PID_FILE.read_text(encoding="utf-8").strip())
            os.kill(pid, 0)
            return True
        except (OSError, ValueError):
            return False

    async def ensure_daemon(self) -> bool:
        if self.is_daemon_running() and SOCKET_PATH.exists():
            return True

        # Spawn daemon detached
        proc = subprocess.Popen(
            [sys.executable, str(DAEMON_SCRIPT)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            stdin=subprocess.DEVNULL,
            start_new_session=True,
        )

        # Wait up to 5 seconds for socket to appear
        for _ in range(20):
            await asyncio.sleep(0.25)
            if SOCKET_PATH.exists():
                return True
        return False

    async def send(self, request: dict[str, Any]) -> Any:
        await self.ensure_daemon()

        try:
            reader, writer = await asyncio.wait_for(
                asyncio.open_unix_connection(str(SOCKET_PATH)),
                timeout=CONNECT_TIMEOUT_SEC,
            )
        except Exception as err:
            raise RuntimeError(f"Daemon connection failed: {err}") from err

        try:
            payload = json.dumps(request) + "\n"
            writer.write(payload.encode("utf-8"))
            await writer.drain()

            line_bytes = await asyncio.wait_for(reader.readline(), timeout=CONNECT_TIMEOUT_SEC)
            line = line_bytes.decode("utf-8", errors="replace").strip()
            if not line:
                raise RuntimeError("Empty response from session daemon")

            response = json.loads(line)
            if "error" in response:
                raise RuntimeError(response["error"])
            return response.get("result")
        finally:
            writer.close()
            try:
                await writer.wait_closed()
            except Exception:
                pass

    def send_sync(self, request: dict[str, Any]) -> Any:
        """Synchronous request helper for non-async callers and CLI commands."""
        if not self.is_daemon_running() or not SOCKET_PATH.exists():
            subprocess.Popen(
                [sys.executable, str(DAEMON_SCRIPT)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                stdin=subprocess.DEVNULL,
                start_new_session=True,
            )
            for _ in range(20):
                time.sleep(0.25)
                if SOCKET_PATH.exists():
                    break

        s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        s.settimeout(CONNECT_TIMEOUT_SEC)
        try:
            s.connect(str(SOCKET_PATH))
            payload = json.dumps(request) + "\n"
            s.sendall(payload.encode("utf-8"))

            buffer = ""
            while True:
                chunk = s.recv(4096)
                if not chunk:
                    break
                buffer += chunk.decode("utf-8", errors="replace")
                if "\n" in buffer:
                    line = buffer.split("\n", 1)[0].strip()
                    resp = json.loads(line)
                    if "error" in resp:
                        raise RuntimeError(resp["error"])
                    return resp.get("result")
            raise RuntimeError("Incomplete response from daemon")
        finally:
            s.close()

    async def register(self, cwd: str | None = None, labels: dict[str, Any] | None = None) -> dict[str, Any]:
        result = await self.send({
            "method": "register",
            "params": {
                "pid": os.getppid() or os.getpid(),
                "cwd": cwd or os.getcwd(),
                "labels": labels or {},
            },
        })

        self.session_id = result.get("id")
        self._start_heartbeat_loop()

        # Register cleanup hook
        atexit.register(self._cleanup_sync)
        return result

    def _start_heartbeat_loop(self) -> None:
        async def _loop() -> None:
            while self.session_id:
                await asyncio.sleep(HEARTBEAT_INTERVAL_SEC)
                try:
                    await self._send_heartbeat()
                except Exception:
                    pass

        self._heartbeat_task = asyncio.create_task(_loop())

    async def _send_heartbeat(self) -> Any:
        if not self.session_id:
            return None
        return await self.send({
            "method": "heartbeat",
            "params": {
                "id": self.session_id,
                "update": {
                    "status": self._status,
                    "currentTask": self._current_task,
                    "toolsInUse": self._tools_in_use,
                },
            },
        })

    async def deregister(self) -> None:
        if self._heartbeat_task:
            self._heartbeat_task.cancel()
            self._heartbeat_task = None
        if not self.session_id:
            return
        sid = self.session_id
        self.session_id = None
        try:
            await self.send({"method": "deregister", "params": {"id": sid}})
        except Exception:
            pass

    def _cleanup_sync(self) -> None:
        if not self.session_id:
            return
        try:
            self.send_sync({"method": "deregister", "params": {"id": self.session_id}})
        except Exception:
            pass
        self.session_id = None

    async def update_task(self, task: str) -> Any:
        self._current_task = task
        self._status = "busy" if task else "idle"
        if not self.session_id:
            return None
        return await self.send({
            "method": "heartbeat",
            "params": {
                "id": self.session_id,
                "update": {
                    "currentTask": task,
                    "status": self._status,
                    "activity": {"type": "task", "description": task},
                },
            },
        })

    async def update_tools(self, tools: list[str]) -> Any:
        self._tools_in_use = tools
        if not self.session_id:
            return None
        return await self.send({
            "method": "heartbeat",
            "params": {
                "id": self.session_id,
                "update": {"toolsInUse": tools},
            },
        })

    async def post_activity(self, activity: dict[str, Any]) -> Any:
        if not self.session_id:
            return None
        return await self.send({
            "method": "heartbeat",
            "params": {
                "id": self.session_id,
                "update": {"activity": activity},
            },
        })

    async def list_sessions(self) -> list[dict[str, Any]]:
        return await self.send({"method": "list", "params": {"excludeId": self.session_id}})

    async def get_session(self, session_id: str) -> dict[str, Any] | None:
        return await self.send({"method": "get", "params": {"id": session_id}})

    async def ping(self) -> dict[str, Any]:
        return await self.send({"method": "ping", "params": {}})

    async def send_message(self, to_id: str, message: str) -> dict[str, Any]:
        if not self.session_id:
            raise RuntimeError("Not registered")
        return await self.send({
            "method": "send_message",
            "params": {
                "fromId": self.session_id,
                "toId": to_id,
                "message": message,
            },
        })

    async def get_messages(self) -> list[dict[str, Any]]:
        if not self.session_id:
            return []
        return await self.send({
            "method": "get_messages",
            "params": {"sessionId": self.session_id},
        })
