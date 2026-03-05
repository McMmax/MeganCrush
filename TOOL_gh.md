# gh – GitHub CLI

[gh](https://github.com/cli/cli) is GitHub's official command-line tool. It brings pull requests, issues, releases, gists, Actions, and the full GitHub API to the terminal — no browser needed.

## Installation

**macOS (Homebrew)**
```bash
brew install gh
```

**Linux**

Debian/Ubuntu (official repo):
```bash
(type -p wget >/dev/null || sudo apt install wget -y) \
  && sudo mkdir -p -m 755 /etc/apt/keyrings \
  && wget -qO- https://cli.github.com/packages/githubcli-archive-keyring.gpg \
     | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
     | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
  && sudo apt update && sudo apt install gh -y
```

Binary install (no sudo):
```bash
# Download latest release from https://github.com/cli/cli/releases
tar xzf gh_*_linux_amd64.tar.gz
cp gh_*/bin/gh ~/.local/bin/gh
```

Arch:
```bash
sudo pacman -S github-cli
```

Fedora:
```bash
sudo dnf install gh
```

**Windows**
```bash
winget install GitHub.cli
# or
scoop install gh
```

## Authentication

```bash
gh auth login          # Interactive OAuth login (browser-based)
gh auth status         # Check current auth state
gh auth logout         # Log out
gh auth token          # Print current token
```

## Basic Usage

### Pull Requests
```bash
gh pr create                    # Create PR from current branch
gh pr create --title "T" --body "B"  # Non-interactive
gh pr list                      # List open PRs
gh pr view 42                   # View PR #42
gh pr checkout 42               # Check out PR branch locally
gh pr merge 42                  # Merge PR
gh pr diff 42                   # Show PR diff
gh pr review 42 --approve       # Approve PR
gh pr status                    # Show PR status for current branch
```

### Issues
```bash
gh issue create                 # Create issue interactively
gh issue list                   # List open issues
gh issue view 10                # View issue #10
gh issue close 10               # Close issue
gh issue comment 10 --body "msg"  # Add comment
gh issue list --label bug       # Filter by label
```

### Repositories
```bash
gh repo create myrepo --public  # Create new repo
gh repo clone user/repo         # Clone a repo
gh repo fork user/repo          # Fork a repo
gh repo view                    # View current repo info
gh repo list                    # List your repos
```

### Actions / Workflows
```bash
gh run list                     # List recent workflow runs
gh run view <run-id>            # View run details
gh run watch <run-id>           # Live-watch a running workflow
gh run rerun <run-id>           # Re-run a failed workflow
gh workflow list                # List workflows
gh workflow run <workflow>      # Trigger a workflow manually
```

### Releases
```bash
gh release create v1.0.0        # Create a release
gh release list                 # List releases
gh release download v1.0.0      # Download release assets
```

### Gists
```bash
gh gist create file.txt         # Create gist from file
gh gist list                    # List your gists
gh gist view <id>               # View a gist
```

### GitHub API (arbitrary)
```bash
gh api repos/{owner}/{repo}                    # GET request
gh api -X POST repos/{owner}/{repo}/issues \
  -f title="Bug" -f body="Details"             # POST request
gh api graphql -f query='{ viewer { login } }'  # GraphQL
```

## How Megan Can Use It

- **PR workflows:** Create, review, and merge pull requests entirely from the terminal — no context-switching to a browser.
- **Issue triage:** List, filter, comment on, and close issues as part of a development workflow.
- **CI/CD monitoring:** Watch GitHub Actions runs in real time, re-run failed jobs, trigger workflows.
- **Release management:** Tag, create releases, and upload assets in a single command.
- **API access:** Query any GitHub API endpoint for automation, reporting, or data gathering.
- **Repo management:** Clone, fork, and create repositories without leaving the terminal.

## In Megan's Workflows

Megan should use `gh` as the **primary tool** for all GitHub interactions. Examples:

- Before starting work on a feature, check for related issues with `gh issue list`.
- After finishing a feature branch, create a PR with `gh pr create` instead of navigating to GitHub.
- Monitor CI status with `gh run watch` after pushing changes.
- Use `gh api` for any GitHub data retrieval that doesn't have a dedicated subcommand.
