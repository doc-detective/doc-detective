import path from "node:path";
import { setConfig as setCliConfig, loadProjectEnv, readStdinInputs, discoverConfigPath } from "../utils.js";
import { setConfig } from "../core/config.js";
import { detectTests } from "../core/detectTests.js";
import { diag } from "../cliOutput.js";

interface FileResult {
  path: string;
  valid: boolean;
  errors: string[];
}

// Find tests the way a run does, report which files hold invalid ones, and run
// nothing. Exit codes: 0 all valid, 1 any invalid, 2 none found (ADR 01206).
export async function validateHandler(args: any): Promise<void> {
  await loadProjectEnv(args);
  await readStdinInputs(args);
  const cliConfig = await setCliConfig({ configPath: discoverConfigPath(args), args });
  const config = await setConfig({ config: cliConfig, detectApps: false });
  // Strict, so detection records each invalid file without warning about it.
  Object.defineProperty(config, "_strictSpecs", { value: true, enumerable: false, configurable: true });
  const specs = (await detectTests({ config })) ?? [];

  const files = new Map<string, FileResult>();
  for (const spec of specs) {
    const file = path.resolve(spec.contentPath);
    if (!files.has(file)) files.set(file, { path: file, valid: true, errors: [] });
  }
  for (const { path: source, reason } of config._invalidSpecs ?? []) {
    const file = path.resolve(source);
    const entry = files.get(file) ?? { path: file, valid: false, errors: [] };
    entry.valid = false;
    entry.errors.push(...String(reason).split("\n").filter(Boolean));
    files.set(file, entry);
  }

  if (files.size === 0) {
    const inputs = [config.input].flat().map((input: string) => `\`${path.resolve(input)}\``).join(", ");
    diag(`Couldn't find tests in ${inputs}. Point at your docs with \`--input\`.`);
    process.exitCode = 2;
    return;
  }

  const results = [...files.values()];
  const invalid = results.filter((file) => !file.valid);
  if (args.json) {
    console.log(JSON.stringify({ valid: invalid.length === 0, files: results }, null, 2));
  } else {
    for (const file of invalid) {
      console.log(`Couldn't validate \`${file.path}\`.`);
      for (const error of file.errors) console.log(`  ${error}`);
    }
    console.log(`Checked ${results.length} ${results.length === 1 ? "file" : "files"}: ${results.length - invalid.length} valid, ${invalid.length} invalid.`);
  }
  process.exitCode = invalid.length ? 1 : 0;
}
