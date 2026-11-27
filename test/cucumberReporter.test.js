// The `cucumber` reporter writes Cucumber JSON (an array of features) from the
// same results object the `json` reporter serializes, for Xray, Allure, and
// other tools that ingest Cucumber runs. See adrs/01228-cucumber-reporter.md.

import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import sinon from "sinon";

import { buildCucumberJson, cucumberReporter } from "../dist/reporters/cucumberReporter.js";
import { reporters } from "../dist/utils.js";

describe("cucumber reporter", function () {
  let tmpDir;

  beforeEach(function () {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-cucumber-"));
  });

  afterEach(function () {
    sinon.restore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function run() {
    const runDir = path.join(tmpDir, ".doc-detective", "runs", "r1");
    const shot = "specs/guide/shots/click.png";
    const video = "specs/guide/recordings/linux-chrome.mp4";
    for (const file of [shot, video]) {
      fs.mkdirSync(path.dirname(path.join(runDir, file)), { recursive: true });
      fs.writeFileSync(path.join(runDir, file), "png-bytes");
    }
    return {
      runDir,
      shot,
      video,
      report: {
        runId: "r1",
        runDir,
        specs: [
          {
            specId: "guide",
            description: "The install guide",
            contentPath: "/docs/install.md",
            result: "FAIL",
            tests: [
              {
                testId: "install",
                description: "Install the CLI",
                result: "FAIL",
                contexts: [
                  {
                    contextId: "linux-chrome",
                    platform: "linux",
                    browser: { name: "chrome" },
                    result: "FAIL",
                    autoRecording: { result: "PASS", recordingPath: video },
                    steps: [
                      { stepId: "open", goTo: "https://example.com", result: "PASS", durationMs: 1500 },
                      {
                        stepId: "compare",
                        description: "Compare the hero",
                        screenshot: "hero.png",
                        result: "WARNING",
                        resultDescription: "It varied by 3%.",
                        durationMs: 20,
                      },
                      {
                        stepId: "click-save",
                        click: { selector: "#save" },
                        result: "FAIL",
                        resultDescription: "Couldn't find element `#save`.",
                        resultHint: "Check the selector.",
                        autoScreenshotPath: shot,
                        durationMs: 2,
                      },
                      { stepId: "next", runShell: { command: "echo hi" }, result: "SKIPPED", resultDescription: "Skipped: a prior step failed." },
                    ],
                  },
                ],
              },
            ],
          },
          {
            specId: "no-source",
            result: "PASS",
            tests: [
              {
                testId: "t",
                result: "PASS",
                contexts: [{ contextId: "c", platform: "mac", result: "PASS", steps: [{ stepId: "s", wait: 100, result: "PASS" }] }],
              },
            ],
          },
        ],
      },
    };
  }

  const stepsOf = (features, f = 0) => features[f].elements[0].steps;

  describe("buildCucumberJson()", function () {
    it("maps each spec to a feature with the required fields", function () {
      const features = buildCucumberJson(run().report);
      assert.equal(features.length, 2);
      const [feature, bare] = features;
      assert.equal(feature.uri, "/docs/install.md");
      assert.equal(feature.id, "guide");
      assert.equal(feature.name, "The install guide");
      assert.equal(feature.keyword, "Feature");
      assert.ok(Array.isArray(feature.elements));
      assert.equal(bare.uri, "no-source");
      assert.equal(bare.name, "no-source");
    });

    it("maps each test x context to a scenario", function () {
      const [feature, bare] = buildCucumberJson(run().report);
      const scenario = feature.elements[0];
      assert.equal(scenario.type, "scenario");
      assert.equal(scenario.keyword, "Scenario");
      assert.equal(scenario.id, "install;linux-chrome");
      assert.equal(scenario.name, "Install the CLI (chrome/linux)");
      assert.equal(bare.elements[0].name, "t (mac)");
    });

    it("maps PASS, FAIL, SKIPPED, and WARNING to Cucumber statuses", function () {
      const statuses = stepsOf(buildCucumberJson(run().report)).map((step) => step.result.status);
      assert.deepEqual(statuses, ["passed", "passed", "failed", "skipped"]);
    });

    it("gives every step the `* ` keyword and a name from its description or action", function () {
      const steps = stepsOf(buildCucumberJson(run().report));
      assert.ok(steps.every((step) => step.keyword === "* "));
      assert.deepEqual(
        steps.map((step) => step.name),
        ["goTo: https://example.com", "Compare the hero", "click: #save", "runShell: echo hi"]
      );
      assert.equal(stepsOf(buildCucumberJson(run().report), 1)[0].name, "wait: 100");
    });

    it("reports durations in nanoseconds", function () {
      const steps = stepsOf(buildCucumberJson(run().report));
      assert.equal(steps[0].result.duration, 1500000000);
      assert.equal(steps[2].result.duration, 2000000);
      assert.equal(steps[3].result.duration, 0);
    });

    it("keeps a warning step passing, with the warning in `output`", function () {
      const step = stepsOf(buildCucumberJson(run().report))[1];
      assert.equal(step.result.status, "passed");
      assert.deepEqual(step.output, ["It varied by 3%."]);
      assert.equal(step.result.error_message, undefined);
    });

    it("gives a failed step the description plus the hint as its error_message", function () {
      const step = stepsOf(buildCucumberJson(run().report))[2];
      assert.equal(step.result.error_message, "Couldn't find element `#save`.\nCheck the selector.");
      assert.equal(stepsOf(buildCucumberJson(run().report))[0].result.error_message, undefined);
    });

    it("embeds a step's screenshot as base64 PNG", function () {
      const step = stepsOf(buildCucumberJson(run().report))[2];
      assert.deepEqual(step.embeddings[0], {
        mime_type: "image/png",
        data: Buffer.from("png-bytes").toString("base64"),
      });
    });

    it("skips a screenshot whose file is missing, silently", function () {
      // The warning step names `hero.png` through its screenshot action, which isn't on disk.
      const step = stepsOf(buildCucumberJson(run().report))[1];
      assert.equal(step.embeddings, undefined);
    });

    it("embeds the context's recording path as text on the scenario's last step", function () {
      const { report, runDir, video } = run();
      const steps = stepsOf(buildCucumberJson(report));
      assert.deepEqual(steps.at(-1).embeddings, [
        { mime_type: "text/plain", data: Buffer.from(path.join(runDir, video)).toString("base64") },
      ]);
      assert.equal(steps[0].embeddings, undefined);
    });

    it("emits an empty array for an empty or null run", function () {
      assert.deepEqual(buildCucumberJson({ specs: [] }), []);
      assert.deepEqual(buildCucumberJson(null), []);
    });

    it("survives holes in tests, contexts, and steps", function () {
      const features = buildCucumberJson({
        specs: [null, { specId: "s", tests: [null, { testId: "t", contexts: [null, { result: "PASS", steps: [null] }] }] }],
      });
      assert.equal(features.length, 1);
      assert.equal(features[0].elements.length, 1);
      assert.deepEqual(features[0].elements[0].steps, []);
    });

    it("adds a failed step when the context failed but none of its steps did", function () {
      const context = {
        result: "FAIL",
        autoRecording: { result: "FAIL", resultDescription: "Couldn't save the recording." },
        steps: [{ stepId: "s", wait: 100, result: "PASS" }],
      };
      const steps = buildCucumberJson({ specs: [{ specId: "s", tests: [{ testId: "t", contexts: [context] }] }] })[0].elements[0].steps;
      assert.equal(steps.length, 2);
      assert.equal(steps[1].result.status, "failed");
      assert.equal(steps[1].result.error_message, "Couldn't save the recording.");
      // A context whose own steps carry the failure gets no extra step.
      assert.equal(stepsOf(buildCucumberJson(run().report)).filter((s) => s.result.status === "failed").length, 1);
    });

    it("embeds only PNG files as screenshots", function () {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-cucumber-"));
      fs.writeFileSync(path.join(dir, "secret.txt"), "not an image");
      const report = {
        runDir: dir,
        specs: [{ specId: "s", tests: [{ testId: "t", contexts: [{ result: "PASS", steps: [{ stepId: "x", result: "PASS", outputs: { screenshotPath: "secret.txt" } }] }] }] }],
      };
      assert.equal(buildCucumberJson(report)[0].elements[0].steps[0].embeddings, undefined);
      fs.rmSync(dir, { recursive: true, force: true });
    });
  });

  describe("writing", function () {
    it("writes cucumber.json into a directory output", async function () {
      sinon.stub(console, "error");
      const file = await cucumberReporter({}, tmpDir, run().report, {});
      assert.equal(file, path.join(tmpDir, "cucumber.json"));
      assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).length, 2);
    });

    it("writes beside a file output rather than inside it", async function () {
      sinon.stub(console, "error");
      const target = path.join(tmpDir, "results.json");
      assert.equal(await cucumberReporter({}, target, run().report, {}), path.join(tmpDir, "cucumber.json"));
      assert.equal(fs.existsSync(target), false);
    });

    it("returns null and names the path and cause when it can't write", async function () {
      const error = sinon.stub(console, "error");
      const blocked = path.join(tmpDir, "blocked");
      fs.writeFileSync(blocked, "not a directory");
      assert.equal(await cucumberReporter({}, path.join(blocked, "sub"), run().report, {}), null);
      assert.match(
        error.firstCall.args[0],
        /^Error: Couldn't write the Cucumber report to .*cucumber\.json: [a-z].*\.$/
      );
    });
  });

  describe("selection", function () {
    it("registers the reporter under its shorthand name", function () {
      assert.equal(typeof reporters.cucumberReporter, "function");
    });
  });
});
