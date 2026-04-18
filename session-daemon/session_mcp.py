#!/usr/bin/env python3
"""session_mcp.py — MCP server for multi-instance Crush session awareness.

Provides tools for Crush/Megan to:
- See all running sibling sessions and what they're doing
- Send messages to other sessions
- Receive messages from other sessions
- Register/deregister the current session

Auto-starts the session daemon if not running.
Follows the same MCP stdio JSON-RPC pattern as claude_code_mcp.py.
"""

from __future__ import annotations

import asyncio
import datetime
import json
from pathlib import Path
import sys
from typing import Any

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(line_buffering=True)

server_dir = Path(__file__).resolve().parent
if str(server_dir) not in sys.path:
    sys.path.insert(0, str(server_dir))

from session_client import SessionClient

client = SessionClient()
registered = False


def send(obj: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


TOOLS = [
    {
        "name": "sessions_list",
        "description": (
            "List all active Megan/Crush sessions. Shows each session's project, working directory, "
            "current task, status (active/idle/busy), tools in use, and recent activity history. "
            "Use this to see what other Crush instances are working on."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "sessions_get",
        "description": (
            "Get detailed information about a specific session by ID, including its full activity history."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "session_id": {
                    "type": "string",
                    "description": "The session ID to look up",
                },
            },
            "required": ["session_id"],
        },
    },
    {
        "name": "sessions_send_message",
        "description": (
            "Send a message to another Crush session. The message will be queued and "
            "delivered when that session checks for messages. Use this for coordination "
            "between parallel instances (e.g., 'I finished the auth module, you can start on routes')."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "to_session_id": {
                    "type": "string",
                    "description": "Target session ID to send the message to",
                },
                "message": {
                    "type": "string",
                    "description": "The message content to send",
                },
            },
            "required": ["to_session_id", "message"],
        },
    },
    {
        "name": "sessions_get_messages",
        "description": (
            "Check for messages sent to this session from other Crush instances. "
            "Returns and clears the message queue."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "sessions_update_task",
        "description": (
            "Update this session's current task description so other sessions can see "
            "what you're working on. Call this when starting a new task."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "task": {
                    "type": "string",
                    "description": "Description of the current task (e.g., 'Refactoring auth module')",
                },
            },
            "required": ["task"],
        },
    },
    {
        "name": "sessions_daemon_status",
        "description": (
            "Get the session daemon's status including uptime, total sessions, and socket path."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
]


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


def format_session_list(sessions_data: list[dict[str, Any]] | None) -> str:
    if not sessions_data:
        return "No other Crush sessions are currently running."

    lines = [f"**{len(sessions_data)} active session(s):**\n"]

    for s in sessions_data:
        age = time_since(s.get("startedAt", ""))
        last_beat = time_since(s.get("lastHeartbeat", ""))
        sid = s.get("id", "unknown")
        lines.append(f"### Session `{sid[:8]}`")
        lines.append(f"- **Project:** {s.get('project', 'unknown')} (`{s.get('cwd', '')}`)")
        lines.append(f"- **PID:** {s.get('pid')}")
        lines.append(f"- **Status:** {s.get('status')}")
        lines.append(f"- **Running for:** {age}")
        lines.append(f"- **Last heartbeat:** {last_beat} ago")

        if s.get("currentTask"):
            lines.append(f"- **Current task:** {s['currentTask']}")
        if s.get("toolsInUse"):
            lines.append(f"- **Tools in use:** {', '.join(s['toolsInUse'])}")
        if s.get("history"):
            lines.append("- **Recent activity:**")
            for h in s["history"][-5:]:
                ts = h.get("timestamp", "")[:19].replace("T", " ")
                desc = h.get("description") or h.get("type") or json.dumps(h)
                lines.append(f"  - [{ts}] {desc}")
        if s.get("labels"):
            lines.append(f"- **Labels:** {json.dumps(s['labels'])}")
        lines.append("")

    return "\n".join(lines)


def format_session_detail(session_data: dict[str, Any] | None) -> str:
    if not session_data:
        return "Session not found."
    s = session_data
    lines = [
        f"## Session `{s.get('id', '')}`",
        f"- **Project:** {s.get('project')} (`{s.get('cwd')}`)",
        f"- **PID:** {s.get('pid')}",
        f"- **Status:** {s.get('status')}",
        f"- **Started:** {s.get('startedAt')}",
        f"- **Last heartbeat:** {s.get('lastHeartbeat')}",
    ]
    if s.get("currentTask"):
        lines.append(f"- **Current task:** {s['currentTask']}")
    if s.get("toolsInUse"):
        lines.append(f"- **Tools in use:** {', '.join(s['toolsInUse'])}")
    if s.get("labels"):
        lines.append(f"- **Labels:** {json.dumps(s['labels'])}")

    if s.get("history"):
        lines.append(f"\n### Activity History (last {min(len(s['history']), 50)} entries)")
        for h in s["history"]:
            ts = h.get("timestamp", "")[:19].replace("T", " ")
            desc = h.get("description") or h.get("type") or json.dumps(h)
            lines.append(f"- [{ts}] {desc}")

    return "\n".join(lines)


async def ensure_registered() -> None:
    global registered
    if registered:
        return
    try:
        await client.register(cwd=str(Path.cwd()))
        registered = True
    except Exception as e:
        sys.stderr.write(f"[session-mcp] Registration failed: {e}\n")


async def handle_line(line: str) -> None:
    line = line.strip()
    if not line:
        return

    try:
        msg = json.loads(line)
    except json.JSONDecodeError:
        return

    msg_id = msg.get("id")
    method = msg.get("method")
    params = msg.get("params") or {}

    if method == "initialize":
        send({
            "jsonrpc": "2.0",
            "id": msg_id,
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {}, "resources": {}},
                "serverInfo": {
                    "name": "megan-sessions",
                    "version": "1.0.0",
                },
            },
        })
    elif method == "notifications/initialized":
        await ensure_registered()
    elif method == "tools/list":
        send({"jsonrpc": "2.0", "id": msg_id, "result": {"tools": TOOLS}})
    elif method == "tools/call":
        name = params.get("name")
        args = params.get("arguments") or {}
        try:
            await ensure_registered()

            if name == "sessions_list":
                sess_list = await client.list_sessions()
                send({
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "result": {"content": [{"type": "text", "text": format_session_list(sess_list)}]},
                })
            elif name == "sessions_get":
                sess = await client.get_session(args.get("session_id", ""))
                send({
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "result": {"content": [{"type": "text", "text": format_session_detail(sess)}]},
                })
            elif name == "sessions_send_message":
                res = await client.send_message(args.get("to_session_id", ""), args.get("message", ""))
                text = (
                    f"Message sent to session {args.get('to_session_id', '')[:8]}."
                    if res.get("sent")
                    else f"Failed: {res.get('error', 'unknown error')}"
                )
                send({
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "result": {"content": [{"type": "text", "text": text}]},
                })
            elif name == "sessions_get_messages":
                msgs = await client.get_messages()
                if not msgs:
                    text = "No new messages."
                else:
                    msg_lines = [f"**{len(msgs)} message(s):**\n"]
                    for m in msgs:
                        ts = m.get("timestamp", "")[:19].replace("T", " ")
                        from_p = m.get("fromProject", "unknown")
                        from_id = m.get("from", "")[:8]
                        msg_lines.append(f"- [{ts}] From **{from_p}** (`{from_id}`): {m.get('message', '')}")
                    text = "\n".join(msg_lines)
                send({
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "result": {"content": [{"type": "text", "text": text}]},
                })
            elif name == "sessions_update_task":
                task_desc = args.get("task", "")
                await client.update_task(task_desc)
                send({
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "result": {"content": [{"type": "text", "text": f"Task updated to: '{task_desc}'"}]},
                })
            elif name == "sessions_daemon_status":
                status = await client.send({"method": "status", "params": {}})
                text = (
                    f"**Daemon Status:**\n"
                    f"- **PID:** {status.get('pid')}\n"
                    f"- **Socket:** `{status.get('socketPath')}`\n"
                    f"- **Uptime:** {status.get('uptime')}s\n"
                    f"- **Active Sessions:** {status.get('sessions')}"
                )
                send({
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "result": {"content": [{"type": "text", "text": text}]},
                })
            else:
                send({"jsonrpc": "2.0", "id": msg_id, "error": {"code": -32601, "message": "Unknown tool"}})
        except Exception as err:
            send({
                "jsonrpc": "2.0",
                "id": msg_id,
                "result": {"content": [{"type": "text", "text": f"Error: {err}"}], "isError": True},
            })
    elif method == "resources/list":
        send({"jsonrpc": "2.0", "id": msg_id, "result": {"resources": []}})
    else:
        if msg_id is not None:
            send({"jsonrpc": "2.0", "id": msg_id, "error": {"code": -32601, "message": "Method not found"}})


async def main() -> None:
    loop = asyncio.get_running_loop()
    reader = asyncio.StreamReader()
    protocol = asyncio.StreamReaderProtocol(reader)
    await loop.connect_read_pipe(lambda: protocol, sys.stdin)

    while True:
        line_bytes = await reader.readline()
        if not line_bytes:
            break
        await handle_line(line_bytes.decode("utf-8", errors="replace"))


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, BrokenPipeError):
        pass
