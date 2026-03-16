# Vale Setup for Doc Detective Docs

Vale is a prose linter that automatically checks documentation against style guide
rules. This guide covers installation, configuration, and usage for the Doc Detective
documentation project.

---

## Overview

Vale checks `.md` (and other prose) files against a set of rule packages. For Doc
Detective docs, use the **Google** package, which encodes the Google Developer
Documentation Style Guide rules that Vale can check automatically.

Vale can catch:
- Passive voice
- First-person plural ("we", "our")
- Wordiness and filler phrases ("simply", "please", "just")
- Incorrect capitalization patterns
- Some word list violations (e.g., "kill" → "stop")
- Readability issues

Vale **cannot** catch:
- Structural or organizational problems
- Whether instructions are accurate
- Whether code examples are correct
- Nuanced tone issues

Use Vale as a first pass; follow up with manual review using the style guide checklist.

---

## Installation

### macOS
```bash
brew install vale
```

### Linux
```bash
# Download the latest release from GitHub
wget https://github.com/errata-ai/vale/releases/latest/download/vale_Linux_64-bit.tar.gz
tar -xzf vale_Linux_64-bit.tar.gz
sudo mv vale /usr/local/bin/vale
```

### Windows
```powershell
choco install vale
```

### Verify installation
```bash
vale --version
```

---

## Configuration

Create a `.vale.ini` file in the root of the Doc Detective documentation repository.

### Recommended `.vale.ini`

```ini
# .vale.ini for Doc Detective documentation
StylesPath = .vale/styles
MinAlertLevel = suggestion

Packages = Google

[*.md]
BasedOnStyles = Google
```

### Download the Google style package

After creating `.vale.ini`, run:

```bash
vale sync
```

This downloads the Google style package into `.vale/styles/Google/`.

---

## Running Vale

### Lint a single file
```bash
vale docs/getting-started.md
```

### Lint all Markdown files in a directory
```bash
vale docs/
```

### Output as JSON (useful for scripting)
```bash
vale --output=JSON docs/getting-started.md
```

### Use a specific config file
```bash
vale --config=path/to/.vale.ini docs/getting-started.md
```

---

## Understanding Vale Output

```
docs/getting-started.md
 14:5   warning  Use 'we' sparingly.                    Google.We
 22:1   error    'is returned' looks like passive voice.  Google.Passive
 37:10  suggestion  Try to avoid using 'simply'.        Google.Simple
```

| Column | Meaning |
|---|---|
| `14:5` | Line 14, column 5 |
| `warning` | Severity (error / warning / suggestion) |
| Message | Description of the issue |
| `Google.We` | Package and rule name |

**Severity levels:**
- `error` — Strong style violation; should always be fixed
- `warning` — Recommended fix; use judgment
- `suggestion` — Optional improvement

---

## Suppressing False Positives

### Skip a single line
```markdown
<!-- vale off -->
This sentence has intentional passive voice for a specific reason.
<!-- vale on -->
```

### Skip a specific rule for a block
```markdown
<!-- vale Google.Passive = NO -->
Some content where passive voice is acceptable (e.g., a description of a
system behavior where the actor is intentionally omitted).
<!-- vale Google.Passive = YES -->
```

### Skip a whole file (add to front matter or first line)
Add this at the top of the file:
```markdown
<!-- vale off -->
```

Use suppression sparingly — the goal is to fix issues, not hide them.

---

## Adding Doc Detective-Specific Rules (Optional)

You can add custom Vale rules for Doc Detective's own terminology. Create a
`DocDetective` style folder:

```
.vale/styles/DocDetective/
├── Terminology.yml       # Enforce correct product name usage
└── Actions.yml           # Enforce correct action name casing
```

### Example: Terminology.yml

```yaml
# Enforces "Doc Detective" (two words, capitalized)
extends: substitution
message: Use '%s' instead of '%s'.
level: error
ignorecase: true
swap:
  'doc-detective': Doc Detective
  'docdetective': Doc Detective
  'doc detective': Doc Detective
```

### Example: Actions.yml

```yaml
# Enforces correct camelCase for Doc Detective actions
extends: substitution
message: Use the correct action name '%s' instead of '%s'.
level: warning
ignorecase: false
swap:
  'goto': goTo
  'checklink': checkLink
  'runshell': runShell
  'httpRequest': httpRequest
```

To enable custom rules, add `DocDetective` to your `.vale.ini`:

```ini
[*.md]
BasedOnStyles = Google, DocDetective
```

---

## CI Integration (GitHub Actions)

To run Vale on pull requests automatically, add this workflow:

```yaml
# .github/workflows/vale.yml
name: Vale Linting

on:
  pull_request:
    paths:
      - 'docs/**/*.md'
      - '*.md'

jobs:
  vale:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: errata-ai/vale-action@reviewdog
        with:
          files: docs/
          reporter: github-pr-review
```

---

## Quick Reference

| Task | Command |
|---|---|
| Install Google style | `vale sync` |
| Lint a file | `vale <file>.md` |
| Lint a directory | `vale docs/` |
| JSON output | `vale --output=JSON <file>.md` |
| Check config | `vale ls-config` |
| Suppress a rule | `<!-- vale RuleName = NO --> ... <!-- vale RuleName = YES -->` |

---

## Common Google Style Rules in Vale

These are the Vale rules most likely to fire on Doc Detective docs:

| Rule | What it catches | Severity |
|---|---|---|
| `Google.Passive` | Passive voice constructions | warning |
| `Google.We` | First-person plural ("we", "our") | warning |
| `Google.WordList` | Banned or flagged words ("kill", "blacklist", etc.) | error/warning |
| `Google.Headings` | Title case in headings | warning |
| `Google.Contractions` | Absence of contractions where natural | suggestion |
| `Google.Parens` | Overuse of parentheses | suggestion |
| `Google.Quotes` | Smart quotes vs. straight quotes | warning |

---

*Vale: https://vale.sh — Google Vale package: https://github.com/errata-ai/Google*