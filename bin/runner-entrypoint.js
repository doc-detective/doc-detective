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
const LOG_BATCH_SIZE = 100;
const LOG_FLUSH_INTERVAL_MS = 1000;
// Per-line UTF-8 byte cap aligned with the platform's 64 KB validator.
// Anything longer is sliced into 60 KB chunks (4 KB headroom for
// non-ASCII expansion when the slice falls mid-codepoint).
const LOG_LINE_BYTE_LIMIT = 60 * 1024;

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

/**
 * Authenticated fetch against the platform API. Throws on non-2xx
 * (other than the explicitly-allowed status codes); returns the raw
 * Response so callers can choose to read JSON or treat as fire-and-forget.
 */
async function apiCall(method, url, token, body, allowedStatuses = []) {
	const headers = { authorization: `Bearer ${token}` };
	if (body !== undefined) headers['content-type'] = 'application/json';
	const res = await fetch(url, {
		method,
		headers,
		body: body === undefined ? undefined : JSON.stringify(body)
	});
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
		child.on('exit', (code, signal) => {
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
	let timer = null;

	function fireBatch(lines) {
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
			flushNow();
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
function buildEffectiveConfig(configSnapshot, source) {
	const effective = { ...(configSnapshot ?? {}) };
	effective.output = path.join(WORKSPACE_DIR, OUTPUT_SUBDIR);
	if (source.type === 'inline') {
		effective.input = path.join(WORKSPACE_DIR, SPECS_SUBDIR);
	}
	return effective;
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
	await mkdir(workspaceDir, { recursive: true });
	await mkdir(path.join(workspaceDir, OUTPUT_SUBDIR), { recursive: true });

	if (source.type === 'github') {
		// Validate path_prefix *before* the clone so a malformed value
		// fails fast without burning a network round-trip. Defense in
		// depth: the platform-side validator already constrains
		// path_prefix at project-create time, but a `../etc` would
		// still traverse out via path.join. path.resolve normalizes
		// ".." segments and treats absolute path_prefix as an
		// override; we reject anything that lands outside workspaceDir
		// (or equals it, which is the no-prefix base case).
		let cwd = workspaceDir;
		if (source.path_prefix && source.path_prefix.length > 0) {
			const resolved = path.resolve(workspaceDir, source.path_prefix);
			const wsWithSep = workspaceDir.endsWith(path.sep)
				? workspaceDir
				: workspaceDir + path.sep;
			if (resolved !== workspaceDir && !resolved.startsWith(wsWithSep)) {
				throw new Error(`path_prefix escapes workspace: ${source.path_prefix}`);
			}
			cwd = resolved;
		}

		// Shallow public clone. Auth-required GitHub repos are out of
		// scope here — the platform UI requires the user to point at a
		// public repo or commit secrets via the project secrets layer.
		const repoUrl = `https://github.com/${source.repo}.git`;
		const args = ['clone', '--depth=1', '--branch', source.ref, '--', repoUrl, workspaceDir];
		const code = await new Promise((resolve, reject) => {
			const child = spawn('git', args, {
				cwd: '/',
				env: process.env,
				stdio: ['ignore', 'inherit', 'inherit']
			});
			child.on('error', reject);
			child.on('exit', (c) => resolve(c ?? 1));
		});
		if (code !== 0) {
			throw new Error(`git clone failed (exit ${code}) for ${source.repo}@${source.ref}`);
		}
		return cwd;
	}

	if (source.type === 'inline') {
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
 * POST /finalize. Best-effort — the caller decides whether a failure
 * here propagates to the process exit code.
 */
async function postFinalize(apiBase, runId, token, body) {
	try {
		await apiCall('POST', `${apiBase}/api/runs/${encodeURIComponent(runId)}/finalize`, token, body);
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

	let canceledBySignal = false;
	process.on('SIGTERM', () => {
		canceledBySignal = true;
		localLog('info', 'SIGTERM received');
	});

	// Step 1: fetch spec.
	const { canceled, spec } = await fetchSpec(apiBase, runId, token);
	if (canceled) {
		localLog('info', 'run canceled before spec fetch (410); exiting cleanly');
		// Nothing to finalize — the row is already terminal on the server.
		return 0;
	}

	const source = spec.source_snapshot ?? { type: 'inline', specs: [] };
	const config = buildEffectiveConfig(spec.config_snapshot, source);
	const secrets = spec.secrets ?? {};

	const shipper = makeLogShipper(apiBase, runId, token);

	let cwd;
	try {
		cwd = await provisionWorkspace(source);
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
	const childEnv = {
		...process.env,
		...secrets,
		DOC_DETECTIVE_CONFIG: JSON.stringify(config)
	};
	// Don't leak our bearer token into the child's env — the runner
	// owns the platform conversation, not the test job.
	delete childEnv.DD_RUN_TOKEN;

	let exitCode;
	try {
		exitCode = await runChild('doc-detective', [], { cwd, env: childEnv }, (stream, line) =>
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
	main,
	makeLogShipper,
	postFinalize,
	provisionWorkspace,
	readRequiredEnv,
	sliceLogLine
};
