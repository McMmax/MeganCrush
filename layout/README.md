# Crush Multi-Agent Setup

Use **Crush** as the main orchestrating agent with **Claude Code**, **Gemini CLI**,
and **OpenAI Codex CLI** available as delegatable sub-agents via MCP.

## Architecture

```
You ──► Crush (main agent, Claude Sonnet 4)
              │
              ├──[MCP tool]──► Claude Code CLI  (claude)
              ├──[MCP tool]──► Gemini CLI        (gemini)
              └──[MCP tool]──► OpenAI Codex CLI  (codex)
```

Crush runs as your primary interface. It can call the other CLIs as tools when
the task benefits from a different model or a parallel agent loop.

## Prerequisites

```bash
# Crush
brew install charmbracelet/tap/crush   # or: npm install -g @charmland/crush

# Sub-agent CLIs
npm install -g @anthropic-ai/claude-code
npm install -g @google/gemini-cli
npm install -g @openai/codex

# Node.js (for MCP wrapper scripts)
# https://nodejs.org — v18+ recommended
```

## CLI Authentication

Authenticate each CLI (one-time, opens browser):

```bash
claude auth login                       # Claude Code + Crush main provider
gcloud auth application-default login   # Gemini CLI
codex login                             # Codex CLI
```

No API keys needed. CLI OAuth counts against Pro subscription quotas.

## Install

```bash
# Clone or download this directory, then:
bash setup.sh
```

The script will:
- Copy MCP wrapper scripts to `~/.config/crush/mcp-servers/`
- Install `crush.json` to `~/.config/crush/crush.json`
- Check that all CLIs are installed and authenticated

## What Gets Installed

```
~/.config/crush/
├── crush.json                    # Global Crush config (providers + MCP)
└── mcp-servers/
    ├── claude-code-mcp.js        # Wraps `claude` CLI as MCP server
    ├── gemini-mcp.js             # Wraps `gemini` CLI as MCP server
    └── codex-mcp.js              # Wraps `codex` CLI as MCP server
```

A project-level `AGENTS.md` is also created in your working directory — Crush
reads this to understand how and when to delegate to sub-agents.

## Usage

Just run `crush` in your project. The main agent (Claude Sonnet 4) will decide
when to delegate. You can also explicitly ask:

```
"Use Gemini to analyze this entire codebase and summarize the architecture"
"Ask Claude Code to refactor the auth module autonomously"
"Get Codex's o3 model to solve this algorithm problem"
"Ask all three agents for their approach and give me a consensus"
```

## Customizing the Main Model

Edit `~/.config/crush/crush.json` to change the active provider/model, or
switch mid-session inside Crush with the model picker.

## Per-Project Config

You can also place a `crush.json` (or `.crush.json`) in your project root to
override settings for that project. Project config takes priority over global.

## Troubleshooting

**MCP server not connecting:**
```bash
# Test a server manually
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{}}}' \
  | node ~/.config/crush/mcp-servers/claude-code-mcp.js
```

**CLI not found errors:**
Make sure the CLI is in your PATH. For npm global installs:
```bash
export PATH="$(npm root -g)/../bin:$PATH"
```

**View Crush logs:**
```bash
crush logs --follow
```
