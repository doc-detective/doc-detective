#!/usr/bin/env node
// @ts-check
/**
 * Doc Detective platform runner entrypoint.
 *
 * The doc-detective.com platform launches Fly.io machines that boot
 * this script as PID 1. The script orchestrates a single run end-to-end:
 *
 *   1. read DD_RUN_TOKEN / DD_API_BASE / DD_RUN_ID from env
 *   2. GET  {api}/api/runs/{id}/spec  → fetch config + source + secrets
 *   3. provision /workspace from the source_snapshot (github clone or
 *      inline-spec write-out)
 *   4. spawn the local `doc-detective` CLI with the merged config in
 *      DOC_DETECTIVE_CONFIG and project secrets in env
 *   5. tee child stdout/stderr to the platform via batched
 *      POST /api/runs/{id}/logs
 *   6. POST /api/runs/{id}/finalize { status, exit_code, summary }
 *
 * Belt-and-suspenders: a process-level setTimeout fires
 * `process.exit(124)` at DD_TIMEOUT_SECONDS so a runner that loses
 * connectivity to the API still self-terminates. The platform watchdog
 * is the authoritative timeout — this is just a local guard.
 *
 * SIGTERM (Fly destroy on user-cancel or watchdog stop): best-effort
 * POST a `canceled` finalize, then exit. The server is the source of
 * truth — finalize on SIGTERM is advisory.
 *
 * Artifact upload (saveScreenshot, recordVideo, html report, …) is
 * deliberately out of scope for this iteration; the entrypoint
 * finalizes with an empty artifacts list. A follow-up will walk
 * config.output and POST signed-upload requests.
 *
 * No third-party deps — only Node built-ins. The image already ships
 * doc-detective globally; we don't add to its install footprint.
 */

import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const WORKSPACE_DIR = '/workspace';
const SPECS_SUBDIR = 'specs';
const OUTPUT_SUBDIR = 'output';

/**
 * Project-secret keys that would clobber container-level env or
 * fundamentally alter how Node / the doc-detective CLI executes if
 * the platform let them through. The platform's secret-key validator
 * only constrains key shape (`/^[A-Za-z_][A-Za-z0-9_]*$/`), so a user
 * could create a secret named `PATH` or `NODE_OPTIONS` and have it
 * override the container's value once we spread `secrets` into
 * `childEnv`. Defense in depth: filter here at injection time and log
 * the rejection so the run's logs make the source of the discrepancy
 * obvious. The platform should also reject these names server-side;
 * this list is the runner-side backstop.
 */
const SECRET_DENYLIST = new Set([
	'PATH',
	'HOME',
	'NODE_OPTIONS',
	'NODE_PATH',
	'LD_PRELOAD',
	'LD_LIBRARY_PATH',
	'DOC_DETECTIVE_CONFIG',
	'DOC_DETECTIVE_API',
	'DOC_DETECTIVE_META'
]);
const LOG_BATCH_SIZE = 100;
const LOG_FLUSH_INTERVAL_MS = 1000;
// Per-line UTF-8 byte cap aligned with the platform's 64 KB validator.
// Anything longer is sliced into 60 KB chunks (4 KB headroom for
// non-ASCII expansion when the slice falls mid-codepoint).
const LOG_LINE_BYTE_LIMIT = 60 * 1024;
// Cap on concurrently-pending /logs POSTs. With LOG_BATCH_SIZE=100 and
// LOG_LINE_BYTE_LIMIT=60 KB, each pending batch retains ~6 MB. 8
// pending = ~48 MB worst case — bounded enough to stay well under
// any realistic Fly machine memory cap even when the platform API
// stalls. Past the cap we load-shed: drop the new batch with a warn
// log rather than backpressure (which would block the synchronous
// `add()` callers — the child process's stdout/stderr `data`
// handlers — and surface as a runaway memory accumulation in the
// stream's internal buffer instead).
const LOG_MAX_PENDING_BATCHES = 8;

