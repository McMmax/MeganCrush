#!/usr/bin/env bash
# setup.sh — Install MCP server wrappers for Megan (Python CLI-only, no SDKs)
# Run from the Megan project root: bash layout/setup.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CRUSH_CONFIG_DIR="$HOME/.config/crush"
MCP_DIR="$CRUSH_CONFIG_DIR/mcp-servers"

echo "==> Creating MCP servers directory at $MCP_DIR"
mkdir -p "$MCP_DIR"

echo "==> Copying MCP server scripts (Python CLI wrappers)"
cp "$SCRIPT_DIR/mcp-servers/claude_code_mcp.py" "$MCP_DIR/"
cp "$SCRIPT_DIR/mcp-servers/gemini_mcp.py" "$MCP_DIR/"
cp "$SCRIPT_DIR/mcp-servers/codex_mcp.py" "$MCP_DIR/"
cp "$SCRIPT_DIR/mcp-servers/provider_state.py" "$MCP_DIR/"
cp "$SCRIPT_DIR/mcp-servers/dashboard_log.py" "$MCP_DIR/"

echo "==> Copying agent prompts"
PROMPTS_DIR="$CRUSH_CONFIG_DIR/agent-prompts"
mkdir -p "$PROMPTS_DIR"
if [ -d "$SCRIPT_DIR/agent-prompts" ]; then
  cp "$SCRIPT_DIR/agent-prompts/"*.md "$PROMPTS_DIR/" 2>/dev/null || true
  echo "    Copied agent prompts to $PROMPTS_DIR"
else
  echo "    ✗ No agent-prompts directory found at $SCRIPT_DIR/agent-prompts"
fi

echo "==> Copying session daemon and MCP server"
SESSION_SRC="$SCRIPT_DIR/../session-daemon"
if [ -d "$SESSION_SRC" ]; then
  cp "$SESSION_SRC/daemon.py" "$MCP_DIR/"
  cp "$SESSION_SRC/session_client.py" "$MCP_DIR/"
  cp "$SESSION_SRC/session_mcp.py" "$MCP_DIR/"
  cp "$SESSION_SRC/cli.py" "$MCP_DIR/megan-sessions.py"
  echo "    Session daemon and MCP server installed"

  SESSION_DIR="$CRUSH_CONFIG_DIR/sessions"
  mkdir -p "$SESSION_DIR"
  echo "    Session state dir: $SESSION_DIR"

  if [ ! -f "$HOME/.local/bin/megan-sessions" ]; then
    mkdir -p "$HOME/.local/bin"
    cat > "$HOME/.local/bin/megan-sessions" << 'CLIEOF'
#!/usr/bin/env bash
exec python3 ~/.config/crush/mcp-servers/megan-sessions.py "$@"
CLIEOF
    chmod +x "$HOME/.local/bin/megan-sessions"
    echo "    CLI installed: ~/.local/bin/megan-sessions"
  fi

  if [ ! -f "$HOME/.local/bin/megan-daemon" ]; then
    cat > "$HOME/.local/bin/megan-daemon" << 'DMNEOF'
#!/usr/bin/env bash
exec python3 ~/.config/crush/mcp-servers/daemon.py "$@"
DMNEOF
    chmod +x "$HOME/.local/bin/megan-daemon"
    echo "    Daemon CLI installed: ~/.local/bin/megan-daemon"
  fi
else
  echo "    ✗ session-daemon directory not found at $SESSION_SRC"
fi

echo "==> Creating skills directory"
SKILLS_DIR="$CRUSH_CONFIG_DIR/skills"
mkdir -p "$SKILLS_DIR"
echo "    Skills directory: $SKILLS_DIR"

echo "==> Creating log directories for dashboard"
LOG_DIR="$CRUSH_CONFIG_DIR/logs"
mkdir -p "$LOG_DIR"
touch "$LOG_DIR/claude.log" "$LOG_DIR/gemini.log" "$LOG_DIR/codex.log"
echo "    Logs: $LOG_DIR/{claude,gemini,codex}.log"

