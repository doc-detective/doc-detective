---
status: accepted
date: 2026-11-07
decision-makers: doc-detective maintainers
---

# Allow local URLs by default; block public-to-private hops

Amends [ADR 01010](01010-ssrf-guard-ipv4-mapped-ipv6.md).

## Context and Problem Statement

Local and private addresses are a core use case. Users test a docs site in a Docker container, a dev
server on `localhost`, or an API on a private network. Doc Detective had two guards that got this
backwards:

* `fetchFile` refused a screenshot reference image on any private, loopback or link-local address
  unless `DOC_DETECTIVE_ALLOW_LOCAL_URLS` was exactly `true`. A reference image on `localhost` failed
  with no setting.
* `@apidevtools/json-schema-ref-parser` runs its own `safeUrlResolver` by default. It refused every
  external HTTP `$ref` to a private address in an OpenAPI description, even from a local description.

Meanwhile, the guard missed the case it exists for. It checked only the first host, and axios then
followed up to 5 redirects. A public URL that redirected to `169.254.169.254` got through.

ADR 01010 also says the guard covers "`checkLink`/`httpRequest`-adjacent paths". It never did. Step
requests (`goTo`, `checkLink`, `httpRequest`, `waitUntil`) have always been unguarded.

## Decision Drivers

* Specs are code. The spec author chose every URL a step names, and `runShell` can reach any address
  anyway, so the guard isn't a sandbox.
* The guard can stop the runner from fetching an internal address that *content* chose. That's a
  redirect hop, or a `$ref` inside a third-party OpenAPI description. It's the classic SSRF
  pattern: a public document steering the runner to a private address.
* Hosted runners (such as Doc Detective Online) need a strict mode, alongside network egress rules.
* A repository's config must not be able to loosen an operator's choice.

## Considered Options

* **Allow local URLs by default; block only public-to-private hops**, with two env switches.
* **Keep refusing local addresses unless `DOC_DETECTIVE_ALLOW_LOCAL_URLS=true`**, and fix only the
  redirect bypass.
* **Remove the guard.**
* **Make the switches config keys** instead of environment variables.

## Decision Outcome

Chosen: **allow local URLs by default; block only public-to-private hops.**

Any URL a spec or config names directly may be local, private or public, with no setting. The guard
covers two fetches, screenshot reference images and OpenAPI `$ref` resolution, and refuses only a hop
from a public address to a private one:

* a redirect from a public host to a private, loopback or link-local address. The guarded fetch
  follows redirects by hand (up to 5) and checks each hop;
* an external HTTP `$ref` in a public OpenAPI document that points at a private address. That's a
  publicly hosted description, or any public document a `$ref` reaches, at any depth. Doc Detective
  turns off the parser's own `safeUrlResolver` and reads `$ref`s through the same guarded fetch.
  After it reads a public document, it records the `$ref`s inside it. A private read that one of
  those `$ref`s asked for is refused, and the message names that public document. A local
  description can still `$ref` a public document and a private one side by side.

A local document that redirects or refers to local addresses is fine. Step requests stay unguarded.

Two environment variables change the policy. Each one is on when set to `1`, `true`, `yes` or `on`,
in any case, ignoring surrounding whitespace.

| Variable | Effect |
|---|---|
| unset (default) | Direct local URLs are allowed. Public-to-private hops are blocked. |
| `DOC_DETECTIVE_ALLOW_LOCAL_URLS=1` | Public-to-private hops are allowed too, so the guard is off. |
| `DOC_DETECTIVE_BLOCK_LOCAL_URLS=1` | Strict mode: the guarded fetches refuse every private or loopback address, including direct ones. |

Setting both is a usage error. The CLI exits 2 before it reads config:
`Error: DOC_DETECTIVE_ALLOW_LOCAL_URLS and DOC_DETECTIVE_BLOCK_LOCAL_URLS can't both be set.`
Through the API, each guarded fetch fails with the same message.