/**
 * Tiny structured logger — writes a JSON line to the *real* stderr so
 * it lands in Fly's machine logs even when our own log forwarder is
 * down. Distinct from the captured-and-forwarded child stdout/stderr.
 */
function localLog(level, msg, extra) {
	const line = { ts: new Date().toISOString(), level, msg, ...(extra ?? {}) };
	process.stderr.write(JSON.stringify(line) + '\n');
}

function readRequiredEnv(name) {
	const v = process.env[name];
	if (!v || v.length === 0) {
		throw new Error(`Missing required env var: ${name}`);
	}
	return v;
}

/** Default per-call fetch budget. The platform watchdog is the
 * authoritative timeout for the run as a whole; this just keeps a
 * single hung request from holding everything else hostage. */
const API_CALL_TIMEOUT_MS = 30_000;
/** Slightly longer budget for /finalize so it has a chance to land
 * even when the platform is under load — finalize is the
 * acknowledgment that lets the row leave its terminal-but-stuck
 * state on time, so it gets priority over /logs. */
const API_FINALIZE_TIMEOUT_MS = 60_000;

/**
 * Authenticated fetch against the platform API. Throws on non-2xx
 * (other than the explicitly-allowed status codes); returns the raw
 * Response so callers can choose to read JSON or treat as fire-and-forget.
 *
 * `timeoutMs` aborts the request if the platform blackholes (TCP
 * accept, no response). Without it a hung POST holds the runner open
 * until the global self-kill fires (default 30 minutes). Defaults to
 * 30s; finalize callers pass a longer budget.
 */
async function apiCall(method, url, token, body, allowedStatuses = [], timeoutMs = API_CALL_TIMEOUT_MS) {
	const headers = { authorization: `Bearer ${token}` };
	if (body !== undefined) headers['content-type'] = 'application/json';
	let res;
	try {
		res = await fetch(url, {
			method,
			headers,
			body: body === undefined ? undefined : JSON.stringify(body),
			signal: AbortSignal.timeout(timeoutMs)
		});
	} catch (e) {
		// AbortSignal.timeout fires a TimeoutError; surface that with the
		// URL + budget so logs make the cause obvious.
		if (e && e.name === 'TimeoutError') {
			throw new Error(`${method} ${url} timed out after ${timeoutMs}ms`);
		}
		throw e;
	}
	if (!res.ok && !allowedStatuses.includes(res.status)) {
		const text = await res.text().catch(() => '');
		throw new Error(`${method} ${url} failed: ${res.status} ${res.statusText} ${text}`);
	}
	return res;
}

/**
 * Fetch the spec from the platform. The handler returns 410 Gone if
 * the run was canceled before the runner first connected — we treat
 * that as a clean no-op exit. Anything else 4xx/5xx is fatal.
 */
async function fetchSpec(apiBase, runId, token) {
	const url = `${apiBase}/api/runs/${encodeURIComponent(runId)}/spec`;
	const res = await apiCall('GET', url, token, undefined, [410]);
	if (res.status === 410) {
		return { canceled: true };
	}
	const spec = await res.json();
	return { canceled: false, spec };
}

/**
 * Run a child process to completion, returning its exit code. Stdout
 * and stderr are streamed to `onLine(stream, payload)`.
 */
