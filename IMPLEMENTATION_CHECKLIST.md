# Implementation Checklist

## Architecture: CLI-Only (v4.0.0)

All three MCP wrappers spawn native CLI binaries. No SDKs, no API keys.

---

## Core Implementation (3/3)

- [x] **Claude MCP Wrapper** (`layout/mcp-servers/claude-code-mcp.js`)
  - Spawns `claude --print --model <model> --max-tokens <n>`
  - Init check: `which claude`
  - Auth: `claude auth login` (OAuth session, user runs once)

- [x] **Gemini MCP Wrapper** (`layout/mcp-servers/gemini-mcp.js`)
  - Spawns `gemini --model <model>`
  - Init check: `which gemini`
  - Auth: `gcloud auth application-default login` (Google ADC)

- [x] **Codex MCP Wrapper** (`layout/mcp-servers/codex-mcp.js`)
  - Spawns `codex run`
  - Init check: `which codex`
  - Auth: `codex login` (OAuth session, user runs once)

## Setup & Installation (2/2)

- [x] **Updated setup.sh** (`layout/setup.sh`)
  - Copies MCP wrappers to `~/.config/crush/mcp-servers/`
  - Checks CLI binaries exist (`which claude`, `which gemini`, `which codex`)
  - Verifies CLI authentication status
  - No SDK installation, no API key checks

- [x] **Updated AGENTS.md** (`layout/AGENTS.md`)
  - CLI authentication table
  - OAuth setup commands
  - Troubleshooting guide

## Documentation (3/3)

- [x] **OAUTH_QUICKSTART.md** -- Quick start guide
- [x] **OAUTH_IMPLEMENTATION.md** -- Technical implementation details
- [x] **IMPLEMENTATION_SUMMARY.md** -- What was delivered

---

## Ready to Use

### Prerequisites

- [ ] **Node.js 18+** installed
  ```bash
  node --version
  ```

- [ ] **Crush CLI** installed
  ```bash
  crush --version
  ```

- [ ] **Provider CLIs** installed
  ```bash
  which claude
  which gemini
  which codex
  ```

### Authentication Setup (One-Time)

- [ ] **Claude** authenticated
  ```bash
  claude auth login
  ```

- [ ] **Gemini/Google Cloud** authenticated
  ```bash
  gcloud auth application-default login
  ```

- [ ] **Codex** authenticated
  ```bash
  codex login
  ```

### Installation

- [ ] **Run setup script**
  ```bash
  bash layout/setup.sh
  ```

- [ ] **Verify MCP wrappers copied**
  ```bash
  ls -la ~/.config/crush/mcp-servers/*.js
  ```

### Testing

- [ ] **Test Claude MCP server**
  ```bash
  echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{}}}' | \
    node ~/.config/crush/mcp-servers/claude-code-mcp.js
  ```

- [ ] **Test Gemini MCP server**
  ```bash
  echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{}}}' | \
    node ~/.config/crush/mcp-servers/gemini-mcp.js
  ```

- [ ] **Test Codex MCP server**
  ```bash
  echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{}}}' | \
    node ~/.config/crush/mcp-servers/codex-mcp.js
  ```

- [ ] **Start Megan**
  ```bash
  crush
  ```

---

## Security Verification

- [x] **No API keys in code**
  ```bash
  grep -r "ANTHROPIC_API_KEY\|GEMINI_API_KEY\|OPENAI_API_KEY" layout/mcp-servers/*.js
  # Should return: (no matches)
  ```

- [x] **No SDK dependencies**
  ```bash
  cat layout/mcp-servers/package.json
  # dependencies should be empty: {}
  ```

- [x] **CLIs handle auth internally**
  - Claude: OAuth session managed by `claude` binary
  - Gemini: ADC managed by `gcloud`
  - Codex: OAuth session managed by `codex` binary

---

## Troubleshooting

If something doesn't work:

- [ ] Run `bash layout/setup.sh` again (check output)
- [ ] Verify CLIs installed:
  ```bash
  which claude
  which gemini
  which codex
  ```
- [ ] Re-authenticate CLIs:
  ```bash
  claude auth login
  gcloud auth application-default login
  codex login
  ```
- [ ] Check MCP wrappers are copied:
  ```bash
  ls -la ~/.config/crush/mcp-servers/*.js
  ```
- [ ] Test individual MCP servers (see Testing section above)
- [ ] Check Crush logs:
  ```bash
  crush logs --follow
  ```

---

## Documentation Map

| Document | Purpose | Audience |
|----------|---------|----------|
| **OAUTH_QUICKSTART.md** | Quick setup | First-time users |
| **OAUTH_IMPLEMENTATION.md** | Technical details | Developers |
| **IMPLEMENTATION_SUMMARY.md** | What was delivered | Stakeholders |
| **layout/AGENTS.md** | Crush integration | Megan operators |
| **SDK_INTEGRATION.md** | CLI integration guide | Budget tracking |
| **MEGAN_CONSTITUTION.md** | Model hierarchy, no-API-keys rule | Decision making |

---

**Status:** COMPLETE (v4.0.0)
**Architecture:** CLI-only (no SDKs, no API keys)
Run `bash layout/setup.sh` then `crush` to start.
