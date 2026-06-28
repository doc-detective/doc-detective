# Doc Detective Samples - Agent Reference

Technical reference for AI agents working with Doc Detective test samples.

## Directory Purpose

Demonstrates Doc Detective test formats and patterns. Use these samples to understand test structure, action syntax, and integration approaches.

## Test Format Classification

### 1. Standalone Specifications (JSON/YAML)

Direct test files consumed by the test runner.

**Structure:**
```json
{
  "tests": [
    {
      "id": "optional-identifier",
      "steps": [
        { "action": "actionName", ...actionParams }
      ]
    }
  ]
}
```

**Files:**
- `tests.spec.json` - Multi-action reference implementation
- `kitten-search.spec.json` - Minimal browser test pattern
- `docker-hello.spec.json` - Shell execution pattern (uses `runShell.stdio` for output validation)
- `http.spec.yaml` - API testing with variable interpolation (`$VARIABLE`, `$$response.body.path`)

### 2. Inline Tests (Markdown with Embedded Tests)

Test steps embedded in markdown comments. Content remains human-readable while tests are machine-executable.

**Detection Patterns (from `.doc-detective.json`):**
- `[comment]: # (step <JSON>)` - Single step
- `[comment]: # (test ...)` ... `[comment]: # (test end)` - Test block
- `<!-- step <JSON> -->` - HTML comment syntax
- `{/* step <JSON> */}` - JSX comment syntax

**Files:**
- `kitten-search-inline.md` - Steps in procedure format
- `doc-content-inline-tests.md` - Explicit test specifications with `detectSteps: false`
- `local-gui.md` - GUI interaction pattern with screenshot marker (`{ .screenshot }`)

### 3. Markup Detection (Auto-Generated Tests)

Natural language patterns in documentation automatically converted to test actions via regex rules in config.

**Key Patterns (from `.doc-detective.json`):**
- `**bold text**` → `find` action (verify element exists)
- `Click **Button**` / `Select **Option**` → `click` action
- `Go to [Link](url)` → `goTo` action
- `[Link text](url)` → `checkLink` action (validates HTTP status)
- `press Enter` → `type` action with `$ENTER$` key
- `type "text"` → `type` action
- `![Alt](path.png){ .screenshot }` → `screenshot` action

**Files:**
- `kitten-search-detect.md` - Uses natural language prose
- `doc-content-detect.md` - Markdown hyperlinks and formatting drive tests

## Configuration Schema

`.doc-detective.json` defines:

- **`runOn`** - Test contexts (platforms, browsers, headless mode)
- **`fileTypes`** - File extensions and test detection rules
  - **`inlineStatements`** - Regex for test delimiters
  - **`markup`** - Natural language → action mappings
- Test detection order: inline statements → markup rules → no detection

## Action Reference

**Navigation:** `goTo`, `checkLink`  
**Interaction:** `find`, `click`, `type`, `typeKeys`  
**Validation:** `find` (implicit), `httpRequest.responseData`  
**System:** `runShell`, `httpRequest`, `setVariables`, `loadVariables`  
**Recording:** `saveScreenshot`, `screenshot`, `startRecording`, `stopRecording`  
**Flow Control:** `wait`

## Key Implementation Details

1. **Variable Syntax:**
   - Environment: `$VAR` (from `.env` files)
   - Response extraction: `$$response.body.field`

2. **Special Keys:** Enclosed in `$`, e.g., `$ENTER$`, `$ESCAPE$`

3. **Screenshots:** Path-based (`saveScreenshot`/`screenshot`) or markup-triggered (`{ .screenshot }`)

4. **Test Detection Modes:**
   - `detectSteps: true` (default) - Use markup rules
   - `detectSteps: false` - Require explicit step comments

5. **Selectors:** CSS selectors (e.g., `#id`, `[attribute="value"]`, `.class`)

## Documentation Links

- [Config schema](https://doc-detective.com/docs/references/schemas/config.html)
- [Test structure](https://doc-detective.com/docs/get-started/tests)
- [Action reference](https://doc-detective.com/docs/get-started/intro)

## Suggested Usage

1. **New test suites:** Start with `kitten-search.spec.json` pattern
2. **Documentation testing:** Use `doc-content-detect.md` pattern with markup detection
3. **API testing:** Follow `http.spec.yaml` variable and response validation patterns
4. **Complex workflows:** Reference `tests.spec.json` for multi-action sequences
