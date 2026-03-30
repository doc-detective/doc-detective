# Google Developer Documentation Style Guide — Condensed Reference

> Source: https://developers.google.com/style  
> This is a condensed working reference for the Doc Detective docs review skill.  
> The guide is a set of guidelines, not absolute rules. Use judgment; depart from it
> when doing so genuinely improves the content.

---

## Table of Contents

1. [Tone and Voice](#1-tone-and-voice)
2. [Language and Grammar](#2-language-and-grammar)
3. [Punctuation](#3-punctuation)
4. [Formatting and Organization](#4-formatting-and-organization)
5. [Lists](#5-lists)
6. [Headings](#6-headings)
7. [Code and Technical Content](#7-code-and-technical-content)
8. [Links and Cross-References](#8-links-and-cross-references)
9. [Images](#9-images)
10. [API Reference Docs](#10-api-reference-docs)
11. [Global Audience](#11-global-audience)
12. [Common Word List (Selected)](#12-common-word-list-selected)

---

## 1. Tone and Voice

**Goal:** Sound like a knowledgeable friend — clear, helpful, and respectful — not
like a legal document or a cheerful marketing brochure.

### Conversational but professional
- Write in a natural, flowing style. Short sentences are fine. Contractions are
  encouraged ("don't", "you'll", "it's").
- Avoid: overly formal language ("utilize" → "use"), jargon without definition, and
  filler phrases ("please note that", "it should be noted", "simply").
- Avoid: hype and excessive claims ("the best", "powerful", "seamlessly").

### Second person
- Address the reader as "you". Never use "we" to mean the reader and writer together.
- ✅ "You can configure the timeout."
- ❌ "We can configure the timeout."
- "We" is acceptable when referring to the organization ("We recommend...") but prefer
  second person even there: "Use..." or "For best results..."

### Active voice
- Make clear who or what performs the action.
- ✅ "Doc Detective runs the test."
- ❌ "The test is run by Doc Detective."
- Passive voice is OK when the actor is unknown or irrelevant, but prefer active.

### Present tense
- Describe what things do, not what they will do.
- ✅ "The command returns a JSON object."
- ❌ "The command will return a JSON object."

### No anthropomorphism
- Don't attribute human feelings or intentions to software.
- ❌ "The config file wants a string." / "The tool thinks the path is valid."
- ✅ "The config file requires a string." / "The tool validates the path."

### Don't pre-announce
- Don't describe what the doc is about to say — just say it.
- ❌ "In this section, we will explain how to..."
- ✅ Start with the content directly.

---

## 2. Language and Grammar

### Conditions before instructions
- Put the condition first so readers can skip irrelevant steps.
- ✅ "If you're on Windows, use PowerShell."
- ❌ "Use PowerShell if you're on Windows."

### Sentence structure
- Prefer shorter sentences. If a sentence has multiple clauses, break it up.
- One idea per sentence where possible.

### Abbreviations
- Spell out on first use, then abbreviate: "continuous integration (CI)".
- Don't use abbreviations in headings.
- Common technical abbreviations (API, URL, JSON, CLI) don't need expansion.

### Contractions
- Use them. They make the tone more natural and approachable.
- "don't", "you'll", "it's", "can't" are all fine.

### Numbers
- Spell out zero through nine; use numerals for 10 and above.
- Exception: use numerals before units ("3 MB", "2 seconds").
- Use numerals for version numbers ("version 2"), steps in a sequence, and all numbers
  in a series that includes 10+.

### Pronouns
- Use "they/them/their" as singular gender-neutral pronouns.
- Avoid gendered pronouns (he/she) unless referring to a specific person.

---

## 3. Punctuation

### Serial (Oxford) comma
- Always use a serial comma in lists of three or more.
- ✅ "Install Node.js, npm, and Doc Detective."
- ❌ "Install Node.js, npm and Doc Detective."

### Colons
- Use a colon to introduce a list, a code block, or a continuation of a sentence.
- Capitalize the first word after a colon only if it starts a complete sentence.

### Dashes
- Em dash (—): use for parenthetical asides, with no spaces on either side (preferred)
  or with spaces. Be consistent.
- En dash (–): use for ranges ("2–5 seconds", "pages 10–20"). Don't use a hyphen for
  ranges.
- Hyphen (-): use for compound modifiers ("open-source tool", "well-defined spec").

### Quotation marks
- Use double quotation marks for direct speech or quoted text.
- Use code font, not quotation marks, for technical strings, values, and terms used
  as themselves.

### Periods and end punctuation
- One space after a period.
- Use periods in complete sentences, including list items that are complete sentences.
- Don't use a period at the end of a heading.

---

## 4. Formatting and Organization

### Capitalization
- **Sentence case** for all headings and titles: capitalize only the first word and
  proper nouns.
  - ✅ "Getting started with Doc Detective"
  - ❌ "Getting Started With Doc Detective"
- Capitalize proper nouns: product names, brand names, specific features when they have
  an official name.
- Don't capitalize common nouns just because they seem important ("the Config file",
  "the Test Spec").

### Bold and italic
- **Bold**: use for UI element names (buttons, menus, labels), key terms on first
  introduction, and important warnings.
- *Italic*: use for introducing a new term, titles of books/documents, and variables
  in non-code contexts.
- Don't use bold or italic for general emphasis — restructure the sentence instead.

### Tables
- Use tables for structured reference data: parameter lists, comparison data.
- Every table must have a header row.
- Don't use a table when a list would be clearer.

### Notes and notices
Use the appropriate notice type:

- **Note**: supplementary information. ("Note: This setting is optional.")
- **Caution**: may cause problems if ignored.
- **Warning**: may cause data loss, security issues, or irreversible effects.
- **Tip**: helpful but non-essential suggestion.

---

## 5. Lists

### Numbered lists
- Use for sequential steps where order matters.
- Each item is a complete action.
- Don't use numbered lists for non-sequential content.

### Bulleted lists
- Use for unordered items, options, or features.
- Keep items parallel in grammatical structure.
- Use a period at the end of each item if it's a complete sentence; omit if it's a
  fragment. Be consistent within a list.

### Description lists (definition lists)
- Use for pairs of terms and their definitions/descriptions.
- Common in API reference docs.

### List length
- Avoid lists with only one item — use prose instead.
- Consider breaking very long lists (10+ items) into groups with sub-headings.

### Nesting
- Use nested lists sparingly. One level of nesting is usually enough.

---

## 6. Headings

- Use sentence case (see Formatting above).
- Make headings descriptive and specific — a reader skimming headings should
  understand the content.
- Don't use gerunds as headings ("Installing Doc Detective" → "Install Doc Detective").
  Use imperative form for task headings.
- Don't put a period at the end of a heading.
- Don't skip heading levels (don't jump from H2 to H4).
- Avoid "Overview" as a sole heading — use a more descriptive term.

---

## 7. Code and Technical Content

### Code font
Use `code font` (backticks in Markdown) for:
- All code, commands, and queries
- File names, directory names, and file paths
- Parameter names, property names, and attribute names
- Parameter values and return values
- Keyboard shortcuts
- Environment variables
- Anything the user types literally

Don't use code font for:
- Product names (Doc Detective, Node.js)
- Generic concepts ("a configuration file", "the test")

### Code blocks
- Use fenced code blocks (` ``` `) for multi-line code.
- Always include a language tag (` ```json `, ` ```bash `, ` ```markdown `, etc.).
- Code blocks should be complete, runnable examples wherever possible.
- Don't include `$` at the start of shell commands (it makes copy-paste harder), unless
  showing both the command and its output in the same block.

### Placeholders
- Format placeholders as `<placeholder-name>` in code font.
- Explain what to substitute for each placeholder.
- ✅ `npx doc-detective --input <test-spec-file>`

### Command-line syntax
- Use `--flag` (double dash) for long flags.
- Show the full command in examples, not aliases or abbreviations.

### API reference
- Method names, endpoints, and parameters: always in code font.
- Use consistent verbs for actions (see section 10).

---

## 8. Links and Cross-References

### Descriptive link text
- Link text should describe the destination, not the action of clicking.
- ✅ "See [Configure Doc Detective](link) for options."
- ❌ "Click [here](link) for options."
- ❌ "See [this page](link) for options."

### Bare URLs
- Don't use bare URLs in prose. Wrap in descriptive link text.
- Exception: when the URL itself is the point (e.g., "The API is available at
  `https://api.example.com`").

### Cross-references
- For internal links, use relative paths where possible.
- For links to external resources, confirm they're stable and authoritative.
- Avoid "above" and "below" for cross-references — they break when content is
  reorganized. Use the section title instead: "See [Install Doc Detective](#install)."

---

## 9. Images

- Every image must have alt text describing the content.
- Use high-resolution or vector images.
- Don't embed essential information only in images — also include it in text.
- Screenshots: capture only the relevant area. Keep them up to date.
- Avoid decorative images that add no information.

---

## 10. API Reference Docs

API reference content has its own conventions. These apply to Doc Detective's action
schemas, config options, and CLI flags.

### Required elements for each item
Every documented parameter, property, or option must include:
- **Description**: what it is and what it does
- **Type**: the data type (string, boolean, integer, object, array, enum)
- **Required or optional**
- **Default value** (if optional)
- **Allowed values** (for enums or constrained strings)
- **Example** (where helpful)

### Verb style for descriptions
- Describe what a property *does*, not what it *is*.
- ✅ "Specifies the URL to navigate to."
- ❌ "The URL to navigate to."
- For boolean properties: "If true, ..." or "When enabled, ..."

### Method/action descriptions
- Start with a verb in the present tense.
- ✅ "Navigates to the specified URL."
- ❌ "This action will navigate to the URL you specify."

---

## 11. Global Audience

- Avoid idioms ("hit the ground running", "ballpark figure").
- Avoid culture-specific references (holidays, sports, geography).
- Use unambiguous date formats: YYYY-MM-DD, or "January 15, 2025". Never "1/15/25".
- Avoid directional terms ("the left-hand side", "below") for UI — use element names.
- Write short sentences; they translate more accurately.
- Don't assume operating system. Say "your terminal" not "the Terminal app" unless
  specifically writing for macOS.

---

## 12. Common Word List (Selected)

This is a selection of terms most relevant to Doc Detective docs, drawn from the
Google developer documentation word list. When in doubt, consult the full word list at
https://developers.google.com/style/word-list.

| Term | Guidance |
|---|---|
| **app** vs **application** | Use "app" for end-user software. "Application" for API or enterprise contexts. |
| **boolean** | Lowercase when referring to the concept; code font and exact casing for language keywords (`true`, `false`). |
| **command line** (noun) | Two words as a noun. Hyphenate as adjective: "command-line tool". |
| **config** vs **configuration** | Both OK; "config" is more conversational. Be consistent. |
| **earlier / later** vs **lower / higher** | For version ranges: use "earlier" and "later", not "lower" and "higher". ✅ "version 2.0 or later" |
| **e.g.** | Prefer "for example" in prose. Use "e.g." only in parenthetical notes. Always follow with a comma: "e.g., `checkLink`". |
| **etc.** | Avoid. Specify what you mean, or add "and more". |
| **filename** | One word, lowercase. |
| **i.e.** | Prefer "that is" in prose. |
| **kill** | Avoid. Use "stop", "end", "cancel", or "exit". |
| **please** | Avoid in instructions. It's filler. |
| **simply / just / easily** | Avoid. They're condescending if the task is hard, and filler if it's easy. |
| **terminate** | Avoid. Use "stop" or "end". |
| **via** | Avoid in prose. Use "using", "through", or "by". |
| **we** | Avoid when addressing the reader. Use second person. |
| **whitelist / blacklist** | Avoid. Use "allowlist" / "denylist". |

---

*This reference was compiled from the Google Developer Documentation Style Guide
(https://developers.google.com/style), licensed under CC BY 4.0.*