function runChild(cmd, args, opts, onLine) {
	return new Promise((resolve, reject) => {
		const child = spawn(cmd, args, {
			cwd: opts.cwd,
			env: opts.env,
			// Parent receives stdout/stderr as pipes so we can intercept;
			// stdin is /dev/null since doc-detective doesn't read from it.
			stdio: ['ignore', 'pipe', 'pipe']
		});

		// Track a SIGTERM handler that forwards the signal so cancel
		// propagates to the child instead of orphaning it.
		const forwardTerm = () => {
			try {
				child.kill('SIGTERM');
			} catch {
				// child may have already exited
			}
		};
		process.on('SIGTERM', forwardTerm);

		const lineBuffer = { stdout: '', stderr: '' };
		function attach(stream, name) {
			stream.setEncoding('utf8');
			stream.on('data', (chunk) => {
				lineBuffer[name] += chunk;
				let idx;
				while ((idx = lineBuffer[name].indexOf('\n')) !== -1) {
					const line = lineBuffer[name].slice(0, idx);
					lineBuffer[name] = lineBuffer[name].slice(idx + 1);
					if (line.length > 0) onLine(name, line);
				}
			});
			stream.on('end', () => {
				if (lineBuffer[name].length > 0) {
					onLine(name, lineBuffer[name]);
					lineBuffer[name] = '';
				}
			});
		}
		attach(child.stdout, 'stdout');
		attach(child.stderr, 'stderr');

		child.on('error', (err) => {
			process.off('SIGTERM', forwardTerm);
			reject(err);
		});
		// `'close'`, not `'exit'`: 'exit' fires as soon as the child
		// process terminates, but stdout/stderr's 'end' events come
		// later. The trailing-line flush in attach() runs from those
		// 'end' handlers, so resolving on 'exit' could let runChild's
		// caller proceed before onLine had been invoked for the
		// residual buffer of a child that wrote a partial last line.
		// 'close' fires only after both the process has exited AND
		// the stdio streams have closed.
		child.on('close', (code, signal) => {
			process.off('SIGTERM', forwardTerm);
			// Node's exit-code conventions: when terminated by signal, code
			// is null and the canonical exit is 128 + signal-number. We
			// don't map every signal — SIGTERM (15) is the one we forward.
			if (code !== null) resolve(code);
			else if (signal === 'SIGTERM') resolve(143);
			else resolve(1);
		});
	});
}

/**
 * Slice an oversize line into chunks at LOG_LINE_BYTE_LIMIT bytes so
 * the platform's 64 KB-per-line cap doesn't bounce the whole batch.
 */
function sliceLogLine(payload) {
	const enc = new TextEncoder();
	const dec = new TextDecoder('utf-8');
	const bytes = enc.encode(payload);
	if (bytes.byteLength <= LOG_LINE_BYTE_LIMIT) return [payload];
	const out = [];
	for (let i = 0; i < bytes.byteLength; i += LOG_LINE_BYTE_LIMIT) {
		// Slice on byte boundaries. TextDecoder's default `stream: false`
		// replaces incomplete multi-byte sequences at the slice edge
		// with U+FFFD — the fragment is *not* stitched back together
		// from the next slice. Acceptable for log preservation: the
		// platform accepts the data as opaque text, and rare
		// multi-byte boundaries on a 60 KB cliff are noise compared
		// to the value of preserving the rest of the line.
		const slice = bytes.subarray(i, Math.min(i + LOG_LINE_BYTE_LIMIT, bytes.byteLength));
		out.push(dec.decode(slice));
	}
	return out;
}

/**
 * Buffered log shipper. Lines accumulate in memory; we flush when the
 * batch hits LOG_BATCH_SIZE or LOG_FLUSH_INTERVAL_MS elapses, whichever
 * comes first.
 *
 * `add()` is synchronous (callers don't await per-line work); when a
 * batch trips LOG_BATCH_SIZE the POST fires-and-forgets but the
 * promise lands in the `pending` set so `flush()` is a true
 * "everything is posted" gate. Without that, callers awaiting
 * `flush()` after an auto-flush could see an empty buffer and resolve
 * before the in-flight POST completed — losing logs at finalize time.
 */
