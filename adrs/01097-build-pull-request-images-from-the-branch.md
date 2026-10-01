---
status: accepted
date: 2026-09-04
decision-makers: doc-detective maintainers
---

# Build pull-request container images from the branch, not the registry

## Context and Problem Statement

Both container images install doc-detective from npm:

```dockerfile
RUN npm install -g doc-detective@$PACKAGE_VERSION
```

`PACKAGE_VERSION` comes from `inputs.version || 'latest'`, and a pull-request run of the "Docker
build" workflow supplies no version. So a PR build installs **the last published release**. It then
runs the container smoke test against it. The workflow's `paths:` filter (`src/container/**`)
implies the gate exists to review container changes. What it actually tests is the published package
wearing the PR's Dockerfile.

[ADR 01096](01096-never-execute-a-foreign-architecture-driver-binary.md) made the cost concrete. The
`build-linux (arm64)` leg failed on every run because of a runtime defect. That defect only
reproduces inside the image on arm64 hardware. The fix lives in `src/runtime` and `src/core`, code
that reaches the image only through the npm package. So the PR carrying the fix could not turn its
own gate green. The leg would have stayed red through review and merge. It would have gone green
only after semantic-release published the fix and the release chain rebuilt the image. A gate that
can't be satisfied by the change that satisfies it teaches reviewers to ignore it.

How should a pull-request build get the code under review into the image?

## Decision Drivers

* A gate should test the change under review. This one is the only place doc-detective runs inside
  its own published container, on both architectures.
* Release builds must not change. They install a specific published version by design. That is the
  artifact being shipped, and it must keep coming from the registry.
* The fixture matrix already solved the equivalent problem for the runner, in
  [ADR 01022](01022-parallel-feature-fixture-jobs.md). Build the PR, `npm link` it, and drive the
  action with an empty `version`, so `npx doc-detective` resolves the local build. The container
  gate should follow that precedent rather than invent a different story.
* A partial mechanism is worse than none. If a locally staged package can linger, a release build
  could silently ship someone's working tree.

## Considered Options

* **A. Stage a locally packed tarball into the Docker build context; the Dockerfiles prefer it when
  present** (chosen).
* **B. Publish a prerelease to npm per PR** and build the image from that version.
* **C. Build the package inside the Dockerfile.** `COPY` the repo in and compile it there.
* **D. Leave it, and verify container-affecting fixes after release.**

## Decision Outcome

Chosen option: **A**.

`src/container/scripts/localPackage.cjs` stages a tarball into `src/container/.local-package/`, a
directory inside the Docker build context. Both Dockerfiles `COPY` that directory and install from
the tarball when it holds one, falling back to `npm install -g doc-detective@$PACKAGE_VERSION`
otherwise. `scripts/build.cjs` gains `--local-package=<tarball>`; the `build-linux` and
`build-windows` jobs run `npm pack` and pass it **only on `pull_request`**.

Two properties make the mechanism safe rather than merely convenient, and both are enforced in code
and pinned by tests:

* **The directory always exists.** `COPY .local-package/ …` fails outright on a missing source, so a
  registry-only build would break without it. A committed `.gitkeep` covers a fresh checkout;
  `ensureLocalPackageDir` covers everything else.
* **A build not asked for a local package clears it.** Otherwise a tarball left from an earlier
  local build keeps overriding the registry install silently. That means an image labelled version X
  running a stale working tree. `stageLocalPackage` also clears before copying, so two tarballs can never make
  `npm install -g /tmp/local-package/*.tgz` pick one arbitrarily.

B would give the truest fidelity, with the PR's artifact installed exactly as a user would. But it
pollutes the public registry with a version per PR. It also needs publish credentials on fork PRs,
and couples a review gate to release infrastructure. C changes what the image *is*. The published
image installs a published package. Building from source inside it would mean the thing we test is
no longer the thing we ship. It would also drag the toolchain into a runtime image. D is the status
quo this ADR exists to end.

### Consequences

* Good: a PR that fixes a defect reproducible only inside the image can prove the fix on both
  architectures, on the PR, before merge. That is what makes ADR 01096 verifiable.
* Good: release and `workflow_dispatch` builds are untouched. They still install the published
  version from the registry, which is the artifact being shipped.
* Good: the mechanism is symmetric across `linux.Dockerfile` and `windows.Dockerfile`, so the Windows
  leg doesn't quietly remain a published-package test.
* Bad (accepted): PR builds get slower. Each job runs `npm run build` plus `npm pack`. The
  `.local-package/` COPY layer also invalidates the install layer on every PR build, so that layer
  is never cached. Correctness of the gate is worth the minutes.
* Bad (accepted): the PR image installs the branch's package, but resolves its **dependencies**
  from the registry as usual. So a PR that changes a dependency range is tested against whatever npm
  resolves at build time. That matches how a user's install behaves, so it is a fidelity limit
  rather than a flaw.
* Neutral: the workflow's `pull_request` trigger still filters on `src/container/**`, so a PR that
  changes only `src/runtime` does not build an image at all. This ADR makes the gate honest when it
  runs. Widening *when* it runs is a separate cost and coverage decision, meaning three image builds
  on every PR. That is deliberately not taken here.

### Confirmation

* **Red→green unit tests** in `test/container-local-package.test.js`. The staging directory name is
  a contract with the Dockerfiles, and `ensureLocalPackageDir` is idempotent. Staging replaces
  tarballs rather than accumulating them. `clearLocalPackage` empties the directory but keeps it, so
  a registry build stays a registry build. A missing file and a non-`.tgz` file are rejected.
* **Local end-to-end**: `npm pack` followed by
  `npm run container:build -- --version=latest --local-package=<tarball>` produces an image whose
  installed doc-detective is the packed tree. The build log's
  `[build] installing the locally packed …` line confirms it, as does running the container smoke
  test against it.
* **CI**: the `build-linux` and `build-windows` legs of a pull request report packing the branch
  and installing the local tarball. The `build-linux (ubuntu-24.04-arm, linux/arm64, arm64)` leg
  passes with ADR 01096's fix in the tree.

No Doc Detective feature fixture accompanies this change. It alters how CI builds an image, and
adds no user-facing surface. That means no step type, action option, config or CLI flag, engine, or
output format.

## Pros and Cons of the Options

### A. Stage a locally packed tarball

* Good: the PR gate tests the PR; release builds are byte-for-byte unchanged.
* Good: mirrors the fixture matrix's existing "build the PR, use it instead of the registry" shape.
* Bad: two Dockerfiles now carry a conditional install. A staging directory has to exist in git and
  be clearable, and getting that wrong could ship a stale tree. That is why it is unit-tested.

### B. Publish a prerelease per PR

* Good: highest fidelity, the exact published-install path.
* Bad: registry pollution, publish credentials on PRs (impossible for forks), and a review gate that
  depends on release infrastructure.

### C. Build the package inside the Dockerfile

* Good: no staging step, no build-context choreography.
* Bad: the image would stop being "a published package installed", diverging from what ships; it
  drags build toolchain into a runtime image and inflates it.

### D. Leave it

* Good: no change, no added build time.
* Bad: a container-affecting fix cannot be verified before it is released. That is exactly the gap
  that made the arm64 failure survive multiple releases.