echo "==> Copying crush.json (global config)"
if [ -f "$SCRIPT_DIR/crush.json" ]; then
  sed "s|~|$HOME|g" "$SCRIPT_DIR/crush.json" > "$CRUSH_CONFIG_DIR/crush.json"
else
  echo "    ✗ crush.json not found at $SCRIPT_DIR/crush.json"
  exit 1
fi

echo "==> Copying AGENTS.md to current project (optional)"
if [ ! -f "./AGENTS.md" ]; then
  cp "$SCRIPT_DIR/AGENTS.md" ./AGENTS.md
  echo "    Created ./AGENTS.md in current directory"
else
  echo "    AGENTS.md already exists, skipping"
fi

echo "==> Copying .crushignore (if present)"
PROJECT_ROOT="$SCRIPT_DIR/.."
if [ -f "$PROJECT_ROOT/.crushignore" ]; then
  cp "$PROJECT_ROOT/.crushignore" "$CRUSH_CONFIG_DIR/.crushignore"
  echo "    Copied .crushignore to $CRUSH_CONFIG_DIR"
else
  echo "    No .crushignore found, skipping"
fi

echo ""
echo "==> Verifying CLI dependencies..."

check_cli() {
  local cmd=$1
  local install_hint=$2
  if command -v "$cmd" >/dev/null; then
    echo "    ✓ $cmd found at $(which $cmd)"
  else
    echo "    ✗ $cmd NOT found — $install_hint"
  fi
}

check_cli "crush"    "brew install charmbracelet/tap/crush"
check_cli "python3"  "Install Python 3.10+ from https://www.python.org"
check_cli "claude"   "npm install -g @anthropic-ai/cli"
check_cli "gemini"   "npm install -g @google/gemini-cli"
check_cli "codex"    "npm install -g @openai/codex"

echo ""
echo "==> Setting up LSP servers..."

LSP_MISSING=0

# --- JDK 25 (primary, for jdtls and project compilation) ---
JVM_DIR="$HOME/.local/lib/jvm"
JDK25_DIR="$JVM_DIR/jdk-25.0.2"
if [ -x "$JDK25_DIR/bin/java" ]; then
  echo "    ✓ JDK 25 found at $JDK25_DIR"
  JAVA_VER=$("$JDK25_DIR/bin/java" --version 2>&1 | head -1)
  echo "      $JAVA_VER"
else
  echo "    ✗ JDK 25 not found at $JDK25_DIR"
  echo "      Download: https://download.java.net/java/GA/jdk25.0.2/b1e0dfa218384cb9959bdcb897162d4e/10/GPL/openjdk-25.0.2_linux-x64_bin.tar.gz"
  echo "      Extract to: $JVM_DIR/"
  LSP_MISSING=1
fi

# --- JDK 21 (for kotlin-language-server, which can't parse JDK 25 version strings) ---
JDK21_DIR="$JVM_DIR/jdk-21.0.10+7"
if [ -x "$JDK21_DIR/bin/java" ]; then
  echo "    ✓ JDK 21 found at $JDK21_DIR (for kotlin-language-server)"
else
  echo "    ✗ JDK 21 not found at $JDK21_DIR"
  echo "      Required by kotlin-language-server (can't parse JDK 25 version)"
  echo "      Download: https://github.com/adoptium/temurin21-binaries/releases"
  echo "      Extract to: $JVM_DIR/"
  LSP_MISSING=1
fi

# Ensure java/javac symlinks exist (pointing to JDK 25)
if [ -x "$JDK25_DIR/bin/java" ]; then
  mkdir -p "$HOME/.local/bin"
  ln -sf "$JDK25_DIR/bin/java" "$HOME/.local/bin/java"
  ln -sf "$JDK25_DIR/bin/javac" "$HOME/.local/bin/javac"
fi

# --- Eclipse JDT.LS (Java LSP) ---
JDTLS_DIR="$HOME/.local/share/jdtls"
JDTLS_BIN="$HOME/.local/bin/jdtls"
if [ -d "$JDTLS_DIR/plugins" ] && [ -x "$JDTLS_BIN" ]; then
  echo "    ✓ jdtls found at $JDTLS_BIN"