function makeLogShipper(apiBase, runId, token) {
	const buffer = [];
	const pending = new Set();
	let dropped = 0;
	let timer = null;

	function fireBatch(lines) {
		// Load-shed: if too many POSTs are already in flight (platform
		// API blackholing, slow network), drop the new batch and bump
		// a counter. Without this cap, `add()` continues to enqueue
		// indefinitely and pending grows unbounded — each retained
		// batch holds ~6 MB so a sustained outage OOM-kills the
		// machine. The lost log lines are noted in localLog (Fly
		// machine log) and a single summary stderr breadcrumb so the
		// run's own log stream tells the user something went missing.
		if (pending.size >= LOG_MAX_PENDING_BATCHES) {
			if (dropped === 0) {
				// First-drop breadcrumb. Subsequent drops are silent on
				// stderr (lest we DOS the run's own log stream), but
				// each one bumps the counter for finalize-time visibility.
				try {
					process.stderr.write(
						`runner: /logs backlog at cap (${LOG_MAX_PENDING_BATCHES} pending); dropping batches until pressure clears\n`
					);
				} catch {
					// stderr write can throw if the stream is gone; harmless.
				}
			}
			dropped += lines.length;
			localLog('warn', 'log batch shed under backpressure', {
				pending: pending.size,
				droppedSoFar: dropped
			});
			return Promise.resolve();
		}
		const p = (async () => {
			try {
				await apiCall(
					'POST',
					`${apiBase}/api/runs/${encodeURIComponent(runId)}/logs`,
					token,
					{ lines }
				);
			} catch (e) {
				// Don't fail the run for transient log-ship failures. The
				// run remains correct from the user's perspective; logs may
				// be incomplete. Surface to the local stderr so the Fly
				// machine log captures the drop.
				localLog('warn', 'log ship failed', { err: String(e) });
			} finally {
				pending.delete(p);
			}
		})();
		pending.add(p);
		return p;
	}

	async function flushNow() {
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
		if (buffer.length > 0) {
			fireBatch(buffer.splice(0, buffer.length));
		}
		// Wait for *all* in-flight POSTs (this batch's plus any that were
		// fired by an earlier auto-flush). allSettled because individual
		// failures are already swallowed inside fireBatch — no rejection
		// can escape — but allSettled is the principled choice if that
		// ever changes.
		if (pending.size > 0) {
			await Promise.allSettled(Array.from(pending));
		}
	}

	function schedule() {
		if (timer) return;
		timer = setTimeout(() => {
			timer = null;
			// Errors are swallowed inside fireBatch and flushNow uses
			// allSettled, so no rejection should escape today; the
			// .catch is a belt-and-suspenders against future changes
			// that might let one through and silently terminate the
			// process with an unhandledRejection.
			flushNow().catch((e) =>
				localLog('warn', 'scheduled flush rejected', { err: String(e) })
			);
		}, LOG_FLUSH_INTERVAL_MS);
	}

	return {
		add(stream, payload) {
			const ts = new Date().toISOString();
			for (const slice of sliceLogLine(payload)) {
				buffer.push({ ts, stream, payload: slice });
				if (buffer.length >= LOG_BATCH_SIZE) {
					// Auto-flush — but keep iterating: an oversize line that
					// produced N slices must still get its remaining N-1
					// slices into the next batch. An earlier draft of this
					// function `return`ed here and silently dropped the
					// tail.
					fireBatch(buffer.splice(0, buffer.length));
				}
			}
			// Only schedule a timed flush if there's actually something
			// to flush — guards against a wasted setTimeout cycle when
			// the loop's last slice was the one that auto-flushed.
			if (buffer.length > 0) schedule();
		},
		flush: flushNow
	};
}

/**
 * Build the effective config_v3 to pass via DOC_DETECTIVE_CONFIG.
 *
 * Platform-controlled overrides (clobber whatever the user committed):
 *   * `output` → /workspace/output (predictable artifact root for the
 *     planned upload step + keeps the user's relative paths from
 *     escaping the workspace)
 *   * `input`  → /workspace/specs (only for inline specs; for github
 *     sources we leave the user's `input` alone so their committed
 *     paths resolve from the cloned repo cwd)
 */
