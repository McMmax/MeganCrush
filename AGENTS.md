# Megan Project Agent Guide

## CRITICAL RULE: NO API KEYS
- **Megan NEVER uses API keys and never will.** Do not ever attempt to use, reference, or modify API keys.
- All authentication goes through native CLI OAuth: `claude auth login`, `gcloud auth application-default login`, `codex login`.
- CLI OAuth usage counts against flat-rate Pro subscription quotas (Claude Pro $20/mo, Google AI Pro $20/mo, ChatGPT Pro $200/mo) — NOT metered per-token billing.
- API key env vars (`ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`) must not exist in the project.
- No SDK packages (`@anthropic-ai/sdk`, `@google/genai`, `openai`) — MCP wrappers spawn CLI binaries directly.
- See `MEGAN_CONSTITUTION.md` Section 6 for the full constitutional rule.

## CRITICAL RULE: bat OVER cat
- **Always use `bat` instead of `cat` when viewing file contents via bash.** `bat` is Megan's designated file viewer — it provides syntax highlighting, line numbers, and consistent output across all agents.
- `cat` must never be used for file display. If you need to read file contents in a bash command, use `bat` (or `bat --plain` for undecorated output, `bat -l <lang>` for explicit language).
- This applies to Crush and all sub-agents (Claude, Gemini, Codex).
- For piping raw content (e.g., into `grep` or `jq`), `bat --plain --paging=never` is the equivalent of `cat`.

## Project Snapshot
- Megan orchestrates Claude Code, Gemini CLI, and Codex CLI inside **Crush** to balance capability, cost, and subscription limits while executing developer workflows (see `README.md`).
- All operational rules live alongside this guide: `MEGAN_CONSTITUTION.md`, `SUBSCRIPTIONS.md`, `MODEL_GUIDE.md`, and `WORKFLOWS.md` describe persona, model tiers, budgets, and decision trees.

## Essential Commands & Setup
| Purpose | Command | Notes |
|---------|---------|-------|
| Install MCP wrappers & global config | `bash setup.sh` | Copies the MCP scripts into `~/.config/crush/mcp-servers/`, installs `crush.json` with the provider/tool metadata, and checks for `crush`, `node`, `claude`, `gemini`, and `codex` binaries. See `setup.sh`. |
| Run Megan | `crush` | Crush will read `AGENTS.md` (per `crush.json` → `options.initialize_as`) and orchestrate the sub-agents. |
| View Crush logs | `crush logs --follow` | Helpful if MCP servers fail to connect. |
| Validate an MCP server | `echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{}}}' | node ~/.config/crush/mcp-servers/claude-code-mcp.js` | Same pattern works for `gemini-mcp.js` and `codex-mcp.js`. |

## Environment & Tooling
- Required CLIs: `crush`, `node`, `claude` (Claude Code), `gemini`, and `codex` (installed globally via npm per `setup.sh`).
- **No API keys required.** All authentication goes through native CLI OAuth logins (`claude auth login`, `gcloud auth application-default login`, `codex login`). This ensures usage counts against flat-rate Pro subscriptions rather than metered API billing.
- The MCP wrapper scripts live in `layout/mcp-servers/` and the copies landing in the Crush config directory simply spawn each CLI, so troubleshoot by inspecting those files if delegation misbehaves.

## Codebase Layout
- Root Markdown docs (`README.md`, `AGENTS.md`, `MEGAN_CONSTITUTION.md`, `MODEL_GUIDE.md`, `SUBSCRIPTIONS.md`, `WORKFLOWS.md`) encode Megan's persona, budgeting, and workflows.
- `TOOL_*.md` files document Megan's CLI toolkit with installation and usage instructions.
- `layout/crush.json` stores the MCP/tool/provider definitions and `options.initialize_as` pointing at `AGENTS.md`; keep the same structure if you ever regenerate the file.
- `layout/setup.sh` and the `mcp-servers/*.js` scripts define the install flow; treat them as the reference for how Crush expects to find each sub-agent.
- `layout/agent-prompts/*.md` — Per-CLI sub-agent system prompts injected into each MCP wrapper (see below).
- `layout/mcp-servers/dashboard-log.js` — Shared logging module for the tmux agent dashboard.
- `session-daemon/` — Multi-instance session coordination system (daemon, client, MCP server, CLI).
- `megan-tmux.sh` — Tmux-based agent dashboard script (see below).