else
  echo "    ✗ jdtls not found"
  if [ ! -d "$JDTLS_DIR/plugins" ]; then
    echo "      Download: https://download.eclipse.org/jdtls/milestones/"
    echo "      Extract to: $JDTLS_DIR/"
  fi
  if [ ! -x "$JDTLS_BIN" ]; then
    echo "      Launcher wrapper missing at $JDTLS_BIN"
    echo "      Creating jdtls wrapper..."
    mkdir -p "$HOME/.local/bin"
    cat > "$JDTLS_BIN" << 'JDTLSEOF'
#!/usr/bin/env bash
JDTLS_HOME="$HOME/.local/share/jdtls"
JAVA_HOME="$HOME/.local/lib/jvm/jdk-25.0.2"
JAVA="$JAVA_HOME/bin/java"
LAUNCHER=$(ls "$JDTLS_HOME/plugins/org.eclipse.equinox.launcher_"*.jar 2>/dev/null | head -1)
if [ -z "$LAUNCHER" ]; then
  echo "ERROR: Cannot find equinox launcher jar in $JDTLS_HOME/plugins/" >&2
  exit 1
fi
CONFIG_DIR="$JDTLS_HOME/config_linux"
WORKSPACE_DIR="$HOME/.cache/jdtls/workspace-$(echo "$PWD" | md5sum | cut -d' ' -f1)"
mkdir -p "$WORKSPACE_DIR"
exec "$JAVA" \
  -Declipse.application=org.eclipse.jdt.ls.core.id1 \
  -Dosgi.bundles.defaultStartLevel=4 \
  -Declipse.product=org.eclipse.jdt.ls.core.product \
  -Dlog.level=ALL \
  -Xmx1G \
  --add-modules=ALL-SYSTEM \
  --add-opens java.base/java.util=ALL-UNNAMED \
  --add-opens java.base/java.lang=ALL-UNNAMED \
  -jar "$LAUNCHER" \
  -configuration "$CONFIG_DIR" \
  -data "$WORKSPACE_DIR" \
  "$@"
JDTLSEOF
    chmod +x "$JDTLS_BIN"
    echo "      Created jdtls wrapper"
  fi
  LSP_MISSING=1
fi

# --- kotlin-language-server ---
KLS_DIR="$HOME/.local/share/kotlin-language-server/server"
KLS_BIN="$HOME/.local/bin/kotlin-language-server"
if [ -x "$KLS_DIR/bin/kotlin-language-server" ]; then
  echo "    ✓ kotlin-language-server found"
  # Create wrapper that forces JDK 21 (KLS 1.3.13 can't parse JDK 25 version)
  if [ ! -f "$KLS_BIN" ] || ! grep -q 'jdk-21' "$KLS_BIN" 2>/dev/null; then
    cat > "$KLS_BIN" << 'KLSEOF'
#!/usr/bin/env bash
KLS_JAVA_HOME="$HOME/.local/lib/jvm/jdk-21.0.10+7"
export JAVA_HOME="$KLS_JAVA_HOME"
export PATH="$KLS_JAVA_HOME/bin:$PATH"
exec "$HOME/.local/share/kotlin-language-server/server/bin/kotlin-language-server" "$@"
KLSEOF
    chmod +x "$KLS_BIN"
    echo "      Created JDK 21 wrapper at $KLS_BIN"
  fi
else
  echo "    ✗ kotlin-language-server not found"
  echo "      Download: https://github.com/fwcd/kotlin-language-server/releases"
  echo "      Extract server.zip to: $HOME/.local/share/kotlin-language-server/"
  LSP_MISSING=1
fi

# --- npm-based LSP servers ---
check_npm_lsp() {
  local name=$1
  local bin=$2
  local npm_pkg=$3
  if [ -x "$HOME/.local/bin/$bin" ] || command -v "$bin" >/dev/null 2>&1; then
    echo "    ✓ $name found"
  else
    echo "    ✗ $name not found — npm i -g --prefix ~/.local $npm_pkg"
    LSP_MISSING=1
  fi
}

