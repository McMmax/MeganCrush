# zoxide – A Smarter `cd`

[zoxide](https://github.com/ajeetdsouza/zoxide) remembers which directories you use most, letting you jump anywhere with just a few keystrokes.

## Installation

**macOS (Homebrew)**
```bash
brew install zoxide
```

**Linux**

Debian/Ubuntu:
```bash
sudo apt install zoxide
```

Fedora:
```bash
sudo dnf install zoxide
```

Arch:
```bash
sudo pacman -S zoxide
```

Alpine:
```bash
sudo apk add zoxide
```

**Windows (via Scoop)**
```bash
scoop install zoxide
```

**From source (requires Rust)**
```bash
cargo install zoxide --locked
```

After installing, add the appropriate init command to your shell config (see below).

## Basic Usage

```bash
# Jump to a directory (fuzzy match)
z foo

# Jump with multiple keywords
z foo bar

# Interactive selection (requires fzf)
zi foo

# See current database
zoxide query -l
```

## Shell Integration

Add this to your shell configuration file:

**Bash (~/.bashrc):**
```bash
eval "$(zoxide init bash)"
```

**Zsh (~/.zshrc):**
```bash
eval "$(zoxide init zsh)"
```

**Fish (~/.config/fish/config.fish):**
```fish
zoxide init fish | source
```

**PowerShell ($PROFILE):**
```powershell
Invoke-Expression (& { (zoxide init powershell | Out-String) })
```

## How Megan Can Use It

- **Quick navigation:** Before operating on a project, use z to move to the right directory.
- **Path suggestions:** When a user asks "go to the auth module", Megan can run `z auth` to jump there.
- **Integration with wtp cd:** zoxide complements worktree navigation by remembering frequent worktree locations.

## In Megan's Workflows

Megan can keep a mental map of where the user works most. She can suggest z commands to speed up navigation, or even use it internally to resolve paths.
