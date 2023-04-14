const { setArgs, setConfig } = require("../src/utils");

// Test that arguments are parsed correctly
test("yargs parses arguments correctly", () => {
  const argSets = [
    {
      args: ["node", "runTests.js", "--input", "input.spec.json"],
      expected: { i: "input.spec.json" },
    },
    {
      args: [
        "node",
        "runTests.js",
        "--input",
        "input.spec.json",
        "--logLevel",
        "debug",
      ],
      expected: { i: "input.spec.json", l: "debug" },
    },
    {
      args: [
        "node",
        "runTests.js",
        "--input",
        "input.spec.json",
        "--logLevel",
        "debug",
        "--config",
        "config.json",
      ],

      expected: { i: "input.spec.json", l: "debug", c: "config.json" },
    },
    {
      args: [
        "node",
        "runTests.js",
        "--input",
        "input.spec.json",
        "--output",
        ".",
        "--logLevel",
        "debug",
        "--config",
        "config.json",
      ],
      expected: { i: "input.spec.json", o: ".", l: "debug", c: "config.json" },
    },
    {
      args: [
        "node",
        "runTests.js",
        "--input",
        "input.spec.json",
        "--output",
        ".",
        "--logLevel",
        "debug",
        "--config",
        "config.json",
        "--recursive",
        "false",
        "--setup",
        "setup.spec.json",
        "--cleanup",
        "cleanup.spec.json",
      ],
      expected: { i: "input.spec.json", o: ".", l: "debug", c: "config.json", r: "false", setup: "setup.spec.json", cleanup: "cleanup.spec.json" },
    },
  ];
  argSets.forEach((argSet) => {
    expect(setArgs(argSet.args)).toMatchObject(argSet.expected);
  });
});
