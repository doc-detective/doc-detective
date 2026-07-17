---
title: github-action
---

[`github-action`](https://github.com/doc-detective/github-action) is a TypeScript-based GitHub Action that runs Doc Detective in GitHub workflows. While Doc Detective can run in any CI/CD environment, this GitHub Action simplifies the process of running Doc Detective in GitHub workflows, provides a `results` object that can be used in subsequent steps, and offers handy features like creating GitHub issues for failed tests.

This repo depends on [`doc-detective`](doc-detective) for performing the tests.

## Issue notifications

The GitHub Action can automatically create GitHub issues when tests fail. Set `create_issue_on_fail` to `true` to enable this.

### Basic issue configuration

- `create_issue_on_fail`: Creates a GitHub issue when any test fails.
- `issue_title`: Title of the created issue. Default: `"Doc Detective Failure"`.
- `issue_body`: Body of the issue. Supports these variables:
  - `$RUN_URL`: URL of the workflow run that created the issue.
  - `$RESULTS`: Test results as a JSON code block.
  - `$PROMPT`: The prompt text (see below).
- `issue_labels`: Comma-separated list of labels to apply.
- `issue_assignees`: Comma-separated list of GitHub usernames to assign.

### AI integrations

Notify AI-powered integrations when issues are created to help investigate and fix failures faster. Use `integrations` to specify which integrations to notify.

- `integrations`: Comma-separated list of integrations to notify. Supported values:
  - `doc-sentinel`: Mentions @reem-sab
  - `promptless`: Mentions @Promptless with the prompt
  - `dosu`: Mentions @dosu with the prompt
  - `claude`: Mentions @claude with the prompt
  - `cursor`: Mentions @cursor with the prompt
  - `opencode`: Uses the `/opencode` command with the prompt
  - `copilot`: Auto-assigns the issue to Copilot (instead of adding to the accordion)
  
  Integrations (except `copilot`) appear in a collapsible "Integrations" section in the issue body. Invalid integration names are warned and ignored.

- `prompt`: Text passed to integrations, inserted where `$PROMPT` appears in integration mentions. You can also use `$PROMPT` in your custom `issue_body` template. Default: `"Investigate potential causes of the failures reported in this Doc Detective test output and suggest fixes."`.

### Example

```yaml
- uses: doc-detective/github-action@v1
  with:
    input: ./docs
    create_issue_on_fail: true
    integrations: claude,copilot
    prompt: "Analyze these test failures and suggest documentation fixes"
```
