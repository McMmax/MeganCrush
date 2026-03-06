# CLI-Based Authentication -- Implementation Summary

## Status: COMPLETE (v4.0.0)

All three MCP wrappers now spawn native CLI binaries (`claude`, `gemini`, `codex`) directly. No SDKs, no API keys, no credential file reading. Authentication is handled entirely by each CLI's OAuth login flow.

---

## What Was Delivered

### 1. Three CLI-Spawning MCP Wrappers

Each wrapper uses `child_process.spawn()` to invoke the provider's CLI binary:

#### Claude (`layout/mcp-servers/claude-code-mcp.js`)
```bash
claude --print --model <model> --max-tokens <n>
# Prompt piped via stdin, response collected from stdout
```

#### Gemini (`layout/mcp-servers/gemini-mcp.js`)
```bash
gemini --model <model>
# Prompt piped via stdin, response collected from stdout
```

#### Codex (`layout/mcp-servers/codex-mcp.js`)
```bash
codex run
# Prompt piped via stdin, response collected from stdout
```

### 2. Updated Setup Script

`layout/setup.sh` now:
- Copies MCP wrappers to `~/.config/crush/mcp-servers/`
- Checks CLI binaries exist (`which claude`, `which gemini`, `which codex`)
- Verifies CLI authentication status
- No SDK installation, no API key checks

### 3. Updated Documentation

All docs rewritten to reflect CLI-only architecture:
- **OAUTH_IMPLEMENTATION.md** -- Technical implementation details
- **OAUTH_QUICKSTART.md** -- Quick start guide
- **CLI_SETUP.md** -- CLI installation and auth setup
- **SDK_INTEGRATION.md** -- Now "CLI Integration Guide"

---

## Architecture

```
┌──────────────────────────────────┐
│ User authenticates CLIs (once)   │
│ • claude auth login              │
│ • gcloud auth application-default│
│ • codex login                    │
└───────────────┬──────────────────┘
                │
                ▼
┌──────────────────────────────────┐
│ CLIs cache OAuth sessions        │
│ (managed internally by each CLI) │
└───────────────┬──────────────────┘
                │
                ▼
┌──────────────────────────────────┐
│ MCP wrappers spawn CLI binaries  │
│ (layout/mcp-servers/*.js)        │
│ No SDKs, no API keys             │
└───────────────┬──────────────────┘
                │
                ▼
┌──────────────────────────────────┐
│ Crush orchestrates agents        │
│ Usage counts against Pro subs    │
└──────────────────────────────────┘
```

---

## Files Modified

| File | Change |
|------|--------|
| `layout/mcp-servers/claude-code-mcp.js` | Spawns `claude` CLI (v4.0.0) |
| `layout/mcp-servers/gemini-mcp.js` | Spawns `gemini` CLI (v4.0.0) |
| `layout/mcp-servers/codex-mcp.js` | Spawns `codex run` CLI (v4.0.0) |
| `layout/mcp-servers/provider-state.js` | Cleared `credentialPaths`/`envVars` |
| `layout/mcp-servers/package.json` | Stripped all SDK dependencies |
| `layout/setup.sh` | Removed SDK install, checks CLIs only |

---

## Key Design Decisions

**CLI Spawning Over SDKs**
- CLI OAuth counts against flat-rate Pro subscription quotas
- API keys would trigger additional per-token metered billing
- Zero npm dependencies in MCP wrappers
- Each CLI manages its own auth, retries, and connections

**No API Keys Anywhere**
- No `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, or `OPENAI_API_KEY`
- No credential files read by MCP wrappers
- No SDK packages installed
- Constitution Section 6 explicitly forbids API key usage

**Subscription Economics**
- Claude Pro: $20/mo flat rate
- Google AI Pro: $20/mo flat rate
- ChatGPT Pro: $200/mo flat rate
- All usage via CLI OAuth counts against these quotas
- API key usage would cost extra on top of subscriptions

---

## Setup Instructions

### Step 1: Install CLIs

```bash
npm install -g @anthropic-ai/claude-code
npm install -g @anthropic-ai/codex
# gemini: install via Google Cloud SDK or npm
```

### Step 2: Authenticate CLIs (One-Time)

```bash
claude auth login
gcloud auth application-default login
codex login
```

### Step 3: Install MCP Wrappers

```bash
bash layout/setup.sh
```

### Step 4: Start Megan

```bash
crush
```

---

## Testing

### Test Individual MCP Servers

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{}}}' | \
  node ~/.config/crush/mcp-servers/claude-code-mcp.js

# Expected: JSON response with serverInfo.version "4.0.0"
```

### Test via Crush

```bash
crush
# Then ask Megan to delegate to Claude, Gemini, or Codex
```

---

## Troubleshooting

### Error: "claude binary not found"
**Fix:** `npm install -g @anthropic-ai/claude-code && claude auth login`

### Error: "gemini binary not found"
**Fix:** Install Gemini CLI, then `gcloud auth application-default login`

### Error: "codex binary not found"
**Fix:** `npm install -g @anthropic-ai/codex && codex login`

### Error: "CLIs not found"
**Fix:** Ensure CLI binaries are in PATH. Run `which claude gemini codex`.

---

## Version History

- **v4.0.0** (2026-03-04): CLI-only architecture
  - Removed all SDK dependencies (`@anthropic-ai/sdk`, `@google/genai`, `openai`)
  - MCP wrappers now spawn CLI binaries directly
  - Authentication via CLI OAuth (no API keys)
  - Usage counts against Pro subscription quotas
- **v2.0.0** (2026-03-04): OAuth/session-based auth (SDK era, superseded)

---

**Implementation Complete** -- v4.0.0

All three MCP wrappers spawn native CLI binaries. No SDKs, no API keys.
Run `bash layout/setup.sh` then `crush` to start.
