const { timestamp } = require("./utils");

exports.suggestTests = suggestTests;

const actionsForMarkup = {
  onscreenText: [{}],
  image: [{}],
  hyperlink: [{}],
  orderedList: [{}],
  unorderedList: [{}],
  codeInline: [{}],
  codeBlock: [{}],
  interction: [{}],
};

function suggestTests(config, markupCoverage) {
  let suggestions = {
    name: "Doc Detective Content Coverage Report",
    timestamp: timestamp(),
    summary: {
      covered: 0,
      uncovered: 0,
    },
    files: [],
    errors: markupCoverage.errors,
  };

  markupCoverage.files.forEach((file) => {
    fileJson = {
      covered: 0,
      uncovered: 0,
    };
    Object.keys(file.markup).forEach((mark) => {
      if (typeof report.summary[mark] === "undefined") {
        report.summary[mark] = {
          covered: 0,
          uncovered: 0,
        };
      }
      report.summary.covered =
        report.summary.covered + file.markup[mark].coveredLines.length;
      report.summary.uncovered =
        report.summary.uncovered + file.markup[mark].uncoveredLines.length;
      report.summary[mark].covered =
        report.summary[mark].covered + file.markup[mark].coveredLines.length;
      report.summary[mark].uncovered =
        report.summary[mark].uncovered +
        file.markup[mark].uncoveredLines.length;
      fileJson.covered =
        fileJson.covered + file.markup[mark].coveredLines.length;
      fileJson.uncovered =
        fileJson.uncovered + file.markup[mark].uncoveredLines.length;
      fileJson[mark] = {
        covered: file.markup[mark].coveredLines.length,
        uncovered: file.markup[mark].uncoveredLines.length,
        uncoveredMatches: file.markup[mark].uncoveredMatches,
      };
    });
    report.files.push(fileJson);
  });
  return suggestions;
}
