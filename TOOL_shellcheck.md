# ShellCheck – Static Analysis for Shell Scripts

[ShellCheck](https://github.com/koalaman/shellcheck) finds bugs, typos, and stylistic issues in shell scripts. It's like a linter for bash/sh.

## Installation

**macOS (Homebrew)**
```bash
brew install shellcheck
```

**Linux**

Debian/Ubuntu:
```bash
sudo apt install shellcheck
```

Fedora:
```bash
sudo dnf install ShellCheck
```

Arch:
```bash
sudo pacman -S shellcheck
```

Alpine:
```bash
sudo apk add shellcheck
```

**Windows**

Using Scoop:
```bash
scoop install shellcheck
```

Using Chocolatey:
```bash
choco install shellcheck
```

Using Winget:
```bash
winget install --id koalaman.shellcheck
```

**From source (requires Haskell Stack or Cabal)**
```bash
cabal update && cabal install ShellCheck
# or using stack
stack update && stack install ShellCheck
```

## Basic Usage

```bash
# Check a script
shellcheck myscript.sh

# Show only errors
shellcheck --severity=error myscript.sh

# Output in different formats
shellcheck -f json myscript.sh
shellcheck -f checkstyle myscript.sh
```

## How Megan Can Use It

- **Code quality:** Before suggesting a shell command, Megan can run it through ShellCheck to catch mistakes.
- **User education:** If a user shares a broken script, Megan can analyze it with ShellCheck and explain the warnings.
- **Automated checks:** In a CI context, Megan can remind the user to run ShellCheck before committing.

## In Megan's Workflows

Megan can integrate ShellCheck into her "review" mode: after generating a shell script, she can run it through ShellCheck, fix issues, and then present the corrected version.
