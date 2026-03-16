---
name: docs-review
description: >
  Review, edit, and lint documentation for the Doc Detective project. Use this skill
  whenever you are asked to review, proofread, audit, improve, or edit any Doc Detective
  documentation — including user guides, tutorials, API/reference docs, README files, or
  any other written content in the doc-detective ecosystem. Also use when drafting new
  docs that need to conform to style, or when a user asks "does this follow our style
  guide?" Even if the request is phrased casually ("can you clean this up?", "check this
  page", "make this better"), trigger this skill if the content is Doc Detective
  documentation. This skill enforces the Google Developer Documentation Style Guide and
  supports Vale-based linting.
---

# Doc Detective Docs Review Skill

You are reviewing documentation for **Doc Detective**, an open-source documentation
testing framework. Doc Detective tests docs against live products (UIs, APIs, CLIs) to
ensure accuracy.

---

## Quick Reference: What This Skill Covers

| Doc Type | Examples |
|---|---|
| User guides & tutorials | Getting started, how-to guides, concept overviews |
| API / reference docs | Action schemas, config options, CLI flags, JSON spec |

---

## Style Guide

All Doc Detective documentation follows the **Google Developer Documentation Style
Guide**. The full condensed reference is in:

> 📄 `references/google-style-guide.md`

Read it before reviewing any document. Pay special attention to:

- Voice: second person ("you"), active voice, present tense
- Tone: conversational but not frivolous — "a knowledgeable friend"
- Formatting: sentence case for headings, serial commas, numbered lists for sequences
- Code: inline code font for all code, commands, file paths, parameter names
- UI elements: **bold** for UI labels, buttons, menus

---

## Vale Linter

Vale is a prose linter that automates style checking. If Vale is available in the
environment, use it alongside your manual review. Usage instructions are in:

> 📄 `references/vale-usage.md`

```bash Check that Vale is available
vale -v
```

---

## Output Modes

Choose the output format based on context:

### 1. Inline Edits (default when you can modify the file)
Make direct changes to the document. Use this when:
- You drafted the document and are reviewing your own work
- The user asks for edits, improvements, or a rewrite
- The user has provided a file and asked you to "fix it"

### 2. Structured Report (use when the document is read-only or the user asks for a review)
Produce a structured report with this format:

```markdown
## Documentation Review: [filename or doc title]

### Summary
[1–2 sentence overview of overall quality and main issues]

### Issues

| # | Line/Section | Severity | Rule | Issue | Suggestion |
|---|---|---|---|---|---|
| 1 | Line 14 | Error | active-voice | Passive voice: "is returned by" | Change to "returns" |
| 2 | Intro | Warning | second-person | Uses "we" instead of "you" | Replace "we recommend" with "use" or "you can" |

Severity: 🔴 Error · 🟡 Warning · 🔵 Suggestion

### Vale Output (if run)
[Paste raw Vale output here, or "Vale not run."]

### Recommended Next Steps
[Short prioritized list of actions]
```

### 3. Hybrid (inline edits + summary report)
Use when the user asks for both changes and an explanation. Apply edits, then append
a brief report summarizing what changed and why.

---

## Doc Detective-Specific Conventions

These are project-specific rules that take precedence over the style guide.

### Terminology
- **Doc Detective** — always capitalized, two words, never abbreviated as "DD" in docs
- **test spec** / **test specification** — prefer "test spec" in prose
- **step** — a single action in a test; plural "steps"
- **action** — the task performed in a step (e.g., `goTo`, `find`, `click`)
- **context** — a browser/platform environment in which tests run

### Action Names
Action names are always in code font and match their JSON key exactly:
- `goTo`, `find`, `click`, `type`, `screenshot`, `checkLink`, `runShell`, `wait`, `httpRequest`

### File Types
- Test spec files: `.spec.json`
- Config files: `.doc-detective.json`
- Inline test comments in Markdown use `[comment]: # '...'` syntax — document this format exactly

### Code Examples
- JSON examples must be valid JSON (no comments inside JSON blocks)
- Shell commands should include the full `npx doc-detective` invocation, not shorthand
- Always show expected output when demonstrating a command

---

## Workflow

1. **Read** `references/google-style-guide.md` if you haven't already this session
2. **Run Vale** if available: `vale <file>` (see `references/vale-usage.md` for config)
3. **Review manually** based on the Google Style Guide
4. **Produce output** in the appropriate mode (inline edits, report, or hybrid)
5. **Flag any ambiguities** — if a Doc Detective-specific term or convention is unclear,
   note it and ask the user rather than guessing

---

## Files in This Skill

| File | Purpose |
|---|---|
| `SKILL.md` | This file — workflow, conventions, checklist |
| `references/google-style-guide.md` | Condensed Google Dev Docs style guide |
| `references/vale-usage.md` | Vale usage for Doc Detective |