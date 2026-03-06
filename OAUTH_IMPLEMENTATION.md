# CLI-Based Authentication Implementation

## Overview

Megan uses **native CLI binaries** (`claude`, `gemini`, `codex`) for all AI provider access. Each MCP wrapper spawns the CLI directly — no SDKs, no API keys, no credential file reading. Authentication is handled entirely by each CLI's own OAuth login flow, which counts against flat-rate Pro subscription quotas rather than per-token metered billing.

## Authentication Architecture

### How It Works

Each MCP wrapper spawns the provider's CLI binary. The CLI handles its own authentication internally using OAuth sessions cached from prior login.

```
User Authenticates CLI (once)       MCP Wrapper Spawns CLI           CLI Handles Auth
┌─────────────────────────┐        ┌──────────────────────┐        ┌──────────────────┐
│ claude auth login        │        │ spawn('claude',      │        │ Claude CLI uses   │
│ gcloud auth app-default  │        │   ['--print', ...])  │        │ its OAuth session  │
│ codex login              │        │ spawn('gemini',      │        │ Gemini CLI uses    │
│                          │        │   ['--model', ...])  │        │ its ADC creds      │
│                          │        │ spawn('codex',       │        │ Codex CLI uses     │
│                          │        │   ['run'])           │        │ its OAuth session   │
└─────────────────────────┘        └──────────────────────┘        └──────────────────┘
```

### Per-Provider Implementation

#### Claude
- **File:** `layout/mcp-servers/claude-code-mcp.js`
- **Auth Method:** `claude auth login` (OAuth session cached by CLI)
- **CLI Invocation:** `claude --print --model <model> --max-tokens <n>` with prompt on stdin
- **Init Check:** `which claude` verifies binary exists

#### Gemini
- **File:** `layout/mcp-servers/gemini-mcp.js`
- **Auth Method:** `gcloud auth application-default login` (Google ADC)
- **CLI Invocation:** `gemini --model <model>` with prompt on stdin
- **Init Check:** `which gemini` verifies binary exists

#### Codex
- **File:** `layout/mcp-servers/codex-mcp.js`
- **Auth Method:** `codex login` (OAuth session cached by CLI)
- **CLI Invocation:** `codex run` with prompt on stdin
- **Init Check:** `which codex` verifies binary exists

## Security & Economic Benefits

**No API Keys Anywhere**
- No `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, or `OPENAI_API_KEY` env vars
- No credential files read by MCP wrappers
- No SDK packages installed
- CLIs handle all authentication internally

**Subscription Billing (Not Metered)**
- CLI OAuth usage counts against flat-rate Pro subscription quotas
- Claude Pro ($20/mo), Google AI Pro ($20/mo), ChatGPT Pro ($200/mo)
- API key usage would trigger additional per-token metered billing
- This architecture saves significant money

**Standard CLI Authentication**
- `claude auth login` — Anthropic OAuth
- `gcloud auth application-default login` — Google Cloud ADC
- `codex login` — OpenAI OAuth

## Setup Instructions

### 1. Install CLIs

```bash
npm install -g @anthropic-ai/claude-code
npm install -g @anthropic-ai/codex
# gemini CLI: install via Google Cloud SDK or npm
```

### 2. Authenticate Each CLI (One-Time)

```bash
claude auth login
gcloud auth application-default login
codex login
```

### 3. Install MCP Wrappers

```bash
bash layout/setup.sh
```

This script:
- Copies MCP wrappers to `~/.config/crush/mcp-servers/`
- Verifies CLI binaries are installed (`which claude`, `which gemini`, `which codex`)
- Verifies CLI authentication status
- Reports any missing CLIs or auth

### 4. Start Megan

```bash
crush
```

## Verification

### Check CLI Authentication

```bash
claude --version && echo "Claude CLI: installed"
gemini --version && echo "Gemini CLI: installed"
codex --version && echo "Codex CLI: installed"
```

### Test Individual MCP Servers

```bash
# Test Claude
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{}}}' | \
  node ~/.config/crush/mcp-servers/claude-code-mcp.js

# Test Gemini
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{}}}' | \
  node ~/.config/crush/mcp-servers/gemini-mcp.js

# Test Codex
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{}}}' | \
  node ~/.config/crush/mcp-servers/codex-mcp.js
```

Expected response from each:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2024-11-05",
    "capabilities": { "tools": {} },
    "serverInfo": {
      "name": "<server-name>",
      "version": "4.0.0"
    }
  }
}
```

## Files

| File | Role |
|------|------|
| `layout/mcp-servers/claude-code-mcp.js` | Spawns `claude` CLI for Anthropic models |
| `layout/mcp-servers/gemini-mcp.js` | Spawns `gemini` CLI for Google models |
| `layout/mcp-servers/codex-mcp.js` | Spawns `codex` CLI for OpenAI models |
| `layout/setup.sh` | Copies MCP wrappers, verifies CLIs and auth |

## Troubleshooting

### "claude binary not found"

**Cause:** Claude CLI not installed

**Fix:**
```bash
npm install -g @anthropic-ai/claude-code
claude auth login
```

### "gemini binary not found"

**Cause:** Gemini CLI not installed

**Fix:**
```bash
# Install via your preferred method
gemini --version  # Verify
gcloud auth application-default login
```

### "codex binary not found"

**Cause:** Codex CLI not installed

**Fix:**
```bash
npm install -g @anthropic-ai/codex
codex login
```

### MCP server timeout

**Cause:** CLI not authenticated or network issues

**Fix:**
```bash
# Re-authenticate
claude auth login
gcloud auth application-default login
codex login
```

## Design Rationale

### Why CLI Spawning Instead of SDKs?

| Approach | Auth | Billing | Dependencies |
|----------|------|---------|--------------|
| **SDKs + API Keys** | Manual key management | Per-token metered ($$$) | npm packages |
| **CLI Spawning (Our Choice)** | CLI OAuth (one-time) | Flat-rate subscription | CLI binaries only |

CLI spawning:
- Uses existing CLI authentication (users already logged in)
- Counts against Pro subscription quotas (not metered billing)
- Zero npm dependencies in MCP wrappers
- Each CLI handles its own connection, retries, and error handling

### Why Not API Keys?

API key usage triggers **per-token metered billing** on top of Pro subscriptions. By using CLI OAuth, all usage counts against the flat-rate subscription quota. This is the core economic design decision behind Megan's architecture.

---

**Last Updated:** 2026-03-04
**Version:** 4.0.0
**Architecture:** CLI-only (no SDKs, no API keys)
