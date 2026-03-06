# ripgrep (rg) – Line-Oriented Search Tool

[ripgrep](https://github.com/BurntSushi/ripgrep) recursively searches your current directory for a regex pattern, respecting `.gitignore` and ignoring hidden/binary files by default. It's faster than grep and ack.

## Installation

**macOS (Homebrew)**
```bash
brew install ripgrep
```

**Linux**

Debian/Ubuntu:
```bash
sudo apt install ripgrep
```

Fedora:
```bash
sudo dnf install ripgrep
```

Arch:
```bash
sudo pacman -S ripgrep
```

Alpine:
```bash
sudo apk add ripgrep
```

**Windows**

Using Scoop:
```bash
scoop install ripgrep
```

Using Chocolatey:
```bash
choco install ripgrep
```

Using Winget:
```bash
winget install BurntSushi.ripgrep
```

**From source (requires Rust)**
```bash
cargo install ripgrep
```

## Basic Usage

```bash
# Search for pattern in all files
rg "function"

# Show context lines
rg -C 3 "error"

# Search only .rs files
rg -t rs "impl"

# List files that match
rg -l "TODO"
```

## How Megan Can Use It

- **Codebase exploration:** Before refactoring, use rg to find all usages of a function.
- **Debugging:** Search logs or code for error messages.
- **Pattern detection:** Count occurrences of a pattern with `rg -c`.
- **Integration with bat:** Pipe results to bat for pretty printing.

## In Megan's Workflows

Megan can run rg queries to gather context for the user or for sub-agents. For example, before asking Claude Code to refactor a function, she can find all its call sites with rg and include them in the prompt.
