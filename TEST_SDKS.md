# CLI & MCP Server Testing

Two test scripts validate Megan's CLI-only architecture and model selection:

## Quick Test (Recommended)

```bash
node test-mcp-models.js
```

**What it checks:**
- All 3 MCP servers respond correctly
- CLI binaries installed (`which claude`, `which gemini`, `which codex`)
- Default model for each provider and why
- Which CLIs need installation or authentication

**Current Status:**
- **Claude MCP**: Ready (spawns `claude` CLI)
- **Gemini MCP**: Ready (spawns `gemini` CLI)
- **Codex MCP**: Ready (spawns `codex` CLI)

## Detailed CLI Test

```bash
node test-sdks.js
```

**What it checks:**
- CLI binary availability via `which`
- Full MCP server handshake (JSON-RPC initialize)
- Server version (should be 4.0.0)

## Model Selection Logic

### Claude (claude-sonnet-4-20250514)
- **Why**: Cost-effective ($3/$15), 200K context, excellent reasoning
- **Best for**: Code analysis, docs, complex reasoning, long context
- **Alternative**: claude-opus-4-20250514 (if reasoning depth needed)

### Gemini (gemini-2.5-pro)
- **Why**: 1M token context, 90% cached prompt savings, multimodal
- **Best for**: Long documents, images, repeated queries, cost-sensitive at scale
- **Alternatives**: gemini-2.5-flash, gemini-2.5-flash-lite (faster/cheaper)

### Codex (o1 via Codex CLI)
- **Why**: Agentic workflows, CI/CD pipelines, complex engineering tasks
- **Best for**: Multi-step workflows, sandbox execution, code modification
- **Note**: Model selected by Codex CLI, no direct override

## Authentication Quick Reference

If a CLI needs setup:

```bash
# Claude
npm install -g @anthropic-ai/claude-code
claude auth login

# Gemini
# Install gemini CLI
gcloud auth application-default login

# Codex
npm install -g @anthropic-ai/codex
codex login
```

## Architecture

All three providers use **CLI-only** access (no SDKs, no API keys):

```
┌─────────────────────────────────────────┐
│  Crush (Megan)                          │
├─────────────────────────────────────────┤
│  ├─ MCP Server: claude-code-mcp.js      │
│  │  └─ Spawns: claude CLI              │
│  │  └─ Auth: claude auth login          │
│  ├─ MCP Server: gemini-mcp.js           │
│  │  └─ Spawns: gemini CLI              │
│  │  └─ Auth: gcloud auth app-default    │
│  └─ MCP Server: codex-mcp.js            │
│     └─ Spawns: codex CLI               │
│     └─ Auth: codex login               │
└─────────────────────────────────────────┘
```

No API keys. No SDK packages. CLI OAuth counts against Pro subscription quotas.
