# Megan OAuth Setup & Getting Started

Welcome! This document covers everything you need to get Megan running with OAuth authentication.

## Quick Start (TL;DR)

```bash
# 1. Install CLIs (if needed) — see CLI_SETUP.md for details
npm install -g @anthropic-ai/cli
curl https://sdk.cloud.google.com | bash

# 2. Authenticate CLIs (one-time, opens browser)
claude auth login
gcloud auth application-default login
codex login

# 3. Install & verify
bash layout/setup.sh

# 4. Start Megan
crush
```

**Total time:** ~5-10 minutes

---

## What's Changed? Why OAuth?

### Before
❌ Required users to provide raw API keys in environment variables  
❌ Keys exposed in shell history  
❌ Manual key management and rotation  

### Now
✅ Uses OAuth from authenticated CLIs  
✅ No raw API keys in environment or code  
✅ CLI manages credentials securely  
✅ Auto-discovered from standard locations  

---

## Documentation Map

Pick your path:

### 🚀 Just Getting Started?
1. **[CLI_SETUP.md](CLI_SETUP.md)** – Install and authenticate CLIs
2. **[OAUTH_QUICKSTART.md](OAUTH_QUICKSTART.md)** – 30-second setup
3. Run `bash layout/setup.sh` to verify everything works

### 🔧 Want Technical Details?
- **[OAUTH_IMPLEMENTATION.md](OAUTH_IMPLEMENTATION.md)** – Full architecture, all three providers
- **[IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)** – What was delivered, design rationale
- **[SDK_INTEGRATION.md](SDK_INTEGRATION.md)** – Token tracking, caching strategies

### ✅ Ready to Verify?
- **[IMPLEMENTATION_CHECKLIST.md](IMPLEMENTATION_CHECKLIST.md)** – Step-by-step testing guide

---

## Three-Step Setup

### Step 1: Install CLIs

Only need to do this once:

```bash
# Claude CLI
npm install -g @anthropic-ai/cli

# Google Cloud CLI
curl https://sdk.cloud.google.com | bash
exec -l $SHELL

# OpenAI/Codex CLI
codex login
```

**No CLIs yet?** See [CLI_SETUP.md](CLI_SETUP.md) for detailed instructions per platform.

### Step 2: Authenticate CLIs

Each CLI will open your browser for authentication:

```bash
# Claude
claude auth login
# Caches OAuth session internally

# Google Cloud
gcloud auth application-default login
# Creates: ~/.config/gcloud/application_default_credentials.json

# Codex
codex login
# Authenticates via OAuth
```

### Step 3: Install Megan

```bash
bash layout/setup.sh
```

Expected output:
```
✓ Claude: CLI found at /usr/local/bin/claude
✓ Gemini: CLI found at /usr/local/bin/gemini
✓ Codex: CLI found at /usr/local/bin/codex
✅ Setup complete!
```

---

## Start Using Megan

```bash
crush
```

Megan will:
1. Load your Crush configuration
2. Verify all three agents (Claude, Gemini, OpenAI) are available
3. Begin orchestrating tasks across the agents

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│ User: You (via Crush CLI)                           │
└────────────┬────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────┐
│ Megan Orchestrator (with model hierarchy)           │
│ • Delegates tasks to specialized agents             │
│ • Tracks tokens and budgets                         │
│ • Optimizes cost with Tier 0-4 model selection      │
└──┬──────────────────────────────────────┬───────────┘
   │                                      │
   ▼                                      ▼
┌──────────────────┐         ┌──────────────────┐
│ MCP Wrappers     │         │ MCP Wrappers     │
│ (OAuth-based)    │         │ (OAuth-based)    │
├──────────────────┤         ├──────────────────┤
│ • claude-code    │         │ • gemini         │
│ • codex          │         │ • codex          │
└────────┬─────────┘         └────────┬─────────┘
         │                            │
         ▼                            ▼
    ┌─────────────┐             ┌─────────────┐
    │ CLI Binaries │             │ CLI Binaries │
    ├─────────────┤             ├─────────────┤
    │ claude      │             │ gemini      │
    │ codex       │             │             │
    └────┬────────┘             └────┬────────┘
         │                           │
         ▼                           ▼
    Claude (OAuth)             Gemini (OAuth)
    OpenAI (OAuth)             
    
    ↓ (Auth from CLIs)
    
    claude auth login
    gcloud auth application-default login
    codex login