function buildEffectiveConfig(configSnapshot, source, workspaceDir = WORKSPACE_DIR) {
	const effective = { ...(configSnapshot ?? {}) };
	// posix.join: these paths land inside DOC_DETECTIVE_CONFIG and are
	// interpreted by the doc-detective CLI inside the Linux container.
	// Plain path.join would emit backslashes on Windows test runners
	// and break the equality assertions, even though no Windows
	// runtime ever sees this string.
	//
	// `workspaceDir` matches the path provisionWorkspace materialized
	// to. main() resolves it once from DD_WORKSPACE_DIR and threads
	// it through both functions so the CLI's view of the filesystem
	// can't drift from where the runner actually wrote specs/output.
	effective.output = path.posix.join(workspaceDir, OUTPUT_SUBDIR);
	if (source.type === 'inline') {
		effective.input = path.posix.join(workspaceDir, SPECS_SUBDIR);
	}
	return effective;
}

/**
 * Resolve `pathPrefix` against `workspaceDir` and reject values that
 * traverse out of the workspace (e.g. "../etc"). Pure — no fs / spawn
 * — so it's directly unit-testable without invoking git.
 *
 * Defense in depth: the platform-side validator already constrains
 * path_prefix at project-create time, but a `../etc` would still
 * traverse via path.join. path.resolve normalizes ".." segments and
 * treats absolute path_prefix as an override; we reject anything
 * that lands outside workspaceDir (or equals it, which is the
 * no-prefix base case).
 *
 * Returns the resolved path on success; throws on traversal.
 */
function resolvePathPrefix(workspaceDir, pathPrefix) {
	if (!pathPrefix || pathPrefix.length === 0) return workspaceDir;
	const resolved = path.resolve(workspaceDir, pathPrefix);
	const wsWithSep = workspaceDir.endsWith(path.sep)
		? workspaceDir
		: workspaceDir + path.sep;
	if (resolved !== workspaceDir && !resolved.startsWith(wsWithSep)) {
		throw new Error(`path_prefix escapes workspace: ${pathPrefix}`);
	}
	return resolved;
}

/**
 * Provision the workspace dir based on source_snapshot. Returns the
 * cwd the doc-detective CLI should run from.
 *
 * `workspaceDir` defaults to /workspace (the in-container path). Tests
 * pass a tmpdir so they don't touch the real /workspace.
 */
async function provisionWorkspace(source, workspaceDir = WORKSPACE_DIR) {
	// Wipe any prior state — the machine is fresh, but a retry of this
	// script (e.g. a runner-internal restart) would otherwise inherit
	// stale clones.
	await rm(workspaceDir, { recursive: true, force: true });

	if (source.type === 'github') {
		// Required-field guards so a regression in the platform's spec
		// shape surfaces as a clear error in run logs instead of an
		// inscrutable `git clone --branch undefined` failure.
		if (typeof source.repo !== 'string' || source.repo.length === 0) {
			throw new Error('github source missing required field: repo');
		}
		if (typeof source.ref !== 'string' || source.ref.length === 0) {
			throw new Error('github source missing required field: ref');
		}

		// Validate path_prefix *before* the clone so a malformed value
		// fails fast without burning a network round-trip.
		const cwd = resolvePathPrefix(workspaceDir, source.path_prefix);

		// Shallow public clone. Auth-required GitHub repos are out of
		// scope here — the platform UI requires the user to point at a
		// public repo or commit secrets via the project secrets layer.
		// The destination must NOT exist or must be empty for git clone
		// to succeed; we only `rm` above and let git create the
		// directory itself, then create the output subdir post-clone.
		// Pre-creating workspaceDir + output/ would cause clone to
		// fail with "destination path already exists and is not an
		// empty directory."
		const parent = path.dirname(workspaceDir);
		await mkdir(parent, { recursive: true });
		const repoUrl = `https://github.com/${source.repo}.git`;
		const args = ['clone', '--depth=1', '--branch', source.ref, '--', repoUrl, workspaceDir];
		const code = await new Promise((resolve, reject) => {
			const child = spawn('git', args, {
				cwd: parent,
				env: process.env,
				stdio: ['ignore', 'inherit', 'inherit']
			});
			child.on('error', reject);
			child.on('exit', (c) => resolve(c ?? 1));
		});
		if (code !== 0) {
			throw new Error(`git clone failed (exit ${code}) for ${source.repo}@${source.ref}`);
		}
		await mkdir(path.join(workspaceDir, OUTPUT_SUBDIR), { recursive: true });
		return cwd;
	}

	if (source.type === 'inline') {
		await mkdir(workspaceDir, { recursive: true });
		await mkdir(path.join(workspaceDir, OUTPUT_SUBDIR), { recursive: true });
		const specsDir = path.join(workspaceDir, SPECS_SUBDIR);
		await mkdir(specsDir, { recursive: true });
		const specs = Array.isArray(source.specs) ? source.specs : [];
		for (let i = 0; i < specs.length; i++) {
			const file = path.join(specsDir, `spec-${String(i).padStart(4, '0')}.json`);
			await writeFile(file, JSON.stringify(specs[i], null, 2), 'utf8');
		}
		return workspaceDir;
	}

	throw new Error(`Unsupported source type: ${String(/** @type {any} */ (source).type)}`);
}

