---
status: accepted
date: 2026-07-12
decision-makers: doc-detective maintainers (hawkeyexl)
---

# Configurable `shell` for runShell with a cross-platform `bash` default

## Context and Problem Statement

`runShell` (and `runCode`'s shell-based execution) spawned commands with Node's `shell: true`,
which resolves to `cmd.exe` on Windows and `/bin/sh` on POSIX. The same spec therefore ran under
three different shells depending on the host. `cmd.exe` in particular mangles nested quotes and
parentheses. That's the exact trap PR #572 documented, where a one-liner like
`node -e "console.log(...)"` breaks mid-argument on Windows only. Docs-as-tests specs are meant to
be portable; the shell they execute under should be a stable, author-visible contract, not a
platform accident.

## Decision Drivers

* One predictable default shell everywhere, so a spec written on macOS/Linux passes unmodified on
  Windows.
* Authors who genuinely want a Windows shell (cmd batch verification, PowerShell docs) must be able
  to opt in per step.
* Config-file users need a project-wide default without touching every step.
* Windows has no system bash. `System32\bash.exe` is the WSL launcher, a Linux VM, and never what a
  doc test means. So defaulting to bash requires provisioning one.
* Existing Windows specs written against `cmd.exe` semantics change behavior; the maintainer
  explicitly accepted shipping that as a **minor** release (`feat:`), not a major.

## Considered Options

* **A. Add a `shell` enum (`bash` | `cmd` | `powershell`) on runShell + a root-level config
  default, flip the default to `bash` everywhere, and lazy-install Git Bash on Windows** (chosen).
* **B. Keep platform defaults and only document the quoting trap** (the original PR #572
  approach).
* **C. Add the `shell` param but default to the current platform shells**, flipping to bash in a
  later major.
* **D. Accept arbitrary shell executable paths** in addition to the enum.

## Decision Outcome

Chosen option: **A**. It removes the whole class of platform-conditional quoting bugs,
rather than documenting around it (B). It avoids a confusing two-phase migration (C), and keeps the
validation surface and fixture matrix tractable, unlike D. Arbitrary paths can't be schema-validated
or permutation-tested, and can be added later without breaking the enum.

Contract details:

* **Precedence**: `step.runShell.shell` → `config.shell` → built-in `"bash"`. The step schema
  (`runShell_v3`) deliberately has **no default** for `shell`. runShell adopts AJV-defaulted step
  objects, so a step-schema default would always be injected, and would shadow the config level.
  Only `config_v3.shell` carries `default: "bash"`; the runtime resolver
  (`resolveShellName` in `src/core/utils.ts`) owns the final fallback.
* **Windows-only shells**: `cmd` resolves to `%ComSpec%`, `powershell` to `powershell.exe`; both
  FAIL the step with an actionable message on non-Windows hosts (gate with `runOn` instead).
* **bash on Windows** resolves in order. First the cache copy,
  `<cacheDir>/tools/git-bash/<version>/usr/bin/bash.exe`. Then an existing Git for Windows install,
  through `where.exe git` plus well-known locations; System32-rooted candidates are filtered out as
  the WSL launcher. Then a JIT **MinGit** download into the cache, pinned by version and sha256, at
  ~40 MB. Every
  candidate is verified by executing `--version` (present-but-broken binaries are quarantined and
  re-downloaded once), mirroring the browsers.ts verify-by-execution pattern. MinGit ships bash as
  `usr/bin/sh.exe` (argv[0] selects POSIX mode); the installer copies it to `bash.exe` so it runs
  as full bash. The download lives under `tools/`, outside `<cacheDir>/runtime`, so it can never
  interact with npm's arborist (the #501 prune hazard).
* **PATH for bare MinGit**: unlike full Git for Windows' `bin\bash.exe` wrapper, MinGit's bash does
  not put its own `usr/bin` on PATH, so `echo x | grep x` would die with `command not found`. The
  spawn layer (`shellSpawnEnv`) prepends the resolved bash binary's directory to the child's PATH.
  That's harmless for a full Git install, and it restores grep/sed/awk for the cache install.
* **All three spawn paths honor the resolved shell.** Those are the foreground pipe
  (`spawnCommand`), the background pipe (`spawnBackgroundCommand`), and the PTY path
  (`spawnPtyBackgroundCommand`). The PTY path also picks `-c` vs `/d /s /c`, and the arg-quoting
  dialect, from the shell.
* **runCode pins its interpreter shell** independently of the config default. `bash` scripts run
  through the bash shell. Other interpreters, python and node, pin the platform-native shell on
  Windows and bash elsewhere. This keeps runCode's contract, "run this code with its
  interpreter", stable under any config `shell`. It avoids PowerShell's inability to invoke a
  leading quoted path, since `"C:\...\bash.exe" script` is a string expression there. And it means a
  python- or node-only spec never forces a Git Bash install on a Git-less Windows host. The
  historical hard FAIL for `language: "bash"` on Windows is lifted. The interpreter resolves
  through the same Git Bash resolution, verified by execution, so the generic `--version` probe
  is skipped for it. Temp-script paths are normalized to forward slashes on Windows, since bash
  strips unquoted backslashes in the command string, and quoted when they contain spaces.
* **POSIX bash availability is probed**, memoized once per process. Bash-less minimal images, such
  as Alpine/BusyBox and debian-slim, get an actionable "install bash" error. That beats a swallowed
  spawn ENOENT surfacing as a cryptic exit-code failure. There is deliberately no silent
  `/bin/sh` fallback, which would reintroduce the shell-varies-by-host defect this ADR removes.
* **Windows bash resolution is memoized per cache dir**, with an existence re-check per hit. Only
  the first shell step pays the verify-by-execution spawns. `powershell` args in the PTY
  path are quoted with PowerShell's literal single-quote dialect, since double quotes interpolate
  `$` and backticks there. `startSurface` process descriptors thread the same resolved shell as
  `runShell.background`, keeping the "same launcher" contract. And 32-bit (ia32) hosts get an
  explicit unsupported-architecture error, instead of a doomed x64 download.
* **Provisioning surfaces**: `doc-detective install bash`, skipped off Windows. It's included in
  `install all` on Windows, and reported by `install status` as a `tool` row. The runner preflights
  it when `inferRuntimeNeeds` sees any shell-based step resolving to bash on win32.
* **Release**: shipped as a **minor** (`feat:`). The behavior change for existing Windows
  cmd-flavored specs, and the POSIX `/bin/sh` → `bash` move, is accepted deliberately. Affected
  specs opt back in with one `shell: cmd` field or a one-line config default, and the payoff is
  spec portability by default.

### Consequences

* Good: specs are portable across OSes by default; the PR #572 quoting trap disappears; POSIX-only
  fixture commands (`rm -f`, `||`, `$(...)`) now work on Windows.
* Good: bash is verified-by-execution everywhere it's resolved, so a corrupted install self-heals.
* Bad: existing Windows specs relying on cmd semantics (`%VAR%`, `dir`, cmd's `find`) need
  `shell: "cmd"` at the step or config level after upgrading. That's a deliberate, documented
  break in a minor release.
* Bad: the first bash-needing run on a Git-less Windows host pays a one-time ~40 MB MinGit
  download. MinGit's toolbox is a subset of full Git, with no `curl`, `seq`, or `sleep` binaries, so
  heavyweight shell scripts may still want Git for Windows installed.
* Neutral: `pwsh` (PowerShell Core) and arbitrary shell paths are deferred; the enum can grow
  without a breaking change.

### Confirmation

* Schema: positive/negative cases in `src/common/test/validate.test.js` (enum at both levels, no
  step-level default injection, config default `bash`).
* Resolution + spawn plumbing: `test/shell-resolution.test.js` (precedence, platform mapping,
  Windows-only guards, `shellSpawnEnv`, real spawn through an explicit shell).
* Windows bash asset: `test/runtime-windows-bash.test.js` (resolution order, System32 filtering,
  verify/repair, JIT install, concurrency dedupe, `installBash` reports).
* Need inference: `test/runtime-infer-needs.test.js` (`windowsBash` flag permutations).
* End-to-end: `test/core-core.test.js` has a "runShell shell selection" describe. The
  `test/core-artifacts/process/shell.spec.json` fixture covers the bash default, explicit bash, cmd,
  powershell, pipes-on-Windows, and runCode bash on Windows. All are PASS or SKIPPED on every
  fixture OS.

## Pros and Cons of the Options

### A. `shell` enum + bash default + lazy Git Bash (chosen)

* Good, because the executing shell becomes an explicit, portable, validated contract.
* Good, because Windows users get bash without manual setup (JIT install, self-repairing).
* Bad, because it changes behavior for cmd-reliant Windows specs in a minor release.

### B. Document the trap, keep platform defaults

* Good, because zero behavior change.
* Bad, because every cross-platform spec author keeps re-discovering cmd quoting; docs can't fix a
  portability defect.

### C. Param now, bash default later (two-phase)

* Good, because the default flip could ride a major.
* Bad, because the interim default stays platform-dependent (the actual bug), and two migrations
  cost users more than one.

### D. Arbitrary shell paths

* Good, because power users could pick zsh/fish/pwsh.
* Bad, because it can't be schema-constrained, multiplies the untestable permutation surface, and
  can be layered on later without breaking the enum.