A refused fetch fails the screenshot step, or the OpenAPI load, with a redacted URL and a hint:

```text
Couldn't follow the redirect from https://img.example.com/ref.png: it leads to 169.254.169.254, a private address, from a public one.
Hint: If you trust this redirect, set DOC_DETECTIVE_ALLOW_LOCAL_URLS=1.

Couldn't resolve $ref http://10.0.0.5/schema.json in https://api.example.com/openapi.yaml: a public document can't refer to a private address.
Hint: If you trust this document, set DOC_DETECTIVE_ALLOW_LOCAL_URLS=1, or download it and point descriptionPath at the local copy.

Couldn't fetch http://localhost:8080/ref.png: DOC_DETECTIVE_BLOCK_LOCAL_URLS refuses private and loopback addresses.
Hint: Unset DOC_DETECTIVE_BLOCK_LOCAL_URLS to allow local URLs.
```

The address classification from ADR 01010 is unchanged. `assertUrlHostIsPublic` becomes
`privateAddressOf`, which returns the private address a URL points at instead of throwing, so each
caller words its own message.

### Consequences

* Good: a reference image on `localhost` or in a Docker network works with no setting, and so does
  a local OpenAPI description with local `$ref`s.
* Good: the redirect bypass is closed, and a third-party OpenAPI description can't steer the runner
  to cloud metadata or an intranet service.
* Good: hosted runners get one switch for strict mode.
* Neutral: `DOC_DETECTIVE_ALLOW_LOCAL_URLS=true` keeps working, and now also accepts `1`, `yes` and
  `on`.
* Bad: a public URL that redirects to a private address now fails where it used to pass. That's the
  case the guard exists for, and the hint names the opt-out.
* Neutral: the parser reads each URL once. When a local description and a public document both
  `$ref` the same private URL, the public document's `$ref` wins and the read is refused.
* Neutral: DNS rebinding can still race the check, as before. Pinning the connection to the checked
  address would close that.

### Confirmation

[test/fetchFile-binary.test.js](../test/fetchFile-binary.test.js) runs a local server and injects DNS
answers so `public.example.test` looks public to the guard but connects locally. It asserts:

* a reference image on `127.0.0.1` loads with no setting;
* a public host's redirect to `127.0.0.1` fails with the redirect message, and loads with `ALLOW=1`;
* a local OpenAPI description with a local `$ref` loads, and a public one fails with the `$ref`
  message;
* a private `$ref` reached through a public document fails and names that document. A local
  description's sibling public and private `$ref`s still load;
* `BLOCK=1` refuses a direct local image, the switch grammar, and the both-set error and exit 2;
* `checkLink` and `httpRequest` to `127.0.0.1:8092` still pass, even with `BLOCK=1`.

The fixture [capture/screenshot-reference-local.spec.json](../test/core-artifacts/capture/screenshot-reference-local.spec.json)
compares against a reference served from the 8092 test server with no setting, and PASSes.

## Docs impact

Yes. Users who compare screenshots against a reference URL, load OpenAPI descriptions, or run Doc
Detective on a hosted runner see the change. Updated pages: `actions/screenshot.mdx`, the
visual-regression guide, the OpenAPI page, and a "Refuse local URLs on shared runners" section in
`ci/docker-and-headless.mdx` that documents both environment variables.

## Pros and Cons of the Options

### Allow local URLs by default; block only public-to-private hops

* Good: matches how people use Doc Detective, and still blocks the SSRF pattern.
* Good: strict mode for hosted runners.
* Bad: more code than a single host check (a manual redirect loop and a `$ref` reader).

### Keep refusing local addresses unless `ALLOW=true`

* Good: smallest change.
* Bad: keeps the opt-in for the common case, and the parser still blocks local `$ref`s.

### Remove the guard

* Good: no code.
* Bad: a third-party OpenAPI description or a redirect could steer the runner to internal services.

### Config keys instead of environment variables

* Good: one place for settings.
* Bad: a repository's own config could switch off an operator's control.
