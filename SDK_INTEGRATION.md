# CLI Integration Guide

This document describes Megan's integration with AI providers through their native CLI tools. All access uses OAuth-based authentication from the CLIs — no API keys or SDKs are used.

## Overview

Megan's MCP wrappers spawn native CLI processes instead of importing SDKs:

| Provider | CLI Binary | MCP Wrapper | Auth Method |
|----------|-----------|-------------|-------------|
| **Anthropic** | `claude` | `claude-code-mcp.js` | `claude auth login` (OAuth) |
| **Google** | `gemini` | `gemini-mcp.js` | `gcloud auth application-default login` (ADC) |
| **OpenAI** | `codex` | `codex-mcp.js` | `codex login` (OAuth) |

## Why CLIs Instead of SDKs?

The user has Pro subscriptions (Claude Pro, Google AI Pro, ChatGPT Pro). CLI OAuth counts usage against flat-rate subscription quotas. Using API keys with SDKs would trigger per-token metered billing on top of the subscription — wasting money.

| Approach | Billing | Auth |
|----------|---------|------|
| **SDK + API Key** | Per-token metered (expensive) | API key env var |
| **CLI + OAuth** (ours) | Flat-rate subscription (cheap) | CLI OAuth login |

## Authentication Setup

One-time setup for each CLI:

```bash
claude auth login                       # Opens browser for Anthropic OAuth
gcloud auth application-default login   # Opens browser for Google OAuth
codex login                             # Opens browser for OpenAI OAuth
```

No environment variables, no API keys, no secrets in shell history.

## Claude CLI Integration

**Binary:** `claude`
**Invocation:** `claude --print --model <model> --max-tokens <n>`
**Input:** Prompt piped via stdin
**Output:** Response text on stdout

### Supported Models
- `claude-sonnet-4-20250514` (default, cost-effective)
- `claude-opus-4-6` (deep reasoning, permission required)

### Usage in MCP

```javascript
const result = await runClaude(
  "Refactor this code",
  "claude-opus-4-6",
  4096
);
```

## Gemini CLI Integration

**Binary:** `gemini`
**Invocation:** `gemini --model <model>`
**Input:** Prompt piped via stdin
**Output:** Response text on stdout

### Supported Models
- `gemini-2.5-pro` (default, 1M token context)
- `gemini-2.5-flash` (faster, cheaper)
- `gemini-2.5-flash-lite` (fastest, cheapest)

### Usage in MCP

```javascript
const result = await runGemini(
  "Analyze entire codebase",
  "gemini-2.5-pro",
  4096
);
```

## Codex CLI Integration

**Binary:** `codex`
**Invocation:** `codex run`
**Input:** Prompt piped via stdin
**Output:** Response text on stdout

### Usage in MCP

```javascript
const result = await runCodex(
  "Solve this algorithm",
  "o4-mini",
  4096
);
```

## Megan's Delegation Decision Tree

1. **Is this a massive context task?** → Use **Gemini** (1M tokens)
2. **Is this algorithmic/reasoning?** → Use **Codex** (o3/o4-mini reasoning models)
3. **Is this architectural/creative?** → Use **Claude** (Opus for depth, Sonnet for speed)

## Troubleshooting

### "CLI not found" error

Verify the CLI is installed and in PATH:

```bash
which claude   # Should show path
which gemini   # Should show path
which codex    # Should show path
```

### "Authentication failed"

Re-run the CLI's login command:

```bash
claude auth login
gcloud auth application-default login
codex login
```

### High token usage

Use model selection to optimize:

```
gemini-2.5-flash       vs  gemini-2.5-pro (better quality)
claude-sonnet-4        vs  claude-opus-4-6 (deeper reasoning)
```

## Future Enhancements

- [ ] **Vision attachment** — Pass images to prompts
- [ ] **Token limit enforcement** — Automatic fallback to cheaper models
