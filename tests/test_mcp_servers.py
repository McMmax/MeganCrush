"""Unit tests for JSON-RPC MCP server interfaces."""

from __future__ import annotations

import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

mcp_dir = Path(__file__).resolve().parent.parent / "layout" / "mcp-servers"
if str(mcp_dir) not in sys.path:
    sys.path.insert(0, str(mcp_dir))

import claude_code_mcp
import gemini_mcp
import codex_mcp


class TestMcpServers(unittest.IsolatedAsyncioTestCase):
    def test_claude_tools_list(self) -> None:
        self.assertEqual(len(claude_code_mcp.TOOLS), 1)
        tool = claude_code_mcp.TOOLS[0]
        self.assertEqual(tool["name"], "claude_code")
        props = tool["inputSchema"]["properties"]
        self.assertIn("prompt", props)
        self.assertIn("model", props)
        self.assertIn("max_tokens", props)
        self.assertEqual(tool["inputSchema"]["required"], ["prompt"])

    def test_gemini_tools_list(self) -> None:
        self.assertEqual(len(gemini_mcp.TOOLS), 1)
        tool = gemini_mcp.TOOLS[0]
        self.assertEqual(tool["name"], "gemini")
        props = tool["inputSchema"]["properties"]
        self.assertIn("prompt", props)
        self.assertIn("model", props)
        self.assertIn("max_output_tokens", props)

    def test_codex_tools_list(self) -> None:
        self.assertEqual(len(codex_mcp.TOOLS), 1)
        tool = codex_mcp.TOOLS[0]
        self.assertEqual(tool["name"], "codex")
        props = tool["inputSchema"]["properties"]
        self.assertIn("prompt", props)

    async def test_claude_mcp_message_handling(self) -> None:
        sent_messages: list[dict] = []

        def fake_send(obj: dict) -> None:
            sent_messages.append(obj)

        with patch.object(claude_code_mcp, "send", side_effect=fake_send):
            # Test initialize
            await claude_code_mcp.handle_line(
                json.dumps({"jsonrpc": "2.0", "id": 1, "method": "initialize"})
            )
            self.assertEqual(len(sent_messages), 1)
            init_res = sent_messages[0]
            self.assertEqual(init_res["id"], 1)
            self.assertEqual(init_res["result"]["serverInfo"]["name"], "claude-code-mcp")
            self.assertEqual(init_res["result"]["protocolVersion"], "2024-11-05")

            # Test tools/list
            await claude_code_mcp.handle_line(
                json.dumps({"jsonrpc": "2.0", "id": 2, "method": "tools/list"})
            )
            self.assertEqual(len(sent_messages), 2)
            tools_res = sent_messages[1]
            self.assertEqual(tools_res["id"], 2)
            self.assertEqual(tools_res["result"]["tools"][0]["name"], "claude_code")

            # Test resources/list
            await claude_code_mcp.handle_line(
                json.dumps({"jsonrpc": "2.0", "id": 3, "method": "resources/list"})
            )
            self.assertEqual(len(sent_messages), 3)
            res_list = sent_messages[2]
            self.assertEqual(res_list["result"]["resources"][0]["uri"], "provider://claude/status")

            # Test resources/read
            await claude_code_mcp.handle_line(
                json.dumps({
                    "jsonrpc": "2.0",
                    "id": 4,
                    "method": "resources/read",
                    "params": {"uri": "provider://claude/status"},
                })
            )
            self.assertEqual(len(sent_messages), 4)
            read_res = sent_messages[3]
            content = read_res["result"]["contents"][0]
            self.assertEqual(content["uri"], "provider://claude/status")
            snapshot = json.loads(content["text"])
            self.assertEqual(snapshot["provider"], "claude")

            # Test unknown method
            await claude_code_mcp.handle_line(
                json.dumps({"jsonrpc": "2.0", "id": 99, "method": "nonexistent_method"})
            )
            self.assertEqual(len(sent_messages), 5)
            err_res = sent_messages[4]
            self.assertEqual(err_res["error"]["code"], -32601)


if __name__ == "__main__":
    unittest.main()
