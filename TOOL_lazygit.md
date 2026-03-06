# lazygit – Terminal UI for Git

[lazygit](https://github.com/jesseduffield/lazygit) is a full-featured terminal UI for git. It provides an interactive, keyboard-driven interface for staging, committing, branching, rebasing, resolving conflicts, and more — all without memorizing git commands.

## Installation

**macOS (Homebrew)**
```bash
brew install lazygit
```

**Linux**

Binary install (no sudo):
```bash
# Download latest release from https://github.com/jesseduffield/lazygit/releases
tar xzf lazygit_*_Linux_x86_64.tar.gz
cp lazygit ~/.local/bin/lazygit
```

Arch:
```bash
sudo pacman -S lazygit
```

Fedora (COPR):
```bash
sudo dnf copr enable atim/lazygit -y
sudo dnf install lazygit
```

Ubuntu (PPA):
```bash
sudo add-apt-repository ppa:lazygit-team/release
sudo apt update && sudo apt install lazygit
```

**Windows**
```bash
winget install lazygit
# or
scoop install lazygit
```

**From source (requires Go)**
```bash
go install github.com/jesseduffield/lazygit@latest
```

## Basic Usage

```bash
lazygit              # Launch in current repo
lazygit -p ~/myrepo  # Launch in specific repo
lazygit log          # Jump straight to log view
```

## Key Panels & Navigation

lazygit displays five panels side by side:

| Panel | Key | Purpose |
|-------|-----|---------|
| **Status** | `1` | Repo name, branch, upstream sync status |
| **Files** | `2` | Staged/unstaged changes, untracked files |
| **Branches** | `3` | Local branches, remotes, tags |
| **Commits** | `4` | Commit log with diff preview |
| **Stash** | `5` | Stash entries |

Navigate between panels with `Tab` / `Shift+Tab` or number keys. Use `↑`/`↓` or `j`/`k` within panels.

## Essential Keybindings

### Files Panel
| Key | Action |
|-----|--------|
| `Space` | Stage/unstage file |
| `a` | Stage/unstage all |
| `c` | Commit staged changes |
| `A` | Amend last commit |
| `d` | Discard changes (with confirmation) |
| `e` | Edit file in editor |
| `Enter` | View file diff (line-by-line staging) |

### Branches Panel
| Key | Action |
|-----|--------|
| `Space` | Checkout branch |
| `n` | New branch |
| `d` | Delete branch |
| `M` | Merge into current branch |
| `r` | Rebase current branch onto selected |
| `R` | Rename branch |

### Commits Panel
| Key | Action |
|-----|--------|
| `s` | Squash commit into parent |
| `r` | Reword commit message |
| `d` | Drop commit |
| `e` | Edit commit (interactive rebase) |
| `p` | Pick commit (during rebase) |
| `g` | Reset to this commit |
| `c` | Copy commit (cherry-pick) |
| `v` | Paste (cherry-pick) copied commit |

### Global
| Key | Action |
|-----|--------|
| `p` | Pull |
| `P` | Push |
| `z` | Undo (via reflog) |
| `?` | Show all keybindings |
| `q` | Quit |
| `x` | Open command menu |
| `/` | Filter/search in current panel |

## Conflict Resolution

When merge conflicts exist, lazygit highlights conflicting files. Press `Enter` on a conflicting file to open the merge view:

| Key | Action |
|-----|--------|
| `↑`/`↓` | Navigate between conflicts |
| `←`/`→` | Select ours/theirs |
| `b` | Pick both |
| `Space` | Pick highlighted section |

## Configuration

Config lives at `~/.config/lazygit/config.yml`:

```yaml
gui:
  showIcons: true
  theme:
    activeBorderColor:
      - green
      - bold
git:
  paging:
    colorArg: always
    pager: delta --dark --paging=never
os:
  editPreset: "nvim"
```

Integrate with delta for better diffs by setting the pager as shown above.

## How Megan Can Use It

- **Interactive staging:** Stage individual lines or hunks instead of whole files — essential for clean, atomic commits.
- **Interactive rebase:** Squash, reorder, reword, and drop commits visually instead of hand-editing rebase todo files.
- **Conflict resolution:** Resolve merge conflicts with a visual side-by-side view instead of editing conflict markers.
- **Branch management:** Create, checkout, merge, rebase, and delete branches with single keystrokes.
- **Undo mistakes:** Use reflog-based undo (`z`) to recover from bad rebases or resets.
- **Visual log:** Browse commit history with inline diffs for quick code archaeology.

## In Megan's Workflows

Megan should use `lazygit` as the **primary tool** for interactive git operations. Examples:

- When the user needs to stage specific hunks or lines, launch `lazygit` instead of running manual `git add -p`.
- For interactive rebases (squash, reorder, fixup), use lazygit's commit panel instead of `git rebase -i`.
- For merge conflict resolution, use lazygit's built-in conflict resolver instead of editing markers by hand.
- For quick visual inspection of repo state (branches, stashes, recent commits), `lazygit` gives a full overview in one screen.
- Combine with `delta` (already in Megan's toolkit) for syntax-highlighted diffs inside lazygit.
