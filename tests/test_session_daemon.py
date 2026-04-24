"""Unit tests for session-daemon/daemon.py and session_client.py."""

from __future__ import annotations

import json
from pathlib import Path
import sys
import unittest

daemon_dir = Path(__file__).resolve().parent.parent / "session-daemon"
if str(daemon_dir) not in sys.path:
    sys.path.insert(0, str(daemon_dir))

import daemon


class TestSessionDaemon(unittest.TestCase):
    def setUp(self) -> None:
        daemon.sessions.clear()
        daemon.message_queue.clear()

    def tearDown(self) -> None:
        daemon.sessions.clear()
        daemon.message_queue.clear()

    def test_session_registration_and_lifecycle(self) -> None:
        # Register
        res = daemon.handle_request({
            "method": "register",
            "params": {"pid": 12345, "cwd": "/tmp/test-project", "labels": {"env": "test"}},
        })
        session = res["result"]
        sid = session["id"]
        self.assertEqual(session["pid"], 12345)
        self.assertEqual(session["project"], "test-project")
        self.assertEqual(session["status"], "active")
        self.assertEqual(session["labels"], {"env": "test"})

        # List
        list_res = daemon.handle_request({"method": "list", "params": {}})
        self.assertEqual(len(list_res["result"]), 1)
        self.assertEqual(list_res["result"][0]["id"], sid)

        # Heartbeat with task and tools update
        hb_res = daemon.handle_request({
            "method": "heartbeat",
            "params": {
                "id": sid,
                "update": {
                    "status": "busy",
                    "currentTask": "Refactoring auth module",
                    "toolsInUse": ["claude_code"],
                    "activity": {"type": "edit", "description": "Modified auth.py"},
                },
            },
        })
        updated = hb_res["result"]
        self.assertEqual(updated["status"], "busy")
        self.assertEqual(updated["currentTask"], "Refactoring auth module")
        self.assertEqual(updated["toolsInUse"], ["claude_code"])
        self.assertEqual(len(updated["history"]), 1)
        self.assertEqual(updated["history"][0]["description"], "Modified auth.py")

        # Get specific
        get_res = daemon.handle_request({"method": "get", "params": {"id": sid}})
        self.assertEqual(get_res["result"]["id"], sid)

        # Deregister
        dereg_res = daemon.handle_request({"method": "deregister", "params": {"id": sid}})
        self.assertTrue(dereg_res["result"])
        self.assertIsNone(daemon.get_session(sid))

    def test_inter_session_messaging(self) -> None:
        # Register two sessions
        s1 = daemon.create_session({"pid": 101, "cwd": "/repo/frontend"})
        s2 = daemon.create_session({"pid": 102, "cwd": "/repo/backend"})

        # Send message from s1 to s2
        send_res = daemon.handle_request({
            "method": "send_message",
            "params": {
                "fromId": s1["id"],
                "toId": s2["id"],
                "message": "Auth endpoints are deployed, ready to test",
            },
        })
        self.assertTrue(send_res["result"]["sent"])

        # Retrieve messages for s2
        msgs_res = daemon.handle_request({
            "method": "get_messages",
            "params": {"sessionId": s2["id"]},
        })
        msgs = msgs_res["result"]
        self.assertEqual(len(msgs), 1)
        self.assertEqual(msgs[0]["from"], s1["id"])
        self.assertEqual(msgs[0]["fromProject"], "frontend")
        self.assertEqual(msgs[0]["message"], "Auth endpoints are deployed, ready to test")

        # Reading again should clear the queue
        msgs_res2 = daemon.handle_request({
            "method": "get_messages",
            "params": {"sessionId": s2["id"]},
        })
        self.assertEqual(len(msgs_res2["result"]), 0)

    def test_daemon_status_and_ping(self) -> None:
        daemon.create_session({"pid": 200, "cwd": "/repo/test"})

        ping_res = daemon.handle_request({"method": "ping"})
        self.assertTrue(ping_res["result"]["pong"])
        self.assertEqual(ping_res["result"]["sessions"], 1)

        status_res = daemon.handle_request({"method": "status"})
        self.assertEqual(status_res["result"]["sessions"], 1)
        self.assertEqual(len(status_res["result"]["allSessions"]), 1)


if __name__ == "__main__":
    unittest.main()
