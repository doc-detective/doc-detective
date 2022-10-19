const { log, timestamp } = require("./utils");
const uuid = require("uuid");
const nReadlines = require("n-readlines");
const path = require("path");
const { exit } = require("process");
const fs = require("fs");

exports.suggestTests = suggestTests;

function suggestTests(config, files) {
  let testCoverage = {
    files: [],
    errors: [],
  };

  // Loop through test files
  files.forEach((file) => {
    log(config, "debug", `file: ${file}`);
    fileJson = {
      file,
      coveredLines: [],
      uncoveredLines: [],
    };
    let inTest = false;
    let line;
    let lineNumber = 1;
    let inputFile = new nReadlines(file);
    let extension = path.extname(file);
    let fileType = config.fileTypes.find((fileType) =>
      fileType.extensions.includes(extension)
    );
    fileJson.fileType = fileType;

    if (typeof fileType === "undefined") {
      // Missing filetype options
      log(
        config,
        "debug",
        `Skipping ${file}. Specify options for the ${extension} extension in your config file.`
      );
      return;
    }

    let testStartStatementOpen = fileType.testStartStatementOpen;
    if (!testStartStatementOpen) {
      log(
        config,
        "warning",
        `Skipping ${file}. No 'testStartStatementOpen' value specified.`
      );
      return;
    }
    let testStartStatementClose = fileType.testStartStatementClose;
    if (!testStartStatementClose) {
      log(
        config,
        "warning",
        `Skipping ${file}. No 'testStartStatementClose' value specified.`
      );
      return;
    }
    let testIgnoreStatement = fileType.testIgnoreStatement;
    if (!testIgnoreStatement) {
      log(
        config,
        "warning",
        `Skipping ${file}. No 'testIgnoreStatement' value specified.`
      );
      return;
    }
    let testEndStatement = fileType.testEndStatement;
    if (!testEndStatement) {
      log(
        config,
        "warning",
        `Skipping ${file}. No 'testEndStatement' value specified.`
      );
      return;
    }
    let actionStatementOpen =
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
    let actionStatementClose =
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

    // Loop through lines
    while ((line = inputFile.next())) {
      let lineJson;
      let subStart;
      let subEnd;
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
        // Check if test is defined externally
        if (lineJson.file) {
          referencePath = path.resolve(path.dirname(file), lineJson.file);
          // Check to make sure file exists
          if (fs.existsSync(referencePath)) {
            if (lineJson.id) {
              remoteJson = require(referencePath);
              // Make sure test of matching ID exists in file
              idMatch = remoteJson.tests.find(
                (test) => test.id === lineJson.id
              );
              if (!idMatch) {
                // log error
                testCoverage.errors.push({
                  file,
                  lineNumber,
                  description: `Test with ID ${lineJson.id} missing from ${referencePath}.`,
                });
              }
            }
          } else {
            // log error
            testCoverage.errors.push({
              file,
              lineNumber,
              description: `Referenced file missing: ${referencePath}.`,
            });
          }
        }
      } else if (line.includes(testIgnoreStatement)) {
        inTest = true;
      } else if (line.includes(testEndStatement)) {
        inTest = false;
      }

      if (inTest) {
        fileJson.coveredLines.push(lineNumber);
      } else {
        fileJson.uncoveredLines.push(lineNumber);
      }

      lineNumber++;
    }
    testCoverage.files.push(fileJson);
  });
  return testCoverage;
}

function checkMarkupCoverage(config, testCoverage) {
  let markupCoverage = {
    name: "Doc Detective Content Coverage Report",
    timestamp: timestamp(),
    summary: {
      covered: 0,
      uncovered: 0,
    },
    files: [],
    errors: testCoverage.errors,
  };

  testCoverage.files.forEach((file) => {
    let fileJson = {
      file: file.file,
      covered: 0,
      uncovered: 0,
    };

    let extension = path.extname(file.file);
    let markup = file.fileType.markup;

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

    const fileBody = fs.readFileSync(file.file, {
      encoding: "utf8",
      flag: "r",
    });

    // Only keep marks that have a truthy (>0) length
    Object.keys(markup).forEach((mark) => {
      markup[mark].forEach((matcher) => {
      console.log(matcher);
        // Run a match
        regex = new RegExp(matcher, "g");
        matches = fileBody.match(regex);
        if (typeof markupCoverage.summary[mark] === "undefined") {
          markupCoverage.summary[mark] = {
            covered: 0,
            uncovered: 0,
          };
        }
        if (typeof fileJson[mark] === "undefined") {
          fileJson[mark] = {
            covered: 0,
            coveredLines: [],
            uncovered: 0,
            uncoveredLines: [],
            uncoveredMatches: [],
          };
        }
        if (matches != null) {
          matches.forEach((match) => {
            // Check for duplicates and handle lines separately
            matchEscaped = match.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
            start = 0;
            occuranceRegex = new RegExp(matchEscaped, "g");
            occurances = fileBody.match(occuranceRegex).length;
            for (i = 0; i < occurances; i++) {
              index = fileBody.slice(start).match(matchEscaped).index;
              line = fileBody
                .slice(0, start + index)
                .split(/\r\n|\r|\n/).length;
              start = start + index + 1;
              if (
                file.coveredLines.includes(line) &&
                !fileJson[mark].coveredLines.includes(line)
              ) {
                markupCoverage.summary.covered++;
                markupCoverage.summary[mark].covered++;
                fileJson[mark].coveredLines.push(line);
                fileJson.covered++;
                fileJson[mark].covered++;
              } else if (
                file.uncoveredLines.includes(line) &&
                !fileJson[mark].uncoveredLines.includes(line)
              ) {
                markupCoverage.summary.uncovered++;
                markupCoverage.summary[mark].uncovered++;
                fileJson[mark].uncoveredLines.push(line);
                fileJson.uncovered++;
                fileJson[mark].uncovered++;
                fileJson[mark].uncoveredMatches.push({ line, text: match });
              }
            }
          });
        }
      });
      delete fileJson[mark].coveredLines;
      delete fileJson[mark].uncoveredLines;

    });
    markupCoverage.files.push(fileJson);
  });

  return markupCoverage;
}