check_npm_lsp "pyright"                    "pyright-langserver"           "pyright"
check_npm_lsp "typescript-language-server"  "typescript-language-server"   "typescript-language-server typescript"
check_npm_lsp "vscode-html-language-server" "vscode-html-language-server" "vscode-langservers-extracted"
check_npm_lsp "vscode-css-language-server"  "vscode-css-language-server"  "vscode-langservers-extracted"
check_npm_lsp "vscode-json-language-server" "vscode-json-language-server" "vscode-langservers-extracted"

# --- rust-analyzer (via rustup) ---
if command -v rust-analyzer >/dev/null 2>&1 && rust-analyzer --version >/dev/null 2>&1; then
  echo "    ✓ rust-analyzer found ($(rust-analyzer --version 2>&1 | head -1))"
else
  echo "    ✗ rust-analyzer not found — rustup component add rust-analyzer"
  LSP_MISSING=1
fi

# --- clangd ---
if [ -x "$HOME/.local/bin/clangd" ] || command -v clangd >/dev/null 2>&1; then
  echo "    ✓ clangd found ($(clangd --version 2>&1 | head -1))"
else
  echo "    ✗ clangd not found"
  echo "      Download: https://github.com/clangd/clangd/releases"
  echo "      Extract and symlink bin/clangd to ~/.local/bin/clangd"
  LSP_MISSING=1
fi

if [ "$LSP_MISSING" -eq 0 ]; then
  echo "    All LSP servers installed ✓"
else
  echo ""
  echo "    ⚠  Some LSP servers are missing. Install them for full language support."
fi

echo ""
echo "==> Verifying CLI Authentication (OAuth-based)..."
echo "    MCP wrappers spawn CLIs directly — each CLI handles its own auth."
echo ""

verify_cli_ready() {
  local name=$1
  local cmd=$2
  local auth_cmd=$3

  if command -v "$cmd" >/dev/null 2>&1; then
    echo "    ✓ $name: CLI found at $(which $cmd)"
    echo "      Auth: $auth_cmd (run once if not already done)"
  else
    echo "    ✗ $name: CLI not found"
    echo "      Install the CLI, then run: $auth_cmd"
  fi
}

verify_cli_ready "Claude" "claude" "claude auth login"
verify_cli_ready "Gemini" "gemini" "gcloud auth application-default login"
verify_cli_ready "Codex"  "codex"  "codex login"

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Authenticate CLIs (if not already done):"
echo "     • claude auth login"
echo "     • gcloud auth application-default login"
echo "     • codex login"
echo ""
echo "  2. Run 'crush' in your project directory"
echo "  3. Megan will orchestrate Claude, Gemini, and Codex via CLI OAuth"
echo ""
echo "  4. Optional — Launch the tmux agent dashboard:"
echo "     • bash megan-tmux.sh         # Full dashboard (Crush + agent logs)"
echo "     • bash megan-tmux.sh --logs  # Agent logs only"
echo "     • bash megan-tmux.sh --status # Show agent status"
echo ""
echo "  5. Multi-session coordination:"
echo "     • megan-sessions             # List all active Crush sessions"
echo "     • megan-sessions watch       # Live-watch session events"
echo "     • megan-sessions send <id> <msg>  # Send message to another session"
echo "     • megan-daemon --status      # Check daemon status"
echo ""
echo "  6. LSP servers configured (crush.json lsp section):"
echo "     • jdtls (Java 25)            • kotlin-language-server"
echo "     • pyright (Python)           • rust-analyzer (Rust)"
echo "     • clangd (C/C++)             • typescript-language-server (TS/JS)"
echo "     • vscode-html/css/json       (web)"
echo ""
echo "To test MCP servers manually:"
echo "  echo '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{\"protocolVersion\":\"2024-11-05\",\"capabilities\":{}}}' | node $MCP_DIR/claude-code-mcp.js"
