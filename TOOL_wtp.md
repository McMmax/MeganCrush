# wtp – Worktree Plus

[wtp](https://github.com/satococoa/wtp) extends Git worktrees with automated setup, branch tracking, and project-specific hooks. It eliminates the manual path gymnastics of raw `git worktree`.

## Installation

**macOS/Linux (Homebrew)**
```bash
brew install satococoa/tap/wtp
```

**Via Go (any platform with Go installed)**
```bash
go install github.com/satococoa/wtp/v2/cmd/wtp@latest
```

**Direct binary download (from GitHub Releases)**

macOS (Apple Silicon):
```bash
curl -L https://github.com/satococoa/wtp/releases/latest/download/wtp_Darwin_arm64.tar.gz | tar xz
sudo mv wtp /usr/local/bin/
```

Linux (x86_64):
```bash
curl -L https://github.com/satococoa/wtp/releases/latest/download/wtp_Linux_x86_64.tar.gz | tar xz
sudo mv wtp /usr/local/bin/
```

## Basic Usage

```bash
# Create a worktree for a branch
wtp add feature/auth

# List all worktrees
wtp list

# Remove a worktree and its branch
wtp remove --with-branch feature/auth

# Jump to a worktree (with shell hook)
wtp cd feature/auth
```

## Shell Integration (optional, for wtp cd)

Add to your shell config:

**Bash (~/.bashrc):**
```bash
eval "$(wtp shell-init bash)"
```

**Zsh (~/.zshrc):**
```bash
eval "$(wtp shell-init zsh)"
```

**Fish (~/.config/fish/config.fish):**
```fish
wtp shell-init fish | source
```

## How Megan Can Use It

- **Multi-branch development:** When working on multiple features, Megan can use wtp to create isolated worktrees for each.
- **Hooks for setup:** Define `.wtp.yml` with post_create hooks to copy .env files, install dependencies, etc. Megan can execute these automatically.
- **Navigation:** Use `wtp cd` to switch contexts instantly.

## In Megan's Workflows

Megan can offer to create a new worktree when starting a feature, run the post-create hooks, and then cd into it. She can also list all worktrees and let the user pick one with fzf.
