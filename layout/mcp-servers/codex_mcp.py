#!/usr/bin/env python3
"""MCP Server: codex_mcp.py

Delegates to the `codex` CLI which handles OAuth authentication.
NEVER uses API keys — all auth flows through `codex auth login`.
Features: auth state tracking, usage logging, model display.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
import shutil
import sys
from typing import Any

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(line_buffering=True)

server_dir = Path(__file__).resolve().parent
if str(server_dir) not in sys.path:
    sys.path.insert(0, str(server_dir))

from dashboard_log import create_logger
from provider_state import AuthState, create_codex_state, start_timer

log = create_logger("codex")
state = create_codex_state()

SUBAGENT_PROMPT_PATH = server_dir.parent / "agent-prompts" / "codex-subagent.md"
subagent_prompt = ""
try:
    if SUBAGENT_PROMPT_PATH.exists():
        subagent_prompt = SUBAGENT_PROMPT_PATH.read_text(encoding="utf-8").strip()
except OSError:
    pass


def send(obj: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


def initialize_client() -> bool:
    codex_bin = shutil.which("codex")
    if codex_bin:
        state.mark_ok(f"cli:{codex_bin}")
        log.log_init("OK", codex_bin)
        return True

    state.auth_state = AuthState.MISSING.value
    state.auth_detail = "codex CLI not found. Install: npm install -g @openai/codex && codex auth login"
    log.log_init("MISSING", state.auth_detail)
    return False


TOOLS = [
    {
        "name": "codex",
        "description": (
            "Delegate a task to OpenAI Codex via authenticated CLI. Uses OAuth/session from Codex CLI. "
            "Best for: CI/CD pipeline control, agentic workflows, complex engineering tasks."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "prompt": {
                    "type": "string",
                    "description": "The task or question to send to Codex",
                },
            },
            "required": ["prompt"],
        },
    }
]


async def run_codex(prompt: str) -> dict[str, str]:
    elapsed = start_timer()
    model = "codex-cli"
    full_prompt = (
        f"<system>\n{subagent_prompt}\n</system>\n\n{prompt}"
        if subagent_prompt
        else prompt
    )

    try:
        proc = await asyncio.create_subprocess_exec(
            "codex",
            "exec",
            "--skip-git-repo-check",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        stdout, stderr = await proc.communicate(input=full_prompt.encode("utf-8"))
        code = proc.returncode or 0
        latency_ms = elapsed()

        output_str = stdout.decode("utf-8", errors="replace")
        error_str = stderr.decode("utf-8", errors="replace")

        if code == 0:
            state.record_call(model=model, latency_ms=latency_ms)
            state.mark_ok()
            log.log_call(model, prompt, latency_ms)
            tag = state.format_model_tag(model, {"latencyMs": latency_ms})
            return {"text": output_str.strip(), "tag": tag}

        err = Exception(error_str.strip() or output_str.strip() or f"Exit code {code}")
        state.record_call(model=model, latency_ms=latency_ms, error=err)
        log.log_call(model, prompt, latency_ms, err)

        classified = state.classify_error(err)
        if classified:
            raise RuntimeError(f"Codex error ({state.auth_state}): {err}. {state.auth_detail}")
        raise RuntimeError(f"Codex CLI error: {err}")

    except Exception as err:
        latency_ms = elapsed()
        state.record_call(model=model, latency_ms=latency_ms, error=err)
        raise RuntimeError(
            f"Failed to run Codex CLI: {err}. Ensure 'codex' is installed and authenticated: codex auth login"
        ) from err


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

    if method:
        log.log_mcp_method(method)

    if method == "initialize":
        initialize_client()
        send({
            "jsonrpc": "2.0",
            "id": msg_id,
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {}, "resources": {}},
                "serverInfo": {
                    "name": "codex-mcp",
                    "version": "4.0.0",
                    "auth": state.auth_state,
                    "authDetail": state.auth_detail,
                },
            },
        })
    elif method == "tools/list":
        send({"jsonrpc": "2.0", "id": msg_id, "result": {"tools": TOOLS}})
    elif method == "tools/call":
        name = params.get("name")
        args = params.get("arguments") or {}
        if name == "codex":
            try:
                res = await run_codex(prompt=args.get("prompt", ""))
                send({
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "result": {
                        "content": [
                            {"type": "text", "text": res["text"]},
                            {"type": "text", "text": f"\n{res['tag']}"},
                        ],
                    },
                })
            except Exception as err:
                send({
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "result": {
                        "content": [{"type": "text", "text": f"Error: {err}"}],
                        "isError": True,
                    },
                })
        else:
            send({"jsonrpc": "2.0", "id": msg_id, "error": {"code": -32601, "message": "Unknown tool"}})
    elif method == "resources/list":
        send({
            "jsonrpc": "2.0",
            "id": msg_id,
            "result": {
                "resources": [
                    {
                        "uri": "provider://codex/status",
                        "name": "Codex Provider Status",
                        "description": "Auth state, usage metrics, and recent call log for Codex",
                        "mimeType": "application/json",
                    }
                ]
            },
        })
    elif method == "resources/read":
        uri = params.get("uri")
        if uri == "provider://codex/status":
            send({
                "jsonrpc": "2.0",
                "id": msg_id,
                "result": {
                    "contents": [
                        {
                            "uri": "provider://codex/status",
                            "mimeType": "application/json",
                            "text": json.dumps(state.get_status_snapshot(), indent=2),
                        }
                    ]
                },
            })
        else:
            send({"jsonrpc": "2.0", "id": msg_id, "error": {"code": -32602, "message": "Unknown resource"}})
    elif method == "notifications/initialized":
        pass
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
