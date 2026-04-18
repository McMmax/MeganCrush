#!/usr/bin/env python3
"""megan-session-daemon.py — Lightweight session registry for multi-instance Crush.

Runs as a singleton background process, listening on a Unix domain socket.
Each Crush instance registers on start, sends heartbeats, posts activity
updates, and queries sibling sessions.

Protocol: newline-delimited JSON over Unix socket.

State is held in-memory with JSON persistence for crash recovery.
Stale sessions (no heartbeat for 60s and dead PID) are automatically reaped.
"""

from __future__ import annotations

import asyncio
import datetime
import json
import os
from pathlib import Path
import signal
import sys
import time
from typing import Any
import uuid

# ─── Config ──────────────────────────────────────────────────────────────────

STATE_DIR = Path.home() / ".config" / "crush" / "sessions"
SOCKET_PATH = STATE_DIR / "megan-daemon.sock"
PID_FILE = STATE_DIR / "daemon.pid"
STATE_FILE = STATE_DIR / "sessions.json"
LOG_FILE = STATE_DIR / "daemon.log"

HEARTBEAT_TIMEOUT_SEC = 60.0
REAP_INTERVAL_SEC = 10.0
PERSIST_INTERVAL_SEC = 5.0
START_TIME = time.time()

# ─── Logging ─────────────────────────────────────────────────────────────────


def ensure_dir(d: Path) -> None:
    try:
        d.mkdir(parents=True, exist_ok=True)
    except OSError:
        pass


def log(level: str, msg: str) -> None:
    ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
    line = f"[{ts}] [{level.upper():<5}] {msg}\n"
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line)
    except OSError:
        pass
    if os.environ.get("MEGAN_DAEMON_VERBOSE"):
        try:
            sys.stderr.write(line)
            sys.stderr.flush()
        except OSError:
            pass


# ─── Session Store ───────────────────────────────────────────────────────────

sessions: dict[str, dict[str, Any]] = {}
message_queue: dict[str, list[dict[str, Any]]] = {}
subscribers: set[asyncio.StreamWriter] = set()


def create_session(params: dict[str, Any]) -> dict[str, Any]:
    session_id = str(uuid.uuid4())
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    cwd = params.get("cwd") or os.getcwd()
    session = {
        "id": session_id,
        "pid": params.get("pid") or os.getpid(),
        "cwd": cwd,
        "project": Path(cwd).name,
        "startedAt": now,
        "lastHeartbeat": now,
        "status": "active",
        "currentTask": "",
        "toolsInUse": [],
        "history": [],
        "labels": params.get("labels") or {},
    }
    sessions[session_id] = session
    log("info", f"Session registered: {session_id} (pid={session['pid']}, project={session['project']})")
    persist_state()
    broadcast_event("session_registered", {"session": session})
    return session


