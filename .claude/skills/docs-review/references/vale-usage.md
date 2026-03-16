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

Use Vale as a first pass; follow up with manual review using the style guide.

---

## Verify installation

```bash
vale --version
```

---

## Configuration

The Doc Detective monorepo already has a `.vale.ini` at `docs/.vale.ini`. No
configuration setup is needed. Run Vale from the `docs/` directory so it picks up that
config automatically, or pass it explicitly with `--config`.

Linting MDX files requires the `mdx2vast` package installed globally. If `mdx2vast` is not available, run `npm install` from within the `docs/` directory.

---

## Running Vale

Run Vale in one of two ways:
- from the `docs/` directory. Vale will find the config file automatically
- from the repo root, specifying the config file at `docs/.vale.ini`, and pointing at files under `docs/`

### Lint a single file
```bash
vale docs/getting-started.md
```

### Lint all supported files in docs/
```bash
vale docs/
```

### Output as JSON (useful for scripting)
```bash
vale --output=JSON docs/getting-started.md
```

### Explicitly specify the config file (if running from the repo root)
```bash
vale --config=docs/.vale.ini docs/getting-started.md
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

## Quick Reference

| Task | Command |
|---|---|
| Lint a file | `vale docs/<file>.md` |
| Lint all docs | `vale docs/` |
| JSON output | `vale --output=JSON docs/<file>.md` |
| Check config | `vale ls-config` |

---

*Vale: https://vale.sh — Google Vale package: https://github.com/errata-ai/Google*