```

---

## Authentication Sources

| Provider | Auth Method | Setup Command |
|----------|---|---|
| **Claude** | CLI OAuth session | `claude auth login` |
| **Gemini** | Google Application Default Credentials | `gcloud auth application-default login` |
| **Codex** | CLI OAuth session | `codex login` |

**Why this approach?**
- CLI OAuth counts against flat-rate Pro subscriptions
- No API keys anywhere in the project
- Each CLI manages its own credentials securely
- No secrets in shell history or environment

---

## Verify Setup Works

```bash
# Test each MCP server individually
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{}}}' | \
  node ~/.config/crush/mcp-servers/claude-code-mcp.js

# Expected response should include "auth": "oauth-session"
```

Or run the full checklist:

```bash
bash layout/setup.sh  # Verifies all three CLIs are authenticated
```

---

## Troubleshooting

### "gcloud command not found"
```bash
curl https://sdk.cloud.google.com | bash
exec -l $SHELL
```

### "claude command not found"
```bash
npm install -g @anthropic-ai/cli
```

### "Claude client not initialized"
Run setup again and check output. If Claude shows "⚠ Not authenticated":
```bash
claude auth login
```

### "Gemini authentication failed"
Same as gcloud not found above. Install and authenticate gcloud.

### "OpenAI authentication failed"
```bash
codex login
```

### "CLIs not found" error
Re-run setup to check dependencies:
```bash
bash layout/setup.sh
```

For more help, see **[OAUTH_IMPLEMENTATION.md](OAUTH_IMPLEMENTATION.md#troubleshooting)**.

---

## Key Features

✅ **Token Tracking** – Every response shows `[Tokens: X→Y]` for budget tracking  
✅ **Cache Metrics** – Gemini shows 90% cache savings, OpenAI shows 75% cache savings  
✅ **Model Hierarchy** – Tier 0-4 selection based on capability & cost  
✅ **No API Key Management** – Credentials auto-discovered from CLIs  
✅ **Secure by Default** – No secrets in shell history or code  

---

## Next Steps

### Immediate
1. ✅ Install CLIs (see [CLI_SETUP.md](CLI_SETUP.md))
2. ✅ Authenticate CLIs (run commands above)
3. ✅ Run `bash layout/setup.sh` to verify

### Short-term
1. Run `crush` and test delegating tasks
2. Observe token tracking in responses
3. Check cache hit performance

### Long-term
1. Set up token usage monitoring
2. Optimize model selection based on cost
3. Extend with custom CLI tools

---

## Project Files

### Documentation (Start Here)
- **CLI_SETUP.md** – Install CLIs for your platform
- **OAUTH_QUICKSTART.md** – 30-second setup
- **OAUTH_IMPLEMENTATION.md** – Full technical details
- **IMPLEMENTATION_SUMMARY.md** – Architecture & design
- **IMPLEMENTATION_CHECKLIST.md** – Verify setup complete

### Implementation
- **layout/mcp-servers/claude-code-mcp.js** – Claude OAuth wrapper
- **layout/mcp-servers/gemini-mcp.js** – Gemini OAuth wrapper
- **layout/mcp-servers/codex-mcp.js** – OpenAI OAuth wrapper
- **layout/setup.sh** – Installation script
- **layout/AGENTS.md** – Crush integration guide

### Supporting Docs
- **SDK_INTEGRATION.md** – Token tracking, caching
- **MEGAN_CONSTITUTION.md** – Model hierarchy
- **MODEL_GUIDE.md** – Capability/cost comparison
- **WORKFLOWS.md** – Decision trees
- **SUBSCRIPTIONS.md** – Pricing limits

---

## Questions?

1. **How do I set up?** → [CLI_SETUP.md](CLI_SETUP.md)
2. **What's the quick version?** → [OAUTH_QUICKSTART.md](OAUTH_QUICKSTART.md)
3. **How does it work?** → [OAUTH_IMPLEMENTATION.md](OAUTH_IMPLEMENTATION.md)
4. **Is my setup correct?** → [IMPLEMENTATION_CHECKLIST.md](IMPLEMENTATION_CHECKLIST.md)
5. **I have an error** → [OAUTH_IMPLEMENTATION.md#troubleshooting](OAUTH_IMPLEMENTATION.md#troubleshooting)

---

## Status

✅ **Implementation Complete**
- All three MCP wrappers use OAuth/session auth
- No API key management needed
- Ready to use in 5-10 minutes

🚀 **Next:** Install CLIs and run `bash layout/setup.sh`

---

**Version:** 2.0.0 (OAuth Implementation)  
**Updated:** 2026-03-04  
**Status:** Ready for production use
