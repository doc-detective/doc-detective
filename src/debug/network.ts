// Proxy / npm network config collector for the diagnostic dump.
//
// The lazy installer shells out to `npm install` to fetch heavy deps and
// browsers (see src/runtime/heavyDeps.ts — `@puppeteer/browsers` even pulls
// `proxy-agent` so proxied downloads work). A misconfigured proxy or
// registry is the single most common silent install failure, so the dump
// always shows the relevant env vars.
//
// Every value goes through `redactValue`, which already flags
// userinfo-bearing URLs (`https://user:tok@registry`) and `*authToken`-style
// keys — so a registry or proxy with embedded credentials is redacted, not
// leaked into a pasted bug report.

import { redactValue } from "./redact.js";

export interface NetworkVar {
  name: string;
  value: string;
}

export interface NetworkConfig {
  variables: NetworkVar[];
}

// Proxy vars are conventionally set in either case; tools read both, so we
// surface whichever the user actually set.
const PROXY_KEYS = [
  "HTTP_PROXY",
  "http_proxy",
  "HTTPS_PROXY",
  "https_proxy",
  "NO_PROXY",
  "no_proxy",
  "ALL_PROXY",
  "all_proxy",
];

// Collect proxy + npm network env vars. Takes an explicit env map so the
// behavior is unit-testable without mutating the real process environment.
export function collectNetworkConfig(
  env: NodeJS.ProcessEnv = process.env
): NetworkConfig {
  const names = new Set<string>();
  for (const key of PROXY_KEYS) {
    if (typeof env[key] === "string") names.add(key);
  }
  // Sweep every npm_config_* var present (registry, proxy, strict-ssl,
  // cafile, per-registry _authToken, …). The prefix match is lowercased so
  // uppercase variants (NPM_CONFIG_*) are caught too; keys keep their original
  // casing, and redactValue/isSecretName are case-insensitive, so an
  // _authToken key still redacts. Redaction handles the auth ones.
  for (const key of Object.keys(env)) {
    if (key.toLowerCase().startsWith("npm_config_")) names.add(key);
  }
  const sorted = Array.from(names).sort();
  return {
    variables: sorted.map((name) => ({
      name,
      value: redactValue(name, env[name]),
    })),
  };
}
