"""Unit tests for layout/mcp-servers/provider_state.py."""

from __future__ import annotations

import datetime
from pathlib import Path
import sys
import unittest

mcp_dir = Path(__file__).resolve().parent.parent / "layout" / "mcp-servers"
if str(mcp_dir) not in sys.path:
    sys.path.insert(0, str(mcp_dir))

from provider_state import (
    AuthState,
    ProviderState,
    create_claude_state,
    create_gemini_state,
    create_codex_state,
    start_timer,
)


class TestProviderState(unittest.TestCase):
    def test_auth_state_transitions(self) -> None:
        state = ProviderState("test-provider", auth_command="test login")
        self.assertEqual(state.auth_state, AuthState.UNCONFIGURED.value)

        state.mark_ok("cli:/usr/bin/test")
        self.assertEqual(state.auth_state, AuthState.OK.value)
        self.assertEqual(state.auth_detail, "cli:/usr/bin/test")
        self.assertIsNotNone(state.last_auth_check)

        state.mark_expired("Token expired after 1h")
        self.assertEqual(state.auth_state, AuthState.EXPIRED.value)

        state.mark_invalid("Invalid credentials")
        self.assertEqual(state.auth_state, AuthState.INVALID.value)

        state.mark_refresh_failed("Failed to refresh OAuth token")
        self.assertEqual(state.auth_state, AuthState.REFRESH_FAILED.value)

    def test_error_classification(self) -> None:
        state = ProviderState("test-provider")

        self.assertEqual(state.classify_error(Exception("401 Unauthorized")), AuthState.EXPIRED.value)
        self.assertEqual(
            state.classify_error(Exception("oauth2: cannot fetch token: invalid_grant: revoked")),
            AuthState.INVALID.value,
        )
        self.assertEqual(state.classify_error(Exception("403 Forbidden: access denied")), AuthState.INVALID.value)
        self.assertEqual(
            state.classify_error(Exception("token refresh failed with network timeout")),
            AuthState.REFRESH_FAILED.value,
        )
        self.assertIsNone(state.classify_error(Exception("some generic syntax error")))

    def test_usage_tracking_and_metrics(self) -> None:
        state = ProviderState("claude")
        entry = state.record_call(
            model="claude-sonnet-4-20250514",
            input_tokens=1500,
            output_tokens=350,
            cache_tokens=500,
            latency_ms=1200.0,
        )

        self.assertEqual(entry["model"], "claude-sonnet-4-20250514")
        self.assertEqual(entry["inputTokens"], 1500)
        self.assertEqual(entry["outputTokens"], 350)
        self.assertEqual(entry["cacheTokens"], 500)
        self.assertIsNone(entry["error"])

        self.assertEqual(state.session_usage.totalCalls, 1)
        self.assertEqual(state.session_usage.totalInputTokens, 1500)
        self.assertEqual(state.session_usage.totalOutputTokens, 350)
        self.assertEqual(state.session_usage.totalCacheTokens, 500)
        self.assertEqual(state.session_usage.totalErrors, 0)

        # Record an error call
        state.record_call(
            model="claude-sonnet-4-20250514",
            latency_ms=500.0,
            error=RuntimeError("Process crashed"),
        )
        self.assertEqual(state.session_usage.totalCalls, 1)
        self.assertEqual(state.session_usage.totalErrors, 1)

    def test_format_model_tag(self) -> None:
        state = ProviderState("claude")
        tag = state.format_model_tag(
            "claude-sonnet-4-20250514",
            {"inputTokens": 100, "outputTokens": 200, "cacheTokens": 50, "latencyMs": 1500},
        )
        self.assertIn("Model: claude-sonnet-4-20250514", tag)
        self.assertIn("Tokens: 100→200", tag)
        self.assertIn("Cache: 50", tag)
        self.assertIn("1.5s", tag)

    def test_token_expiry_checks(self) -> None:
        state = ProviderState("gemini")
        self.assertFalse(state.needs_refresh())
        self.assertFalse(state.is_expired())

        near_future = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=2)
        state.set_token_expiry(near_future)
        self.assertTrue(state.needs_refresh())
        self.assertFalse(state.is_expired())

        past = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=5)
        state.set_token_expiry(past)
        self.assertTrue(state.needs_refresh())
        self.assertTrue(state.is_expired())

    def test_timer_utility(self) -> None:
        timer = start_timer()
        elapsed = timer()
        self.assertGreaterEqual(elapsed, 0.0)


if __name__ == "__main__":
    unittest.main()
