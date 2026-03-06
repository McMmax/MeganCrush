# OAuth Authentication for Megan (Crush)

## Overview
Megan uses **CLI-only access** — no API keys, no SDKs. All three MCP wrappers spawn native CLI binaries that handle authentication internally via OAuth.

## Setup Status

**Claude** (via `claude` CLI)
- Auth command: `claude auth login`
- MCP spawns: `claude --print --model <model> --max-tokens <n>`

**Gemini** (via `gemini` CLI)
- Auth command: `gcloud auth application-default login`
- MCP spawns: `gemini --model <model>`

**Codex** (via `codex` CLI)
- Auth command: `codex login`
- MCP spawns: `codex run`

## Crush Configuration
- Template: `layout/crush.json` (no API keys)
- Active: `~/.config/crush/crush.json` (synced from template)
- MCP servers spawn CLI binaries directly
- Authentication delegated entirely to provider CLIs
- Usage counts against flat-rate Pro subscription quotas

## Re-authentication
If any provider loses auth:

```bash
claude auth login
gcloud auth application-default login
codex login
```

No changes to Crush config needed — CLIs re-authenticate independently.
