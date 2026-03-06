#!/usr/bin/env bash
# megan-tmux.sh — Tmux-based agent dashboard for Megan/Crush
#
# Creates a tmux session "megan" with 4 panes:
#   0: Crush (main orchestrator)
#   1: Claude MCP activity log
#   2: Gemini MCP activity log
#   3: Codex MCP activity log
#
# Usage:
#   bash megan-tmux.sh          # Launch dashboard + crush
#   bash megan-tmux.sh --attach # Attach to existing session
#   bash megan-tmux.sh --logs   # Launch logs only (crush running elsewhere)
#   bash megan-tmux.sh --kill   # Kill the megan session

set -e

SESSION="megan"
LOG_DIR="$HOME/.config/crush/logs"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors for log output
CLAUDE_COLOR="\\033[38;5;141m"  # Purple
GEMINI_COLOR="\\033[38;5;39m"   # Blue
CODEX_COLOR="\\033[38;5;208m"   # Orange
RESET="\\033[0m"

# Ensure log directory exists
mkdir -p "$LOG_DIR"

# Touch log files so tail doesn't fail
touch "$LOG_DIR/claude.log" "$LOG_DIR/gemini.log" "$LOG_DIR/codex.log"

usage() {
  echo "Usage: megan-tmux.sh [--attach|--logs|--kill|--help]"
  echo ""
  echo "  (no args)   Create session with Crush + agent logs"
  echo "  --attach    Attach to existing megan session"
  echo "  --logs      Create session with logs only (no Crush)"
  echo "  --kill      Kill the megan session"
  echo "  --clear     Clear all agent logs"
  echo "  --status    Show current agent status from provider-state"
  echo "  --help      Show this help"
}

show_status() {
  local state_dir="$HOME/.config/crush/provider-state"
  echo "=== Megan Agent Status ==="
  echo ""
  for provider in claude gemini codex; do
    local state_file="$state_dir/$provider.json"
    if [ -f "$state_file" ]; then
      echo "[$provider]"
      # Extract key fields with simple tools (no jq dependency)
      node -e "
        const d = JSON.parse(require('fs').readFileSync('$state_file','utf-8'));
        console.log('  Auth:   ' + d.auth.state);
        console.log('  Model:  ' + (d.currentModel || 'none'));
        console.log('  Calls:  ' + d.session.totalCalls);
        console.log('  Errors: ' + d.session.totalErrors);
        if (d.session.totalLatencyMs > 0)
          console.log('  Avg ms: ' + Math.round(d.session.totalLatencyMs / Math.max(d.session.totalCalls,1)));
      " 2>/dev/null || echo "  (unable to parse state)"
      echo ""
    else
      echo "[$provider] No state file"
      echo ""
    fi
  done
}

clear_logs() {
  for provider in claude gemini codex; do
    > "$LOG_DIR/$provider.log"
  done
  echo "Logs cleared."
}

# Handle arguments
case "${1:-}" in
  --attach)
    tmux attach-session -t "$SESSION" 2>/dev/null || {
      echo "No megan session found. Run without arguments to create one."
      exit 1
    }
    exit 0
    ;;
  --kill)
    tmux kill-session -t "$SESSION" 2>/dev/null && echo "Session killed." || echo "No session to kill."
    exit 0
    ;;
  --logs)
    LOGS_ONLY=1
    ;;
  --clear)
    clear_logs
    exit 0
    ;;
  --status)
    show_status
    exit 0
    ;;
  --help|-h)
    usage
    exit 0
    ;;
  "")
    LOGS_ONLY=0
    ;;
  *)
    echo "Unknown option: $1"
    usage
    exit 1
    ;;
esac

# Check for tmux
if ! command -v tmux >/dev/null 2>&1; then
  echo "Error: tmux not installed. Install with: sudo apt install tmux"
  exit 1
fi

# Kill existing session if any
tmux kill-session -t "$SESSION" 2>/dev/null || true

# Create the session
# Layout: 4-pane grid
#   ┌─────────────┬─────────────┐
#   │   Crush     │  Claude Log │
#   │   (main)    │             │
#   ├─────────────┼─────────────┤
#   │ Gemini Log  │  Codex Log  │
#   │             │             │
#   └─────────────┴─────────────┘

if [ "$LOGS_ONLY" = "1" ]; then
  # Logs-only mode: all 4 panes are log viewers
  tmux new-session -d -s "$SESSION" -n "dashboard" \
    "echo -e '${CLAUDE_COLOR}━━━ CLAUDE AGENT LOG ━━━${RESET}'; tail -f '$LOG_DIR/claude.log'"
else
  # Full mode: pane 0 is Crush, panes 1-3 are logs
  tmux new-session -d -s "$SESSION" -n "dashboard" \
    "echo '━━━ MEGAN/CRUSH ORCHESTRATOR ━━━'; echo 'Starting crush...'; crush"
fi

# Split right for Claude log
if [ "$LOGS_ONLY" = "1" ]; then
  tmux split-window -h -t "$SESSION:0" \
    "echo -e '${GEMINI_COLOR}━━━ GEMINI AGENT LOG ━━━${RESET}'; tail -f '$LOG_DIR/gemini.log'"
else
  tmux split-window -h -t "$SESSION:0" \
    "echo -e '${CLAUDE_COLOR}━━━ CLAUDE AGENT LOG ━━━${RESET}'; tail -f '$LOG_DIR/claude.log'"
fi

# Split bottom-left for Gemini log
if [ "$LOGS_ONLY" = "1" ]; then
  tmux split-window -v -t "$SESSION:0.0" \
    "echo -e '${CODEX_COLOR}━━━ CODEX AGENT LOG ━━━${RESET}'; tail -f '$LOG_DIR/codex.log'"
else
  tmux split-window -v -t "$SESSION:0.0" \
    "echo -e '${GEMINI_COLOR}━━━ GEMINI AGENT LOG ━━━${RESET}'; tail -f '$LOG_DIR/gemini.log'"
fi

# Split bottom-right for Codex log
if [ "$LOGS_ONLY" = "1" ]; then
  tmux split-window -v -t "$SESSION:0.1" \
    "echo '━━━ AGGREGATE STATUS ━━━'; watch -n 5 'bash $0 --status'"
else
  tmux split-window -v -t "$SESSION:0.1" \
    "echo -e '${CODEX_COLOR}━━━ CODEX AGENT LOG ━━━${RESET}'; tail -f '$LOG_DIR/codex.log'"
fi

# Select the main pane (Crush / top-left)
tmux select-pane -t "$SESSION:0.0"

# Set pane borders to show titles (tmux 3.2+)
tmux set-option -t "$SESSION" pane-border-status top 2>/dev/null || true
tmux set-option -t "$SESSION" pane-border-format " #{pane_index}: #{pane_title} " 2>/dev/null || true

# Name the panes
if [ "$LOGS_ONLY" = "0" ]; then
  tmux select-pane -t "$SESSION:0.0" -T "Crush"
  tmux select-pane -t "$SESSION:0.1" -T "Claude"
  tmux select-pane -t "$SESSION:0.2" -T "Gemini"
  tmux select-pane -t "$SESSION:0.3" -T "Codex"
else
  tmux select-pane -t "$SESSION:0.0" -T "Claude"
  tmux select-pane -t "$SESSION:0.1" -T "Gemini"
  tmux select-pane -t "$SESSION:0.2" -T "Codex"
  tmux select-pane -t "$SESSION:0.3" -T "Status"
fi

# Go back to main pane
tmux select-pane -t "$SESSION:0.0"

echo "Megan dashboard created. Attaching..."
tmux attach-session -t "$SESSION"