## CRITICAL RULE: Toolkit First
- **Megan's CLI toolkit tools are the preferred choice for any corresponding action.** They are optimized, more efficient, and purpose-built for terminal workflows.
- Before using a generic command or manual approach, check if a toolkit tool covers the action (e.g., use `gh` for GitHub operations instead of browser or raw API calls, use `lazygit` for interactive git instead of manual `git add -p` / `git rebase -i`, use `rg` instead of `grep`, use `bat` instead of `cat`).
- This rule applies to Crush and all sub-agents (Claude, Gemini, Codex).

## Megan's CLI Toolkit
Megan has access to the following CLI tools, all free and open-source. Install with your package manager:

| Tool | Purpose | Reference |
|------|---------|-----------|
| **gh** | GitHub CLI — PRs, issues, Actions, releases, API | `TOOL_gh.md` |
| **lazygit** | Terminal UI for git — staging, rebasing, conflicts | `TOOL_lazygit.md` |
| **fzf** | Interactive fuzzy finder for files, branches, history | `TOOL_fzf.md` |
| **ripgrep (rg)** | Fast recursive code search respecting .gitignore | `TOOL_ripgrep.md` |
| **zoxide** | Smarter `cd` that remembers your directories | `TOOL_zoxide.md` |
| **tmux** | Terminal multiplexer for persistent sessions | `TOOL_tmux.md` |
| **bat** | **MANDATORY** `cat` replacement — never use `cat`, always `bat` | `TOOL_bat.md` |
| **shellcheck** | Static analysis for shell scripts | `TOOL_shellcheck.md` |
| **wtp** | Git worktree manager with hooks | `TOOL_wtp.md` |
| **delta** | Syntax-highlighting pager for diffs | `TOOL_delta.md` |
| **tldr** | Cheat sheets for command-line tools | `TOOL_tldr.md` |

Megan can invoke any of these tools to assist with your workflows. See individual `TOOL_*.md` files for installation and integration details.

## LSP Servers
Crush uses LSP servers for semantic code intelligence (diagnostics, go-to-definition, find-references, type info, completions). These are configured in the `lsp` section of `layout/crush.json`.

