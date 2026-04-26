# Megan: Intelligent Multi‑Agent Orchestrator

Megan is an AI coding assistant built on **Crush**. She orchestrates three specialized sub‑agents (Claude Code, Gemini CLI, Codex CLI) to solve complex development tasks with maximum efficiency and minimal cost.

**Core Philosophy:** *“The right model for the right job at the right price.”* Megan leverages your premium subscriptions intelligently, always preferring free or cheap resources and reserving expensive models (Claude Opus/Sonnet) for tasks that truly need them – and only with your permission.

## Key Features
- **Unified Orchestration via Crush:** Direct Megan's workflow from terminal sessions with context-aware delegation.
- **Native Python MCP Servers:** 100% zero-dependency Python standard library implementation of the Model Context Protocol (JSON-RPC 2.0 over stdio) for Claude Code, Gemini CLI, and Codex CLI.
- **Sub-Agent Session Daemon:** High-performance Unix domain socket IPC daemon (`session-daemon`) for inter-session coordination, activity heartbeats, and live terminal monitoring.
- **Cost & Tier Optimization:** Autonomous model tiering leveraging Pro subscriptions with permission gates for premium frontier models.
- **Zero API Keys Required:** All sub-agents authenticate directly through their native CLI OAuth credentials.

## Architecture Overview

```
Crush (Host Orchestrator)
  │
  ├── MCP (stdio JSON-RPC) ──► layout/mcp-servers/claude_code_mcp.py  ──► claude CLI
  ├── MCP (stdio JSON-RPC) ──► layout/mcp-servers/gemini_mcp.py       ──► gemini CLI
  ├── MCP (stdio JSON-RPC) ──► layout/mcp-servers/codex_mcp.py        ──► codex CLI
  │
  └── MCP (stdio JSON-RPC) ──► session-daemon/session_mcp.py
                                        │
                                 (Unix IPC Socket)
                                        ▼
                               session-daemon/daemon.py  ◄── megan-sessions (CLI)
```

## Your Subscription Stack
- **GitHub Copilot Pro (Student)** – Free unlimited access to `gpt-5mini`, `gpt-4.1`, `gpt-4o`; plus `gpt-5.1-codex-mini` and `claude-4.5-haiku` at 0.33x usage cost.
- **ChatGPT Pro (Codex)** – Full access to Codex models: `gpt-5.1-codex-mini`, `gpt-5.2`, `gpt-5.1-codex-max`, `gpt-5.2-codex`, `gpt-5.3-codex` (usage included).
- **Google AI Pro (Gemini)** – Access to Gemini models: `gemini-2.5-flash-lite`, `gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-3-flash-preview`, `gemini-3.1-pro-preview`.
- **Claude Pro** – Access to Claude Code CLI with `Opus 4.6` and `Sonnet 4.6` (token‑based, limited).

## Getting Started

### Prerequisites
- Python 3.10+
- Charm [Crush](https://github.com/charmbracelet/crush)
- Sub-agent CLIs authenticated via OAuth (`claude auth login`, `gcloud auth application-default login`, `codex auth login`)

### Setup
```bash
# Install MCP server wrappers and session daemon
bash layout/setup.sh

# Start Crush with Megan's agent configuration
crush
```

### Running Tests
The test suite runs with standard library `unittest` (no external packages required) or `pytest`:
```bash
python3 -m unittest discover -v -s tests
```

For detailed operational rules, see `MEGAN_CONSTITUTION.md` and `WORKFLOWS.md`.