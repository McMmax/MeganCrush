# fzf – Command-Line Fuzzy Finder

[fzf](https://github.com/junegunn/fzf) is an interactive filter for any list: files, history, processes, git commits, etc. It uses fuzzy matching so you can type partial patterns and still get the right results.

## Installation

**macOS (Homebrew)**
```bash
brew install fzf
# To enable useful key bindings and fuzzy completion:
$(brew --prefix)/opt/fzf/install
```

**Linux**

Debian/Ubuntu:
```bash
sudo apt install fzf
```

Fedora:
```bash
sudo dnf install fzf
```

Arch:
```bash
sudo pacman -S fzf
```

Alpine:
```bash
sudo apk add fzf
```

**Windows (via Scoop)**
```bash
scoop install fzf
```

**From source (any platform)**
```bash
git clone --depth 1 https://github.com/junegunn/fzf.git ~/.fzf
~/.fzf/install
```

## Basic Usage

```bash
# Find a file interactively
vim $(fzf)

# Pipe any list to fzf
git branch | fzf

# Multi-select mode
fzf -m

# With preview window (requires bat)
fzf --preview 'bat --color=always {}'
```

## How Megan Can Use It

- **File selection:** Let the user pick files with fzf before acting.
- **Branch switching:** Use `git branch | fzf` to let the user select a branch, then `git checkout`.
- **Command history:** Pipe history to fzf for quick re-execution.
- **Process killing:** `ps aux | fzf | awk '{print $2}' | xargs kill`.
- **Integration with bat:** Preview files with syntax highlighting during selection.

## In Megan's Workflows

Megan can invoke fzf whenever a choice needs to be made interactively. For example:

- Before a multi-file refactor, ask the user to select files via fzf.
- During debugging, let the user pick a log file to analyze.
