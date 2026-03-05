# bat – A `cat` Clone with Syntax Highlighting

[bat](https://github.com/sharkdp/bat) displays files with syntax highlighting, Git integration, and automatic paging. It's a drop-in replacement for `cat`.

## Installation

**macOS (Homebrew)**
```bash
brew install bat
```

**Linux**

Debian/Ubuntu:
```bash
sudo apt install bat
```

Note: executable may be named `batcat`; create an alias if desired:
```bash
alias bat=batcat
```

Fedora:
```bash
sudo dnf install bat
```

Arch:
```bash
sudo pacman -S bat
```

Alpine:
```bash
sudo apk add bat
```

**Windows (via Scoop)**
```bash
scoop install bat
```

**From source (requires Rust)**
```bash
cargo install bat --locked
```

## Basic Usage

```bash
# Display a file with line numbers and Git changes
bat file.rs

# Show multiple files
bat src/*.rs

# Read from stdin, auto-detect language
curl -s http://example.com | bat

# Use as a pager for `man`
export MANPAGER="bat -pl man"
```

## How Megan Can Use It

- **Code previews:** When a user asks to see a file, Megan can display it with bat for syntax-highlighted output.
- **Integration with fzf:** Preview files in an fzf picker using bat.
- **Combined with rg:** Pipe search results to bat for beautiful context views.
- **Help pages:** Use bat to colorize `--help` output (via alias `help='... | bat -pl help'`).

## In Megan's Workflows

Megan should default to bat whenever she needs to show file contents. She can also teach the user to set up bat as a pager for various tools.
