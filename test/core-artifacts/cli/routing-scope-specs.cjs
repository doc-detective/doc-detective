// Writes the specs routing-scope.spec.json runs, one per routing shape (ADR
// 01168). Run from the repo root, as that spec's setup step does.
const fs = require("fs");

const dir = ".tmp/fixture-routing-scope";
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });

const echo = { runShell: "echo hi" };
// One echo step, with the handler on the step or on its test.
const step = (handler) => ({ tests: [{ steps: [{ ...echo, onFail: [handler] }] }] });
const test = (handler) => ({ tests: [{ steps: [echo], onFail: [handler] }] });

const specs = {
  // Routing the runner can't perform at that scope: exit 2.
  "step-stop-spec": step({ stop: "spec" }),
  "step-stop-run": step({ stop: "run" }),
  "step-goToTest": step({ goToTest: "t" }),
  "test-stop-run": test({ stop: "run" }),
  "test-retry": test({ retry: { limit: 1 } }),
  "test-goToStep": test({ goToStep: "s" }),
  // Routing it can perform: these run.
  "step-onSkip-retry": { tests: [{ steps: [echo, { wait: false, onSkip: [{ retry: { limit: 1 } }] }] }] },
  "test-stop-spec": { tests: [{ steps: [echo], onPass: [{ stop: "spec" }] }, { steps: [echo] }] },
};

for (const [name, spec] of Object.entries(specs)) {
  fs.writeFileSync(`${dir}/${name}.spec.json`, JSON.stringify(spec));
}
