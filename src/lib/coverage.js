const { log, timestamp } = require("./utils");
const uuid = require("uuid");
const nReadlines = require("n-readlines");
const path = require("path");
const { exit } = require("process");
const fs = require("fs");

exports.analyizeTestCoverage = analyizeTestCoverage;

function analyizeTestCoverage(config, files) {
  let json = {
    name: "Doc Detective Content Coverage Report",
    timestamp: timestamp(),
    summary: {
      files: 0,
      tests: 0,
      ignoreBlocks: 0,
    },
    files: [],
    errors: [],
  };

  // Loop through test files
  files.forEach((file) => {
    log(config, "debug", `file: ${file}`);
    fileJson = {
      file,
      percentCovered: 0,
      tests: 0,
      ignoreBlocks: 0,
    };
    let fileId = `${uuid.v4()}`;
    let id = fileId;
    let inTest = false;
    let line;
    let lineNumber = 1;
    let inputFile = new nReadlines(file);
    let extension = path.extname(file);
    let fileType = config.fileTypes.find((fileType) =>
      fileType.extensions.includes(extension)
    );

    if (typeof fileType === "undefined") {
      // Missing filetype options
      log(
        config,
        "debug",
        `Skipping ${file}. Specify options for the ${extension} extension in your config file.`
      );
      return;
    }

    json.summary.files++;
    let testStartStatementOpen;
    let testStartStatementClose;
    let testIgnoreStatement;
    let testEndStatement;
    let actionStatementOpen;
    let actionStatementClose;

    testStartStatementOpen = fileType.testStartStatementOpen;
    if (!testStartStatementOpen) {
      log(
        config,
        "warning",
        `Skipping ${file}. No 'testStartStatementOpen' value specified.`
      );
      return;
    }
    testStartStatementClose = fileType.testStartStatementClose;
    if (!testStartStatementClose) {
      log(
        config,
        "warning",
        `Skipping ${file}. No 'testStartStatementClose' value specified.`
      );
      return;
    }
    testIgnoreStatement = fileType.testIgnoreStatement;
    if (!testIgnoreStatement) {
      log(
        config,
        "warning",
        `Skipping ${file}. No 'testIgnoreStatement' value specified.`
      );
      return;
    }
    testEndStatement = fileType.testEndStatement;
    if (!testEndStatement) {
      log(
        config,
        "warning",
        `Skipping ${file}. No 'testEndStatement' value specified.`
      );
      return;
    }
    actionStatementOpen =
      fileType.actionStatementOpen ||
      fileType.openActionStatement ||
      fileType.openTestStatement;
    if (!actionStatementOpen) {
      log(
        config,
        "warning",
        `Skipping ${file}. No 'actionStatementOpen' value specified.`
      );
      return;
    }
    actionStatementClose =
      fileType.actionStatementClose ||
      fileType.closeActionStatement ||
      fileType.closeTestStatement;
    if (!actionStatementClose) {
      log(
        config,
        "warning",
        `Skipping ${file}. No 'actionStatementClose' value specified.`
      );
      return;
    }
    let markup = fileType.markup;

    // Only keep marks that have a truthy (>0) length
    Object.keys(markup).forEach((mark) => {
      if (markup[mark].length === 1 && markup[mark][0] === "") {
        log(
          config,
          "warning",
          `No regex for '${mark}'. Set 'fileType.markup.${mark}' for the '${extension}' extension in your config.`
        );
        delete markup[mark];
      }
    });

    // Loop through lines
    while ((line = inputFile.next())) {
      let lineJson;
      let subStart;
      let subEnd;
      let matches = [];
      const lineAscii = line.toString("ascii");

      if (line.includes(testStartStatementOpen)) {
        // Test start
        if (testStartStatementClose) {
          subEnd = lineAscii.lastIndexOf(testStartStatementClose);
        } else {
          subEnd = lineAscii.length;
        }
        subStart =
          lineAscii.indexOf(testStartStatementOpen) +
          testStartStatementOpen.length;
        lineJson = JSON.parse(lineAscii.substring(subStart, subEnd));
        // Set inTest to true
        inTest = true;
        // Increment Test statememt count
        json.summary.tests++;
        fileJson.tests++;
        // Check if test is defined externally
        if (lineJson.file) {
          referencePath = path.resolve(path.dirname(file), lineJson.file);
          // Check to make sure file exists
          if (fs.existsSync(referencePath)) {
            if (lineJson.id) {
              remoteJson = require(referencePath);
              // Make sure test of matching ID exists in file
              idMatch = remoteJson.tests.find(test => test.id === lineJson.id);
              if (!idMatch) {
                // log error
                json.errors.push({
                  file,
                  lineNumber,
                  description: `Test with ID ${lineJson.id} missing from ${referencePath}.`,
                });
              }
            }
          } else {
            // log error
            json.errors.push({
              file,
              lineNumber,
              description: `Referenced file missing: ${referencePath}.`,
            });
          }
        }
      } else if (line.includes(testIgnoreStatement)) {
        inTest = true;
        // Increment ignore statement count
        json.summary.ignoreBlocks++;
        fileJson.ignoreBlocks++;
      } else if (line.includes(testEndStatement)) {
        inTest = false;
        // Revert back to file-based ID
        id = fileId;
      } else {
        // Only keep marks that have a truthy (>0) length
        Object.keys(markup).forEach((mark) => {
          // Run a match
          matches = lineAscii.match(markup[mark]);
          // If result lengthis truthy (>0),
          if (matches != null) {
            if (typeof json.summary[mark] === "undefined") {
              json.summary[mark] = {
                found: 0,
                covered: 0,
                uncovered: 0,
              };
            }
            if (typeof fileJson[mark] === "undefined") {
              fileJson[mark] = {
                found: 0,
                covered: 0,
                uncovered: 0,
                uncoveredMatches: [],
              };
            }
            //// increment specific values
            json.summary[mark].found++;
            fileJson[mark].found++;
            if (inTest) {
              json.summary[mark].covered++;
              fileJson[mark].covered++;
            } else {
              json.summary[mark].uncovered++;
              fileJson[mark].uncovered++;
              fileJson[mark].uncoveredMatches.push({
                line: lineNumber,
                matches,
              });
            }
          }
        });
      }
      lineNumber++;
    }
    json.files.push(fileJson);
  });
  return json;
}
