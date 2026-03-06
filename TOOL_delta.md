# delta – A Syntax-Highlighting Pager for Git/Diffs

[delta](https://github.com/dandavison/delta) beautifies `git diff`, `git show`, `git log`, and any diff output with syntax highlighting, word-level changes, and side-by-side view.

## Installation

**macOS (Homebrew)**
```bash
brew install git-delta
```

**Linux**

Debian/Ubuntu:
```bash
sudo apt install git-delta
```

Fedora:
```bash
sudo dnf install git-delta
```

Arch:
```bash
sudo pacman -S git-delta
```

**Windows (via Scoop)**
```bash
scoop install delta
```

**From source (requires Rust)**
```bash
cargo install git-delta
```

## Basic Usage

```bash
# Configure git to use delta
git config --global core.pager delta
git config --global delta.navigate true

# View a diff
git diff

# Use with any diff
diff -u file1 file2 | delta

# Side-by-side mode
delta --side-by-side
```

## How Megan Can Use It

- **Diff reviews:** When a user asks to see changes, Megan can show them with delta for maximum clarity.
- **Git blame:** delta also enhances git blame with syntax highlighting and hyperlinks.
- **Merge conflicts:** delta can display merge conflicts in a more readable way.

## In Megan's Workflows

Megan can pipe diff output through delta before presenting it to the user. She can also configure the user's git to use delta if desired.
