// Windows CI freeze allowance (ADR 01105). Hosted windows-latest runners have
// episodic days where the whole test process freezes for up to ~52s, failing
// whichever test is running on its own timeout. The allowance adds a fixed
// cushion to every enforced timeout there, so a freeze no longer fails an
// innocent test, while a genuine hang still times out (later).

const WINDOWS_CI_ALLOWANCE_MS = 60000;

// DD_TEST_FREEZE_ALLOWANCE_MS overrides the default on any platform: "0"
// switches it off, any other non-negative number replaces it.
export function freezeAllowanceMs(platform, env) {
  const override = Number(env.DD_TEST_FREEZE_ALLOWANCE_MS);
  if (env.DD_TEST_FREEZE_ALLOWANCE_MS !== undefined && Number.isFinite(override) && override >= 0) {
    return override;
  }
  return platform === "win32" && env.CI === "true" ? WINDOWS_CI_ALLOWANCE_MS : 0;
}

// Mocha enforces a timeout only through the `timeout()` getter (the async
// timer and the post-hoc duration check both read it), so the allowance is
// added there and the declared value in `_timeout` stays untouched. `clone()`
// (retries) copies through that getter, so it is reset to the declared value,
// or each retry would stack another allowance.
export function installFreezeAllowance({ Runnable, Test }, allowanceMs) {
  if (!allowanceMs) return;
  const setTimeoutValue = Runnable.prototype.timeout;
  Runnable.prototype.timeout = function (ms) {
    if (arguments.length) return setTimeoutValue.apply(this, arguments);
    return this._timeout > 0 ? this._timeout + allowanceMs : this._timeout;
  };
  const clone = Test.prototype.clone;
  Test.prototype.clone = function () {
    const copy = clone.call(this);
    copy.timeout(this._timeout);
    return copy;
  };
}
