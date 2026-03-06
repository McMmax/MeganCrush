# Megan OAuth Setup Quick Start

## 30-Second Setup

```bash
# 1. Install CLIs (if not already installed)
#    See CLI_SETUP.md for detailed instructions

# 2. Authenticate CLIs (one-time - opens browser)
claude auth login
gcloud auth application-default login
codex login

# 3. Install MCP wrappers
bash layout/setup.sh

# 4. Start Megan
crush
```

**Don't have the CLIs?** See [CLI_SETUP.md](CLI_SETUP.md) for installation instructions.

## What Changed?

✅ **Before:** Used raw API keys in environment variables
❌ **Problem:** Users had no API keys; keys are a security risk

✅ **Now:** Reads OAuth tokens from authenticated CLIs
✅ **Benefit:** No API key management; more secure

## Auth Methods

| Provider | Auth Method | Auth Command |
|----------|---|---|
| **Claude** | CLI OAuth session | `claude auth login` |
| **Gemini** | Google ADC | `gcloud auth application-default login` |
| **Codex** | CLI OAuth session | `codex login` |

## Verify It Works

```bash
# Check auth status
bash layout/setup.sh

# Test Claude MCP server
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{}}}' | \
  node ~/.config/crush/mcp-servers/claude-code-mcp.js
```

Expected: `"auth": "oauth-session"` in response

## Troubleshooting

| Error | Fix |
|-------|-----|
| `Claude client not initialized` | Run `claude auth login` |
| `Gemini authentication failed` | Run `gcloud auth application-default login` |
| `OpenAI authentication failed` | Run `codex login` |
| `CLIs not found` | Run `bash layout/setup.sh` again |

## Files Modified

- ✅ `layout/mcp-servers/claude-code-mcp.js` – OAuth session auth
- ✅ `layout/mcp-servers/gemini-mcp.js` – ADC auto-discovery
- ✅ `layout/mcp-servers/codex-mcp.js` – Session + env fallback
- ✅ `layout/setup.sh` – Verify CLI auth instead of env vars
- ✅ `layout/AGENTS.md` – OAuth setup documentation

## What Happens Now

1. You authenticate CLIs once (they remember you)
2. MCP wrappers spawn the CLI binaries
3. CLIs use their stored OAuth credentials
4. No API keys in your shell history or code
5. Usage counts against your Pro subscriptions (not metered API billing)

## For More Details

See `OAUTH_IMPLEMENTATION.md` for full technical documentation.

---

**Status:** ✅ Ready to use. Run `bash layout/setup.sh` then `crush`.
