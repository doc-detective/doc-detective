// Writes the specs and configs before-all.spec.json runs (ADR 01169). Run from
// the repo root, as that spec's setup step does.
const fs = require("fs");

const dir = ".tmp/fixture-before-all";
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });

const write = (name, value) => fs.writeFileSync(`${dir}/${name}`, JSON.stringify(value));

const spec = { tests: [{ steps: [{ runShell: "echo hi" }] }] };
write("setup.spec.json", spec);
write("main.spec.json", spec);

// One config per shape of the setting.
const base = { input: "main.spec.json", telemetry: { send: false } };
write("before-all-string.json", { ...base, beforeAll: "setup.spec.json" });
write("before-all-array.json", { ...base, beforeAll: ["setup.spec.json", "setup.spec.json"] });
write("before-any.json", { ...base, beforeAny: "setup.spec.json" });
write("both.json", { ...base, beforeAll: "setup.spec.json", beforeAny: "setup.spec.json" });
