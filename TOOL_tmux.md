# tmux – Terminal Multiplexer & Megan Agent Dashboard

[tmux](https://github.com/tmux/tmux) lets you create, access, and control multiple terminal sessions from a single screen. In Megan's stack, tmux powers the **agent dashboard** — a 4-pane real-time view of Crush and all MCP sub-agent activity.

## Installation

**macOS (Homebrew)**
```bash
brew install tmux
```

**Linux**

Debian/Ubuntu:
```bash
sudo apt install tmux
```

Fedora:
```bash
sudo dnf install tmux
```

Arch:
```bash
sudo pacman -S tmux
```

Alpine:
```bash
sudo apk add tmux
```

**FreeBSD**
```bash
pkg install tmux
```

**Windows (via WSL)**

Install WSL, then install tmux inside your Linux distribution.

## Megan Agent Dashboard

The `megan-tmux.sh` script creates a tmux session called `megan` with a 4-pane grid layout showing real-time MCP server activity:

```
┌──────────────────┬──────────────────┐
│   Crush          │  Claude Log      │
│   (orchestrator) │  (purple)        │
├──────────────────┼──────────────────┤
│  Gemini Log      │  Codex Log       │
│  (blue)          │  (orange)        │
└──────────────────┴──────────────────┘
```

### Quick Start

```bash
bash megan-tmux.sh            # Launch Crush + agent log panes
bash megan-tmux.sh --logs     # Logs only (Crush running elsewhere)
bash megan-tmux.sh --attach   # Reattach to existing session
bash megan-tmux.sh --kill     # Kill the session
bash megan-tmux.sh --clear    # Truncate all log files
bash megan-tmux.sh --status   # Print agent auth/usage summary
```

### Modes

| Mode | Pane 0 | Pane 1 | Pane 2 | Pane 3 |
|------|--------|--------|--------|--------|
| Default | Crush | Claude log | Gemini log | Codex log |
| `--logs` | Claude log | Gemini log | Codex log | Aggregate status (`watch`) |

### `--status` Output

Shows per-provider state parsed from `~/.config/crush/provider-state/*.json`:

```
=== Megan Agent Status ===

[claude]
  Auth:   OK
  Model:  claude-sonnet-4-20250514
  Calls:  12
  Errors: 0
  Avg ms: 3421

[gemini]
  Auth:   OK
  Model:  gemini-2.5-pro
  Calls:  47
  Errors: 1
  Avg ms: 2104
```

## How the Dashboard Works

### Log Flow

Each MCP wrapper (`claude-code-mcp.js`, `gemini-mcp.js`, `codex-mcp.js`) uses the `dashboard-log.js` module to write activity logs:

```
MCP Wrapper (claude-code-mcp.js, etc.)
  │
  ├─ dashboard-log.js → ~/.config/crush/logs/<provider>.log  (for tmux tail -f)
  └─ dashboard-log.js → stderr                               (for console)
```

The tmux dashboard panes run `tail -f` on these log files, providing real-time visibility into:

- **MCP method calls** — Every JSON-RPC message Crush sends (`initialize`, `tools/call`, etc.)
- **CLI invocations** — Model used, prompt preview (first 120 chars), latency
- **Auth events** — CLI init status, missing binary warnings
- **Errors** — Failed calls with error messages

### Log Format

Each log line is timestamped and level-tagged:

```
[2026-03-04 14:32:01.123] [CALL ] [claude] Refactor the auth module... model=claude-sonnet-4-20250514 latency=3.2s
[2026-03-04 14:32:01.456] [INFO ] [gemini] MCP ← tools/call
[2026-03-04 14:32:02.789] [AUTH ] [codex] INIT OK: /usr/local/bin/codex
[2026-03-04 14:33:15.012] [ERROR] [gemini] CALL FAILED model=gemini-2.5-pro latency=12.1s error=Exit code 1
```

### Log Files

| File | Contents |
|------|----------|
| `~/.config/crush/logs/claude.log` | Claude MCP wrapper activity |
| `~/.config/crush/logs/gemini.log` | Gemini MCP wrapper activity |
| `~/.config/crush/logs/codex.log` | Codex MCP wrapper activity |

### Provider State (JSON)

Separate from human-readable logs, each provider also writes structured JSON state to `~/.config/crush/provider-state/<name>.json`. The `--status` flag reads these files. The dashboard logs and provider state are complementary — logs for visual monitoring, JSON for programmatic access.

## tmux Navigation

While in the dashboard session:

| Key | Action |
|-----|--------|
| `Ctrl+b d` | Detach (session keeps running) |
| `Ctrl+b arrow` | Navigate between panes |
| `Ctrl+b z` | Zoom current pane (toggle fullscreen) |
| `Ctrl+b [` | Enter scroll mode (q to exit) |
| `Ctrl+b :resize-pane -D 5` | Resize pane down 5 lines |

## Claude CLI Native tmux Support

The Claude CLI also has a native `--tmux` flag that starts a tmux session for its own operations. This is separate from the Megan dashboard but can coexist. The Megan dashboard focuses on orchestration visibility across all three providers, while Claude's `--tmux` is for Claude-only interactive sessions.

## Basic tmux Usage

```bash
tmux new -s mysession          # Start a new named session
tmux ls                        # List sessions
tmux attach -t mysession       # Attach to a session
tmux kill-session -t mysession # Kill a session
```

**Splitting panes:**
- `Ctrl+b "` — Split horizontally
- `Ctrl+b %` — Split vertically
