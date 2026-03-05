#!/usr/bin/env bash
# crush-wrapper.sh — Drop-in replacement for `crush` that auto-repairs
# corrupted sessions and starts the session daemon before launching.
#
# Install:
#   1. Add to your shell rc (~/.bashrc or ~/.zshrc):
#      alias crush='bash /home/swmg/Megan/crush-wrapper.sh'
#   2. Or symlink it:
#      ln -sf /home/swmg/Megan/crush-wrapper.sh ~/.local/bin/crush-safe

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPAIR_SCRIPT="$SCRIPT_DIR/crush-repair.py"
DAEMON_SCRIPT="$SCRIPT_DIR/session-daemon/daemon.js"
SESSION_DIR="$HOME/.config/crush/sessions"
PID_FILE="$SESSION_DIR/daemon.pid"
CRUSH_BIN="/usr/local/bin/crush"

if [[ -f "$REPAIR_SCRIPT" ]]; then
    python3 "$REPAIR_SCRIPT" 2>/dev/null
fi

if [[ -f "$DAEMON_SCRIPT" ]]; then
    daemon_running=false
    if [[ -f "$PID_FILE" ]]; then
        daemon_pid=$(cat "$PID_FILE" 2>/dev/null)
        if kill -0 "$daemon_pid" 2>/dev/null; then
            daemon_running=true
        fi
    fi
    if [[ "$daemon_running" == "false" ]]; then
        node "$DAEMON_SCRIPT" &>/dev/null &
        disown
        sleep 0.3
    fi
fi

exec "$CRUSH_BIN" "$@"