/**
 * Drop project secrets whose key collides with a container-controlled
 * env var. `onReject` is invoked once per dropped key — callers use it
 * to surface the rejection in the run logs so the user can correct
 * their project secrets.
 */
function filterSecrets(secrets, onReject) {
	const out = {};
	for (const [k, v] of Object.entries(secrets)) {
		if (SECRET_DENYLIST.has(k)) {
			if (onReject) onReject(k);
			continue;
		}
		out[k] = v;
	}
	return out;
}

/**
 * POST /finalize. Best-effort — the caller decides whether a failure
 * here propagates to the process exit code.
 */
async function postFinalize(apiBase, runId, token, body) {
	try {
		await apiCall(
			'POST',
			`${apiBase}/api/runs/${encodeURIComponent(runId)}/finalize`,
			token,
			body,
			[],
			API_FINALIZE_TIMEOUT_MS
		);
		return true;
	} catch (e) {
		localLog('warn', 'finalize failed', { err: String(e) });
		return false;
	}
}

async function main() {
	const apiBase = readRequiredEnv('DD_API_BASE').replace(/\/+$/, '');
	const runId = readRequiredEnv('DD_RUN_ID');
	const token = readRequiredEnv('DD_RUN_TOKEN');
	// Reject NaN / non-finite / non-positive values so a bad
	// DD_TIMEOUT_SECONDS env (e.g. an unset-but-quoted-empty-string,
	// or a typo) doesn't fire setTimeout(NaN) — which fires
	// immediately and self-kills the runner before /spec lands.
	const rawTimeout = Number(process.env.DD_TIMEOUT_SECONDS);
	const timeoutSeconds = Number.isFinite(rawTimeout) && rawTimeout > 0 ? rawTimeout : 1800;

	// Belt-and-suspenders self-kill. Authoritative timeout is the
	// platform watchdog; this just guarantees a runner that has lost
	// API connectivity stops burning compute eventually.
	const selfKill = setTimeout(() => {
		localLog('warn', 'self-kill timeout exceeded', { timeoutSeconds });
		process.exit(124);
	}, timeoutSeconds * 1000);
	// .unref() — the timer alone shouldn't keep the event loop alive.
	selfKill.unref();

	// Track the currently-armed self-kill timer so we can disarm it on every
	// exit path. The watchdog exists only to bound a *hung* run; once main()
	// returns there is nothing left to bound, so the timer must be cleared.
	// If we don't, an in-process caller (e.g. the test suite, which calls
	// `await main()` directly) leaves an unref'd `process.exit(124)` pending.
	// It's unref'd so it won't keep the loop alive on its own, but if the
	// host process is still alive when it fires, it kills the whole process.
	// The re-arm path below repoints this reference at the replacement timer.
	let activeSelfKill = selfKill;
	try {

	let canceledBySignal = false;
	let childRunning = false;
	const onPreSpawnSigterm = async () => {
		canceledBySignal = true;
		localLog('info', 'SIGTERM received before child spawn; posting advisory cancel');
		// Best-effort early-cancel finalize. The platform watchdog +
		// cancel handler are still source of truth — this just helps
		// the row land at `canceled` faster when SIGTERM arrives
		// during fetchSpec / provisionWorkspace, before the child has
		// even started. Once the child is running, runChild's own
		// SIGTERM handler takes over and the post-spawn cleanup path
		// covers finalize.
		if (childRunning) return;
		await postFinalize(apiBase, runId, token, {
			status: 'canceled',
			exit_code: 143,
			summary: { reason: 'sigterm_pre_spawn' }
		});
		// Re-check after the await: main() may have raced past the
		// process.off + childRunning=true sequence while we were on
		// the network. Calling process.exit(143) at that point would
		// orphan the just-spawned child. Yield to runChild's
		// forwardTerm + post-spawn finalize instead.
		if (childRunning) return;
		process.exit(143);
	};
	process.on('SIGTERM', onPreSpawnSigterm);

	// Step 1: fetch spec.
	const { canceled, spec } = await fetchSpec(apiBase, runId, token);
	if (canceled) {
		localLog('info', 'run canceled before spec fetch (410); exiting cleanly');
		// Nothing to finalize — the row is already terminal on the server.
		return 0;
	}

	// `DD_WORKSPACE_DIR` is a test/ops seam — defaults to /workspace
	// (the in-container path). Tests redirect this to a tmpdir so
	// they don't touch the real /workspace; an operator could
	// redirect to a per-machine spool dir. Resolved once and
	// threaded through provisionWorkspace + buildEffectiveConfig so
	// the CLI's view can't drift from where we materialized files.
	const workspaceDir = process.env.DD_WORKSPACE_DIR || WORKSPACE_DIR;

	const source = spec.source_snapshot ?? { type: 'inline', specs: [] };
	const config = buildEffectiveConfig(spec.config_snapshot, source, workspaceDir);
	const secrets = spec.secrets ?? {};

	// The spec is the source of truth for everything else (config,
	// source, secrets) — it should win for timeout too. Prefer the
	// spec value, fall back to the env timeout we already set up
	// (kept as a bootstrap so the pre-spec self-kill is non-NaN).
	// Reset the self-kill timer to the spec's value so a project that
	// asked for 60s isn't held open until the 1800s default fires.
	const specTimeout = Number(spec.timeout_seconds);
	if (Number.isFinite(specTimeout) && specTimeout > 0 && specTimeout !== timeoutSeconds) {
		clearTimeout(selfKill);
		const respec = setTimeout(() => {
			localLog('warn', 'self-kill timeout exceeded', { timeoutSeconds: specTimeout });
			process.exit(124);
		}, specTimeout * 1000);
		respec.unref();
		// Repoint the tracked reference so the finally below clears the
		// timer that's actually armed, not the original (already-cleared) one.
		activeSelfKill = respec;
	}

	const shipper = makeLogShipper(apiBase, runId, token);

	let cwd;
	try {
		cwd = await provisionWorkspace(source, workspaceDir);
	} catch (e) {
		localLog('error', 'workspace provision failed', { err: String(e) });
		shipper.add('stderr', `workspace provision failed: ${String(e)}`);
		await shipper.flush();
		await postFinalize(apiBase, runId, token, {
			status: 'failed',
			exit_code: 1,
			summary: { reason: 'workspace_provision_failed', error: String(e) }
		});
		return 1;
	}

	// Step 2: spawn doc-detective.
	const safeSecrets = filterSecrets(secrets, (key) =>
		shipper.add('stderr', `runner: dropping reserved env var "${key}" from project secrets`)
	);
	const childEnv = {
		...process.env,
		...safeSecrets,
		DOC_DETECTIVE_CONFIG: JSON.stringify(config)
	};
	// Don't leak our bearer token into the child's env — the runner
	// owns the platform conversation, not the test job. DD_RUN_ID and
	// DD_API_BASE stay in the child's env intentionally: they're
	// non-sensitive identifiers and a future doc-detective release
	// may want them for diagnostics or reporter hooks.
	delete childEnv.DD_RUN_TOKEN;

	// `DD_RUNNER_CMD` is a test/ops seam — defaults to the canonical
	// `doc-detective` binary, but tests override it to a fixture
	// script and a future ops scenario could point it at a different
	// CLI installation path. Not advertised; the runner's contract
	// with users is `doc-detective`.
	const runnerCmd = process.env.DD_RUNNER_CMD || 'doc-detective';

	// Hand off SIGTERM ownership to runChild — its forwarder kills the
	// child process; the post-spawn finalize logic below handles the
	// advisory POST. Without removing the pre-spawn handler, both
	// would fire and we'd race two finalize POSTs.
	process.off('SIGTERM', onPreSpawnSigterm);
	childRunning = true;

	let exitCode;
	try {
		exitCode = await runChild(runnerCmd, [], { cwd, env: childEnv }, (stream, line) =>
			shipper.add(stream, line)
		);
	} catch (e) {
		localLog('error', 'child spawn failed', { err: String(e) });
		shipper.add('stderr', `failed to spawn doc-detective: ${String(e)}`);
		await shipper.flush();
		await postFinalize(apiBase, runId, token, {
			status: 'failed',
			exit_code: 1,
			summary: { reason: 'spawn_failed', error: String(e) }
		});
		return 1;
	}

	// Drain any buffered logs before finalizing — the finalize handler
	// deletes the run_token, so a late /logs POST after finalize 401s.
	await shipper.flush();

	// Map exit code → finalize status. SIGTERM (143) signals cancel;
	// the watchdog or cancel handler is the source of truth, but our
	// best-effort POST helps the row land at `canceled` faster.
	let finalizeBody;
	if (canceledBySignal || exitCode === 143) {
		finalizeBody = {
			status: 'canceled',
			exit_code: exitCode,
			summary: { reason: 'sigterm' }
		};
	} else if (exitCode === 0) {
		finalizeBody = { status: 'succeeded', exit_code: 0, summary: {} };
	} else {
		finalizeBody = {
			status: 'failed',
			exit_code: exitCode,
			summary: { reason: 'nonzero_exit' }
		};
	}
	await postFinalize(apiBase, runId, token, finalizeBody);
	return exitCode;

	} finally {
		// Disarm the self-kill watchdog on every exit path (normal return or
		// throw). main() has finished, so the run is no longer "hung" — there's
		// nothing left for the watchdog to bound. Leaving it armed would let a
		// pending process.exit(124) fire later inside any still-alive host
		// process (notably the in-process test runner). Clearing here keeps
		// production behavior identical: when run as a script the process exits
		// immediately after main() resolves anyway.
		clearTimeout(activeSelfKill);
	}
}

// Module-import guard so the test file can `import` from this module
// without triggering main(). Node's `import.meta.url === ...` idiom
// for "am I the entrypoint?" — works under both `node` and `tsx` and
// doesn't require require.main.
const isEntry = import.meta.url === `file://${process.argv[1]}`;
if (isEntry) {
	main()
		.then((code) => process.exit(code))
		.catch((err) => {
			localLog('fatal', 'entrypoint crashed', { err: String(err?.stack ?? err) });
			process.exit(1);
		});
}

export {
	apiCall,
	buildEffectiveConfig,
	fetchSpec,
	filterSecrets,
	main,
	makeLogShipper,
	postFinalize,
	provisionWorkspace,
	readRequiredEnv,
	resolvePathPrefix,
	runChild,
	SECRET_DENYLIST,
	sliceLogLine
};
