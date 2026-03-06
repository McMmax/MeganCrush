# CLI Installation Guide

## Prerequisites

Megan requires three CLIs to be authenticated. This guide walks through installing and authenticating each one.

---

## 1. Claude CLI

### Install Claude CLI

```bash
# Using npm (Node.js required)
npm install -g @anthropic-ai/cli

# Verify installation
claude --version
```

### Authenticate

```bash
claude auth login
```

This opens a browser for OAuth authentication. The CLI caches credentials internally.

**Verify:** 
```bash
claude --version
# Should show version number, confirming CLI is installed and ready
```

---

## 2. Google Cloud CLI (gcloud)

### Install gcloud

```bash
# Official installation method
curl https://sdk.cloud.google.com | bash

# Then restart your shell
exec -l $SHELL

# Verify installation
gcloud --version
```

**Alternative (Ubuntu/Debian):**
```bash
apt-get install google-cloud-cli
```

**Alternative (macOS with Homebrew):**
```bash
brew install --cask google-cloud-sdk
```

### Authenticate

```bash
gcloud auth application-default login
```

This opens a browser for authentication and saves credentials to `~/.config/gcloud/application_default_credentials.json`.

**Verify:**
```bash
cat ~/.config/gcloud/application_default_credentials.json | head -5
# Should show JSON with "type": "authorized_user"
```

---

## 3. Codex CLI

### Install Codex CLI

```bash
# Using npm (Node.js required)
npm install -g @openai/codex

# Verify installation
codex --version
```

### Authenticate

```bash
codex login
```

This opens a browser for OAuth authentication.

**Verify:**
```bash
codex --version
# Should show version without auth errors
```

---

## Verification Checklist

After installing and authenticating, run:

```bash
# Check Claude
claude --version
# Should show version number

# Check Gemini/gcloud
cat ~/.config/gcloud/application_default_credentials.json | head -5
# Should show JSON

# Check Codex
codex --version
# Should work without auth errors
```

---

## Setup Megan

Once all CLIs are authenticated:

```bash
# Install MCP wrappers
bash layout/setup.sh

# Start Megan
crush
```

---

## Troubleshooting

### "claude command not found"
```bash
npm install -g @anthropic-ai/cli
```

### "gcloud command not found"
```bash
curl https://sdk.cloud.google.com | bash
exec -l $SHELL
```

### "Claude client not initialized"
```bash
claude auth login
```

### "Gemini authentication failed"
```bash
gcloud auth application-default login
```

### "OpenAI/Codex authentication failed"
```bash
codex login
```

---

## System Requirements

- **Node.js:** 18+ (for Claude CLI and MCP wrappers)
- **Bash/Shell:** For setup.sh script
- **Internet:** For CLI authentication (browser-based)
- **~50MB:** Disk space for CLI tools

---

## Environment Variables

No API key environment variables are needed. All authentication goes through CLI OAuth.

You can override default credential paths if needed:

```bash
# Claude
export ANTHROPIC_HOME=/custom/path  # Default: ~/.anthropic

# Google (if using custom credentials path)
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json
```

---

## Next Steps

1. **Install CLIs** (follow steps above)
2. **Authenticate CLIs** (each CLI guides you through OAuth)
3. **Run setup:**
   ```bash
   bash layout/setup.sh
   ```
4. **Verify setup completed successfully**
5. **Start Megan:**
   ```bash
   crush
   ```

---

## Getting Help

If you encounter issues:

1. Check **Troubleshooting** section above
2. Verify each CLI separately:
   ```bash
   claude --version
   gcloud --version
   codex --version
   ```
3. Re-run authentication for any failing CLI
4. Run `bash layout/setup.sh` again
5. See **OAUTH_IMPLEMENTATION.md** for detailed troubleshooting

---

**Time Estimate:** 5-10 minutes total
- Install CLIs: 2-3 minutes
- Authenticate CLIs: 2-5 minutes (browser interactions)
- Setup Megan: 30 seconds
