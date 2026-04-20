#!/usr/bin/env python3
"""megan-sessions CLI — Terminal tool for viewing and managing Crush sessions.

Usage:
  megan-sessions                  # List all sessions
  megan-sessions list             # List all sessions
  megan-sessions status           # Daemon status
  megan-sessions watch            # Live-watch session changes
  megan-sessions send <id> <msg>  # Send message to a session
  megan-sessions kill <id>        # Deregister a session
  megan-sessions daemon start     # Start the daemon
  megan-sessions daemon stop      # Stop the daemon
  megan-sessions daemon restart   # Restart the daemon
"""

from __future__ import annotations

import asyncio
import datetime
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import time
from typing import Any

STATE_DIR = Path.home() / ".config" / "crush" / "sessions"
SOCKET_PATH = STATE_DIR / "megan-daemon.sock"
PID_FILE = STATE_DIR / "daemon.pid"
DAEMON_SCRIPT = Path(__file__).resolve().parent / "daemon.py"

# ─── Colors ──────────────────────────────────────────────────────────────────

RESET = "\033[0m"
BOLD = "\033[1m"
DIM = "\033[2m"
GREEN = "\033[32m"
YELLOW = "\033[33m"
BLUE = "\033[34m"
MAGENTA = "\033[35m"
CYAN = "\033[36m"
RED = "\033[31m"
GRAY = "\033[90m"

STATUS_COLORS = {
    "active": GREEN,
    "idle": GRAY,
    "busy": YELLOW,
    "dead": RED,
}


def time_since(iso_string: str) -> str:
    try:
        dt = datetime.datetime.fromisoformat(iso_string)
        now = datetime.datetime.now(datetime.timezone.utc)
        if dt.tzinfo is None:
            now = datetime.datetime.now()
        seconds = int((now - dt).total_seconds())
    except Exception:
        return "unknown"

    if seconds < 60:
        return f"{seconds}s"
    minutes = seconds // 60
    if minutes < 60:
        return f"{minutes}m"
    hours = minutes // 60
    return f"{hours}h {minutes % 60}m"


def format_uptime(seconds: float) -> str:
    sec = int(seconds)
    if sec < 60:
        return f"{sec}s"
    minutes = sec // 60
    if minutes < 60:
        return f"{minutes}m {sec % 60}s"
    hours = minutes // 60
    return f"{hours}h {minutes % 60}m"


def send_request(request: dict[str, Any]) -> Any:
    if not SOCKET_PATH.exists():
        raise RuntimeError(f"Cannot connect to daemon: socket not found at {SOCKET_PATH}\nRun: megan-sessions daemon start")

    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    s.settimeout(5.0)
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
    except OSError as e:
        raise RuntimeError(f"Cannot connect to daemon: {e}\nRun: megan-sessions daemon start") from e
    finally:
        s.close()


def cmd_list() -> None:
    sessions = send_request({"method": "list", "params": {}})
    if not sessions:
        print(f"{DIM}No active Crush sessions.{RESET}")
        return

    print(f"\n{BOLD}{CYAN}━━━ MEGAN SESSIONS ({len(sessions)}) ━━━{RESET}\n")

    for s in sessions:
        color = STATUS_COLORS.get(s.get("status", ""), RESET)
        age = time_since(s.get("startedAt", ""))
        beat = time_since(s.get("lastHeartbeat", ""))
        sid = s.get("id", "")[:8]
        status_text = s.get("status", "unknown").upper().ljust(6)

        print(f"{BOLD}{color}● {status_text}{RESET} {BOLD}{sid}{RESET} {DIM}│{RESET} {MAGENTA}{s.get('project')}{RESET}")
        print(f"  {DIM}PID{RESET} {s.get('pid')}  {DIM}CWD{RESET} {s.get('cwd')}")
        print(f"  {DIM}Up{RESET} {age}  {DIM}Last beat{RESET} {beat} ago")

        if s.get("currentTask"):
            print(f"  {YELLOW}⟩ {s['currentTask']}{RESET}")
        if s.get("toolsInUse"):
            print(f"  {BLUE}Tools: {', '.join(s['toolsInUse'])}{RESET}")
        if s.get("history"):
            for h in s["history"][-3:]:
                ts = h.get("timestamp", "")[11:19]
                desc = h.get("description") or h.get("type") or "activity"
                print(f"  {GRAY}  {ts} {desc}{RESET}")
        print()


def cmd_status() -> None:
    status = send_request({"method": "status", "params": {}})
    print(f"\n{BOLD}{CYAN}━━━ MEGAN DAEMON STATUS ━━━{RESET}\n")
    print(f"  {DIM}PID:{RESET}      {status.get('pid')}")
    print(f"  {DIM}Socket:{RESET}   {status.get('socketPath')}")
    print(f"  {DIM}Uptime:{RESET}   {format_uptime(status.get('uptime', 0))}")
    print(f"  {DIM}Sessions:{RESET} {status.get('sessions')}")
    print()