| Server | Language | Binary | Notes |
|--------|----------|--------|-------|
| **jdtls** | Java | `~/.local/bin/jdtls` | Eclipse JDT.LS, runs on JDK 25 (`~/.local/lib/jvm/jdk-25.0.2`) |
| **kotlin-language-server** | Kotlin | `~/.local/bin/kotlin-language-server` | Wrapper forces JDK 21 (KLS 1.3.13 can't parse JDK 25 version) |
| **pyright** | Python | `~/.local/bin/pyright-langserver` | `--stdio` mode |
| **rust-analyzer** | Rust | `rust-analyzer` (rustup) | Via `rustup component add rust-analyzer` |
| **clangd** | C/C++ | `~/.local/bin/clangd` | Standalone binary from GitHub releases |
| **typescript-language-server** | TS/JS | `~/.local/bin/typescript-language-server` | `--stdio` mode |
| **vscode-html-language-server** | HTML | `~/.local/bin/vscode-html-language-server` | From `vscode-langservers-extracted` |
| **vscode-css-language-server** | CSS/SCSS/LESS | `~/.local/bin/vscode-css-language-server` | From `vscode-langservers-extracted` |
| **vscode-json-language-server** | JSON | `~/.local/bin/vscode-json-language-server` | From `vscode-langservers-extracted` |

### JDK Setup
- **JDK 25** at `~/.local/lib/jvm/jdk-25.0.2` — used by jdtls and as the default `java`/`javac` in PATH
- **JDK 21** at `~/.local/lib/jvm/jdk-21.0.10+7` — used only by kotlin-language-server (via wrapper script)
- The KLS wrapper at `~/.local/bin/kotlin-language-server` sets `JAVA_HOME` and `PATH` to JDK 21 before invoking the real KLS binary

### npm-based LSPs
Installed to `~/.local` prefix: `npm i -g --prefix ~/.local pyright typescript-language-server typescript vscode-langservers-extracted`

## Megan's Persona & Delegation Flow
- Megan always obeys the model hierarchy detailed in `MEGAN_CONSTITUTION.md`: Tier 0 (free Copilot models) → Tier 1 (cheap GitHub Copilot paid models) → Tier 2 (Gemini) → Tier 3 (Codex) → Tier 4 (Claude). Use the cheapest tier that satisfies the task.
- Before any Claude call, estimate token cost, check the remaining five-hour window, and ask the user for permission via the scripted prompt (Tier 4 requests only with approval).
- Never use `claude-4.5-haiku`—the constitution and subscription docs forbid it because it wastes Claude quota.
- You may call multiple MCP tools in parallel (Gemini, Codex, Claude) and synthesize their outputs before reporting back, but always summarize rather than posting raw transcripts.

## Model & Subscription Guidance
- `SUBSCRIPTIONS.md` lists the budgeted providers: GitHub Copilot Student (Tier 0+1), ChatGPT Codex (Tier 3, cache-friendly weekly cap), Google AI Pro (Gemini, 1M token context, daily quota), and Claude Pro (Tier 4, ~44K tokens/5h). Follow those limits when deciding which model to reach for.
- `MODEL_GUIDE.md` describes capability/cost tradeoffs for every allowed model; consult it whenever you need to pick between, say, `gemini-2.5-pro` vs. `gemini-2.5-flash` or which Codex variant to escalate to.
- `WORKFLOWS.md` provides example decision trees for common requests (refactors, architecture analyses, prototypes, multimodal tasks, brainstorming, quick fixes); shadow those flows when encountering similar prompts.

## Testing & Verification
- This repository does not ship automated tests; focus on verifying CLI behavior manually (e.g., run `bash setup.sh` in a clean shell, call `crush` to bootstrap, use the MCP wrapper test commands above). Document any manual validation you perform.

## Session Repair (crush-repair)
- **Problem**: When Crush freezes mid-tool-call (e.g. IDE closes), the saved session ends with an orphaned `tool_use` block. Resuming triggers `Bad Request: tool_use ids were found without tool_result blocks`.
- **Fix**: `crush-repair.py` scans all `crush.db` files, finds orphaned `tool_call` messages, and injects synthetic `tool_result` responses so sessions can resume.
- **Auto-repair**: A shell alias in `~/.bashrc` wraps `crush` via `crush-wrapper.sh`, which runs the repair script silently before every launch. No manual intervention needed.
- **Manual use**: `python3 crush-repair.py --dry-run` to preview, `python3 crush-repair.py` to fix.

## Gotchas & Operational Reminders
- `crush.json` must include `"options": { "initialize_as": "AGENTS.md" }` so Crush loads Megan's instructions on start. Mirror the structure in `layout/crush.json` if you regenerate the file.
- The MCP wrapper scripts blindly spawn the installed CLIs, so missing binaries manifest as immediate `Failed to spawn` errors—double-check PATH before blaming Crush.
- When you copy `setup.sh` or the MCP scripts elsewhere, preserve the `--print` flag used to keep output machine-friendly.
- Always greet the user with a budget snapshot (Claude window tokens, Gemini daily counts, Copilot unlimited, Codex weekly cap) when a new session begins, per the constitution.

## CLI Integration & Authentication
- **Claude** – Spawns `claude --print --output-format text --permission-mode plan` CLI. Supports `--append-system-prompt` for sub-agent context. Auth via `claude auth login` (OAuth).
- **Gemini** – Spawns `gemini --prompt <text> --model <m> --output-format text` CLI (headless mode). Auth via `gcloud auth application-default login` (Google ADC).
- **Codex** – Spawns `codex exec` CLI (non-interactive). Auth via `codex login` (OAuth).
- **No SDKs or API keys are used.** All provider access goes through native CLI OAuth, counting against Pro subscription quotas rather than metered API billing.

## Per-CLI Sub-Agent Prompts
Each MCP wrapper injects a sub-agent system prompt that teaches the CLI its role in the Megan hierarchy. These prompts live at `layout/agent-prompts/` and are copied to `~/.config/crush/agent-prompts/` by `setup.sh`.

| File | Tier | Role | Key Directives |
|------|------|------|----------------|
| `claude-subagent.md` | Tier 4 | Strategic reserve | ~44K tokens/5h budget, never verbose, no `claude-4.5-haiku`, responses under 4000 tokens |
| `gemini-subagent.md` | Tier 2 | Primary workhorse | 1M token context, 100 Pro + 300 Flash per day, headless `--prompt` mode |
| `codex-subagent.md` | Tier 3 | Engineering specialist | 75% prompt caching, `exec` mode, prefer sandboxed execution |

**Injection mechanism:**
- **Claude**: Uses native `--append-system-prompt <text>` CLI flag.
- **Gemini/Codex**: Prompt prepended as `<system>...</system>` block to the user's prompt text.
- If the prompt file is missing (e.g., not yet installed), the wrapper continues without it — graceful fallback.

## Agent Dashboard (tmux)
The `megan-tmux.sh` script creates a 4-pane tmux session for real-time MCP server monitoring:

```
┌──────────────────┬──────────────────┐
│   Crush          │  Claude Log      │
│   (orchestrator) │  (purple)        │
├──────────────────┼──────────────────┤
│  Gemini Log      │  Codex Log       │
│  (blue)          │  (orange)        │
└──────────────────┴──────────────────┘
```

**Launch commands:**
```bash
bash megan-tmux.sh            # Full dashboard (Crush + agent logs)
bash megan-tmux.sh --logs     # Logs only (Crush running elsewhere)
bash megan-tmux.sh --attach   # Reattach to existing session
bash megan-tmux.sh --kill     # Kill the session
bash megan-tmux.sh --clear    # Truncate all log files
bash megan-tmux.sh --status   # Show agent auth/usage summary
```

**Dashboard logging flow:**
Each MCP wrapper uses `dashboard-log.js` to write timestamped, human-readable entries to `~/.config/crush/logs/<provider>.log`. The tmux panes run `tail -f` on these files. Logged events: MCP method calls, CLI invocations (model, latency, prompt preview), auth state changes, and errors.

See `TOOL_tmux.md` for full dashboard documentation including navigation keys and log format.

## Multi-Session Coordination
Multiple Crush instances can run simultaneously and see each other in real time. A lightweight session daemon coordinates all instances via a Unix domain socket.

### Architecture
```
┌────────────┐   ┌────────────┐   ┌────────────┐
│  Crush #1  │   │  Crush #2  │   │  Crush #3  │
│ (project A)│   │ (project B)│   │ (project A)│
└─────┬──────┘   └─────┬──────┘   └─────┬──────┘
      │ MCP             │ MCP             │ MCP
      │ session-mcp.js  │ session-mcp.js  │ session-mcp.js
      └────────┬────────┴────────┬────────┘
               │  Unix socket    │
         ┌─────▼─────────────────▼─────┐
         │    megan-session-daemon     │
         │  (singleton background)     │
         │  ~/.config/crush/sessions/  │
         └─────────────────────────────┘
```

### Available MCP Tools
When the `sessions` MCP server is enabled in `crush.json`, each Crush instance gets these tools:

| Tool | Description |
|------|-------------|
| `sessions_list` | List all active sessions with project, status, current task, and recent activity |
| `sessions_get` | Get detailed info about a specific session by ID |
| `sessions_send_message` | Send a message to another session for coordination |
| `sessions_get_messages` | Check for incoming messages from sibling sessions |
| `sessions_update_task` | Broadcast what you're currently working on |
| `sessions_daemon_status` | Check daemon uptime and session count |

### CLI Commands
```bash
megan-sessions              # List all active Crush sessions
megan-sessions watch        # Live-watch session events (register/deregister/reap)
megan-sessions send <id> <msg>  # Send a message to a session (prefix match on ID)
megan-sessions kill <id>    # Deregister a stale session
megan-sessions status       # Show daemon PID, uptime, session count
megan-sessions daemon start # Start the daemon manually
megan-sessions daemon stop  # Stop the daemon
```

### How It Works
1. **Daemon auto-start**: `crush-wrapper.sh` starts the daemon if not running before each Crush launch.
2. **Auto-register**: The `session-mcp.js` MCP server registers with the daemon on `initialize`.
3. **Heartbeat**: Every 15s, each session sends a heartbeat with status and current task.
4. **Reaping**: Sessions with no heartbeat for 60s whose PID is dead are auto-removed.
5. **Messaging**: Sessions can send point-to-point messages queued in the daemon.
6. **Persistence**: Session state is saved to `~/.config/crush/sessions/sessions.json` for crash recovery.

### Use Cases
- Run Crush in two terminals on the same project — one for backend, one for frontend
- Check if another session already modified a file before editing it
- Coordinate task handoffs: "Auth module done, start on routes"
- Monitor all active work across projects from a single `megan-sessions watch`

### Files
| File | Purpose |
|------|---------|
| `session-daemon/daemon.js` | Singleton daemon, Unix socket server, session store |
| `session-daemon/session-client.js` | Client library (auto-starts daemon, heartbeat, messaging) |
| `session-daemon/session-mcp.js` | MCP server exposing session tools to Crush |
| `session-daemon/cli.js` | `megan-sessions` CLI for terminal inspection |

## Budget Enforcement & Token Tracking
- Megan tracks token usage from CLI responses
- Automatically enforces tier limits: stops before exceeding daily/weekly/session quotas
- Weekly token reports available via `crush logs` to review spending across all providers
