#!/usr/bin/env python3
"""MCP Server: gemini_mcp.py

Delegates to the `gemini` CLI which handles OAuth authentication via gcloud.
NEVER uses API keys — all auth flows through `gcloud auth application-default login`.
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
from provider_state import AuthState, create_gemini_state, start_timer

log = create_logger("gemini")
state = create_gemini_state()

SUBAGENT_PROMPT_PATH = server_dir.parent / "agent-prompts" / "gemini-subagent.md"
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
    gemini_bin = shutil.which("gemini")
    if gemini_bin:
        state.mark_ok(f"cli:{gemini_bin}")
        log.log_init("OK", gemini_bin)
        return True

    state.auth_state = AuthState.MISSING.value
    state.auth_detail = "gemini CLI not found. Install: npm install -g @google/gemini-cli && gcloud auth application-default login"
    log.log_init("MISSING", state.auth_detail)
    return False


TOOLS = [
    {
        "name": "gemini",
        "description": (
            "Delegate a task to Google Gemini via authenticated CLI. Uses OAuth/ADC from gcloud CLI. "
            "Best for: long context (1M tokens), multimodal, prompt caching (90% savings)."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "prompt": {
                    "type": "string",
                    "description": "The task or question to send to Gemini",
                },
                "model": {
                    "type": "string",
                    "description": "Gemini model to use (gemini-2.5-pro, gemini-2.5-flash, gemini-2.5-flash-lite). Defaults to gemini-2.5-pro.",
                    "default": "gemini-2.5-pro",
                },
                "max_output_tokens": {
                    "type": "number",
                    "description": "Maximum output tokens (default 4096)",
                    "default": 4096,
                },
            },
            "required": ["prompt"],
        },
    }
]


async def run_gemini(
    prompt: str,
    model: str = "gemini-2.5-pro",
    max_output_tokens: int = 4096,
) -> dict[str, str]:
    elapsed = start_timer()
    full_prompt = (
        f"<system>\n{subagent_prompt}\n</system>\n\n{prompt}"
        if subagent_prompt
        else prompt
    )

    try:
        args = [
            "--prompt",
            full_prompt,
            "--model",
            model,
            "--output-format",
            "text",
        ]

        proc = await asyncio.create_subprocess_exec(
            "gemini",
            *args,
            stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        stdout, stderr = await proc.communicate()
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
            raise RuntimeError(f"Gemini error ({state.auth_state}): {err}. {state.auth_detail}")
        raise RuntimeError(f"Gemini CLI error: {err}")

    except Exception as err:
        latency_ms = elapsed()
        state.record_call(model=model, latency_ms=latency_ms, error=err)
        raise RuntimeError(
            f"Failed to run Gemini CLI: {err}. Ensure 'gemini' is installed and authenticated: gcloud auth application-default login"
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
                    "name": "gemini-mcp",
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
        if name == "gemini":
            try:
                res = await run_gemini(
                    prompt=args.get("prompt", ""),
                    model=args.get("model", "gemini-2.5-pro"),
                    max_output_tokens=int(args.get("max_output_tokens", 4096)),
                )
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
                        "uri": "provider://gemini/status",
                        "name": "Gemini Provider Status",
                        "description": "Auth state, usage metrics, and recent call log for Gemini",
                        "mimeType": "application/json",
                    }
                ]
            },
        })
    elif method == "resources/read":
        uri = params.get("uri")
        if uri == "provider://gemini/status":
            send({
                "jsonrpc": "2.0",
                "id": msg_id,
                "result": {
                    "contents": [
                        {
                            "uri": "provider://gemini/status",
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
