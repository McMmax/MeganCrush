# tldr – Collaborative Cheat Sheets for Command-Line Tools

[tldr-pages](https://github.com/tldr-pages/tldr) provides concise, practical examples for common commands. It's perfect for quickly recalling syntax.

## Installation

**macOS (Homebrew)**
```bash
brew install tldr
```

**Linux**

Debian/Ubuntu:
```bash
sudo apt install tldr
```

Fedora:
```bash
sudo dnf install tldr
```

Arch:
```bash
sudo pacman -S tldr
```

Alpine:
```bash
sudo apk add tldr
```

**Windows (via npm)**
```bash
npm install -g tldr
```

**Or use the Python client (requires pip)**
```bash
pip install tldr
```

## Basic Usage

```bash
# Get examples for a command
tldr tar
tldr git commit
tldr fzf

# Update the local cache
tldr --update
```

## How Megan Can Use It

- **Self-learning:** If Megan encounters a tool she doesn't know, she can run `tldr <tool>` to get a quick overview.
- **User assistance:** When a user asks "how do I use xyz?", Megan can fetch and display the tldr page.
- **Integration:** Combine with fzf to pick a tool and show its tldr page interactively.

## In Megan's Workflows

Megan can treat tldr as her built-in reference library. Before using any unfamiliar tool, she can check its tldr page to ensure correct syntax. She can also suggest that users run tldr themselves.