def heartbeat(session_id: str, update: dict[str, Any]) -> dict[str, Any] | None:
    session = sessions.get(session_id)
    if not session:
        return None

    session["lastHeartbeat"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    if update.get("status"):
        session["status"] = update["status"]
    if "currentTask" in update and update["currentTask"] is not None:
        session["currentTask"] = update["currentTask"]
    if update.get("toolsInUse") is not None:
        session["toolsInUse"] = update["toolsInUse"]
    if update.get("labels"):
        session["labels"].update(update["labels"])

    if update.get("activity"):
        entry = {
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            **update["activity"],
        }
        session["history"].append(entry)
        if len(session["history"]) > 50:
            session["history"] = session["history"][-50:]

    return session


def deregister_session(session_id: str) -> bool:
    session = sessions.pop(session_id, None)
    if not session:
        return False
    log("info", f"Session deregistered: {session_id}")
    persist_state()
    broadcast_event("session_deregistered", {"id": session_id})
    return True


def list_sessions(exclude_id: str | None = None) -> list[dict[str, Any]]:
    return [dict(s) for s_id, s in sessions.items() if s_id != exclude_id]


def get_session(session_id: str) -> dict[str, Any] | None:
    s = sessions.get(session_id)
    return dict(s) if s else None


def send_message(from_id: str, to_id: str, message: str) -> dict[str, Any]:
    if to_id not in sessions:
        return {"error": "target_session_not_found"}
    if to_id not in message_queue:
        message_queue[to_id] = []

    from_proj = sessions[from_id].get("project", "unknown") if from_id in sessions else "unknown"
    entry = {
        "from": from_id,
        "fromProject": from_proj,
        "message": message,
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    message_queue[to_id].append(entry)
    log("info", f"Message: {from_id} → {to_id}: {message[:80]}")
    return {"sent": True}


def get_messages(session_id: str) -> list[dict[str, Any]]:
    msgs = message_queue.pop(session_id, [])
    return msgs


def broadcast_event(event: str, data: dict[str, Any]) -> None:
    payload = json.dumps({"type": "event", "event": event, "data": data}) + "\n"
    encoded = payload.encode("utf-8")
    dead: list[asyncio.StreamWriter] = []
    for writer in subscribers:
        try:
            writer.write(encoded)
        except Exception:
            dead.append(writer)
    for writer in dead:
        subscribers.discard(writer)


def reap_stale_sessions() -> None:
    now = time.time()
    reaped: list[str] = []
    for s_id, s in list(sessions.items()):
        try:
            last_dt = datetime.datetime.fromisoformat(s["lastHeartbeat"])
            last_ts = last_dt.timestamp()
        except Exception:
            last_ts = now

        if (now - last_ts) > HEARTBEAT_TIMEOUT_SEC:
            pid = s.get("pid", 0)
            is_alive = True
            try:
                os.kill(pid, 0)
            except OSError:
                is_alive = False

            if not is_alive:
                reaped.append(s_id)

    for s_id in reaped:
        dead_s = sessions.pop(s_id, None)
        pid_str = dead_s.get("pid") if dead_s else "?"
        log("warn", f"Reaping stale session: {s_id} (pid={pid_str})")
        broadcast_event("session_reaped", {"id": s_id})

    if reaped:
        persist_state()


def persist_state() -> None:
    try:
        ensure_dir(STATE_DIR)
        STATE_FILE.write_text(json.dumps(sessions, indent=2), encoding="utf-8")
    except OSError as e:
        log("error", f"Failed to persist state: {e}")


def load_state() -> None:
    try:
        if STATE_FILE.exists():
            data = json.loads(STATE_FILE.read_text(encoding="utf-8"))
            for s_id, s in data.items():
                pid = s.get("pid", 0)
                try:
                    os.kill(pid, 0)
                    sessions[s_id] = s
                except OSError:
                    log("info", f"Skipping dead session from state: {s_id} (pid={pid})")
            log("info", f"Loaded {len(sessions)} sessions from disk")
    except Exception as e:
        log("error", f"Failed to load state: {e}")


def uptime_sec() -> float:
    return time.time() - START_TIME


def handle_request(req: dict[str, Any]) -> dict[str, Any]:
    method = req.get("method")
    params = req.get("params") or {}

    if method == "register":
        return {"result": create_session(params)}
    if method == "heartbeat":
        return {"result": heartbeat(params.get("id", ""), params.get("update") or {})}
    if method == "deregister":
        return {"result": deregister_session(params.get("id", ""))}
    if method == "list":
        return {"result": list_sessions(params.get("excludeId"))}
    if method == "get":
        return {"result": get_session(params.get("id", ""))}
    if method == "send_message":
        return {"result": send_message(params.get("fromId", ""), params.get("toId", ""), params.get("message", ""))}
    if method == "get_messages":
        return {"result": get_messages(params.get("sessionId", ""))}
    if method == "ping":
        return {"result": {"pong": True, "sessions": len(sessions), "uptime": round(uptime_sec(), 1)}}
    if method == "status":
        return {
            "result": {
                "sessions": len(sessions),
                "uptime": round(uptime_sec(), 1),
                "pid": os.getpid(),
                "socketPath": str(SOCKET_PATH),
                "allSessions": list_sessions(),
            }
        }
    return {"error": f"Unknown method: {method}"}


async def client_handler(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    is_subscribed = False
    try:
        while True:
            line_bytes = await reader.readline()
            if not line_bytes:
                break
            line = line_bytes.decode("utf-8", errors="replace").strip()
            if not line:
                continue

            try:
                req = json.loads(line)
            except json.JSONDecodeError:
                writer.write(b'{"error": "Invalid JSON"}\n')
                await writer.drain()
                continue

            if req.get("method") == "subscribe":
                is_subscribed = True
                subscribers.add(writer)
                writer.write(b'{"result": {"subscribed": true}}\n')
                await writer.drain()
                continue

            resp = handle_request(req)
            writer.write(json.dumps(resp).encode("utf-8") + b"\n")
            await writer.drain()
    except (asyncio.CancelledError, ConnectionResetError, BrokenPipeError):
        pass
    finally:
        if is_subscribed:
            subscribers.discard(writer)
        try:
            writer.close()
            await writer.wait_closed()
        except Exception:
            pass


async def background_tasks() -> None:
    while True:
        await asyncio.sleep(REAP_INTERVAL_SEC)
        reap_stale_sessions()


async def main() -> None:
    ensure_dir(STATE_DIR)

    # Clean up stale socket or detect running daemon
    if SOCKET_PATH.exists():
        try:
            r, w = await asyncio.open_unix_connection(str(SOCKET_PATH))
            w.write(b'{"method": "ping"}\n')
            await w.drain()
            line = await asyncio.wait_for(r.readline(), timeout=1.0)
            w.close()
            await w.wait_closed()
            if line:
                sys.stderr.write(f"Daemon already running on {SOCKET_PATH}\n")
                sys.exit(0)
        except Exception:
            # Socket stale, remove
            try:
                SOCKET_PATH.unlink(missing_ok=True)
            except OSError:
                pass

    load_state()

    PID_FILE.write_text(str(os.getpid()), encoding="utf-8")

    server = await asyncio.start_unix_server(client_handler, path=str(SOCKET_PATH))
    log("info", f"Daemon started on {SOCKET_PATH} (pid={os.getpid()})")

    stop_event = asyncio.Event()

    def handle_signal() -> None:
        stop_event.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        try:
            loop.add_signal_handler(sig, handle_signal)
        except (NotImplementedError, RuntimeError):
            pass

    bg = asyncio.create_task(background_tasks())

    try:
        await stop_event.wait()
    finally:
        bg.cancel()
        server.close()
        await server.wait_closed()
        persist_state()
        try:
            SOCKET_PATH.unlink(missing_ok=True)
        except OSError:
            pass
        try:
            PID_FILE.unlink(missing_ok=True)
        except OSError:
            pass
        log("info", "Daemon stopped cleanly")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        pass