async def cmd_watch() -> None:
    print(f"{BOLD}{CYAN}━━━ WATCHING SESSIONS (Ctrl+C to stop) ━━━{RESET}\n")
    reader, writer = await asyncio.open_unix_connection(str(SOCKET_PATH))
    writer.write(b'{"method": "subscribe"}\n')
    await writer.drain()

    async def poll_summary() -> None:
        while True:
            await asyncio.sleep(5)
            try:
                sessions = send_request({"method": "list", "params": {}})
                sys.stdout.write(f"\r{DIM}{len(sessions)} session(s) active{RESET}   ")
                sys.stdout.flush()
            except Exception:
                pass

    poll_task = asyncio.create_task(poll_summary())

    try:
        while True:
            line = await reader.readline()
            if not line:
                break
            try:
                msg = json.loads(line.decode("utf-8", errors="replace"))
                if msg.get("type") == "event":
                    event = msg.get("event", "")
                    ts = datetime.datetime.now().strftime("%H:%M:%S")
                    color = RED if ("deregister" in event or "reap" in event) else GREEN
                    print(f"\n{GRAY}[{ts}]{RESET} {color}{event}{RESET}")
                    data = msg.get("data") or {}
                    if data.get("session"):
                        sess = data["session"]
                        print(f"  {MAGENTA}{sess.get('project')}{RESET} (pid={sess.get('pid')}, id={sess.get('id', '')[:8]})")
                    elif data.get("id"):
                        print(f"  Session: {data['id'][:8]}")
            except Exception:
                pass
    finally:
        poll_task.cancel()
        writer.close()
        await writer.wait_closed()


def cmd_send(session_prefix: str, message: str) -> None:
    sessions = send_request({"method": "list", "params": {}})
    match = next((s for s in sessions if s.get("id", "").startswith(session_prefix)), None)
    if not match:
        print(f"{RED}No session matching \"{session_prefix}\"{RESET}")
        sys.exit(1)

    self_reg = send_request({
        "method": "register",
        "params": {"pid": os.getpid(), "cwd": os.getcwd(), "labels": {"cli": True}},
    })

    try:
        res = send_request({
            "method": "send_message",
            "params": {"fromId": self_reg["id"], "toId": match["id"], "message": message},
        })
        if res.get("sent"):
            print(f"{GREEN}Message sent to {match.get('project')} ({match['id'][:8]}){RESET}")
        else:
            print(f"{RED}Failed: {res.get('error')}{RESET}")
    finally:
        send_request({"method": "deregister", "params": {"id": self_reg["id"]}})


def cmd_kill(session_prefix: str) -> None:
    sessions = send_request({"method": "list", "params": {}})
    match = next((s for s in sessions if s.get("id", "").startswith(session_prefix)), None)
    if not match:
        print(f"{RED}No session matching \"{session_prefix}\"{RESET}")
        sys.exit(1)

    send_request({"method": "deregister", "params": {"id": match["id"]}})
    print(f"{YELLOW}Deregistered session {match['id'][:8]} ({match.get('project')}){RESET}")


def cmd_daemon(action: str) -> None:
    if action == "start":
        if PID_FILE.exists():
            try:
                pid = int(PID_FILE.read_text(encoding="utf-8").strip())
                os.kill(pid, 0)
                print(f"{YELLOW}Daemon already running (pid={pid}){RESET}")
                return
            except (OSError, ValueError):
                pass

        subprocess.Popen(
            [sys.executable, str(DAEMON_SCRIPT)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            stdin=subprocess.DEVNULL,
            start_new_session=True,
        )
        print(f"{GREEN}Daemon started{RESET}")

    elif action == "stop":
        if PID_FILE.exists():
            try:
                pid = int(PID_FILE.read_text(encoding="utf-8").strip())
                os.kill(pid, signal.SIGTERM)
                print(f"{YELLOW}Daemon stopped (pid={pid}){RESET}")
                return
            except (OSError, ValueError):
                pass
        print(f"{RED}Daemon not running{RESET}")

    elif action == "restart":
        cmd_daemon("stop")
        time.sleep(0.5)
        cmd_daemon("start")
    else:
        print(f"Unknown daemon command: {action}")
        print("Usage: megan-sessions daemon [start|stop|restart]")


def main() -> None:
    args = sys.argv[1:]
    cmd = args[0] if args else "list"

    try:
        if cmd in ("list", ""):
            cmd_list()
        elif cmd == "status":
            cmd_status()
        elif cmd == "watch":
            asyncio.run(cmd_watch())
        elif cmd == "send":
            if len(args) < 3:
                print("Usage: megan-sessions send <session_id> <message>")
                sys.exit(1)
            cmd_send(args[1], " ".join(args[2:]))
        elif cmd == "kill":
            if len(args) < 2:
                print("Usage: megan-sessions kill <session_id>")
                sys.exit(1)
            cmd_kill(args[1])
        elif cmd == "daemon":
            action = args[1] if len(args) > 1 else "status"
            if action in ("start", "stop", "restart"):
                cmd_daemon(action)
            else:
                cmd_status()
        else:
            print(f"Unknown command: {cmd}")
            print("Usage: megan-sessions [list|status|watch|send|kill|daemon]")
    except KeyboardInterrupt:
        print(f"\n{DIM}Interrupted.{RESET}")
    except Exception as e:
        print(f"{RED}Error: {e}{RESET}")
        sys.exit(1)


if __name__ == "__main__":
    main()
