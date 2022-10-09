exports.analyizeTestCoverage = analyizeTestCoverage;

function analyizeTestCoverage(config, files) {
  let json = { tests: [] };

  // Loop through test files
  files.forEach((file) => {
    log(config, "debug", `file: ${file}`);
    let fileId = `${uuid.v4()}`;
    let id = fileId;
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

    let testStartStatementOpen;
    let testStartStatementClose;
    let testEndStatement;
    let actionStatementOpen;
    let actionStatementClose;
    let onscreenText;
    let image;
    let hyperlink;
    let orderedList;
    let unorderedList;
    let codeInline;
    let codeBlock;
    let interactions;

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
    onscreenText = fileType.markup.onscreenText;
    image = fileType.markup.image;
    hyperlink = fileType.markup.hyperlink;
    orderedList = fileType.markup.orderedList;
    unorderedList = fileType.markup.unorderedList;
    codeInline = fileType.markup.codeInline;
    codeBlock = fileType.markup.codeBlock;
    interactions = fileType.markup.interactions;

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
        // If test is defined in this file instead of referencing a test defined in another file
        if (!lineJson.file) {
          test = { id, file, actions: [] };
          if (lineJson.id) {
            test.id = lineJson.id;
            // Set ID for following actions
            id = lineJson.id;
          }
          if (lineJson.saveFailedTestRecordings)
            test.saveFailedTestRecordings = lineJson.saveFailedTestRecordings;
          if (lineJson.failedTestDirectory)
            test.failedTestDirectory = lineJson.failedTestDirectory;
          json.tests.push(test);
        }
      } else if (line.includes(testEndStatement)) {
        // Revert back to file-based ID
        id = fileId;
      } else if (line.includes(actionStatementOpen)) {
        if (actionStatementClose) {
          subEnd = lineAscii.lastIndexOf(actionStatementClose);
        } else {
          subEnd = lineAscii.length;
        }
        subStart =
          linaeAscii.indexOf(actionStatementOpen) + actionStatementOpen.length;
        lineJson = JSON.parse(lineAscii.substring(subStart, subEnd));
        if (!lineJson.testId) {
          lineJson.testId = id;
        }
        let test = json.tests.find((item) => item.id === lineJson.testId);
        if (!test) {
          json.tests.push({ id: lineJson.testId, file, actions: [] });
          test = json.tests.find((item) => item.id === lineJson.testId);
        }
        delete lineJson.testId;
        lineJson.line = lineNumber;
        test.actions.push(lineJson);
      }
      lineNumber++;
    }
  });
  return json;
}
