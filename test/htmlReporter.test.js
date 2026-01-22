const { outputResults } = require("../src/utils");
const path = require("path");
const fs = require("fs");

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

describe("HTML Reporter tests", function () {
  const inputResultsPath = path.resolve("./test/test-results.json");
  const testResults = require(inputResultsPath);

  // Test that HTML file is created
  it("HTML reporter creates an HTML file", async function () {
    const outputDir = path.resolve("./test");
    const outputFilePath = path.resolve(outputDir, "test-results.html");

    // Clean up any existing file
    if (fs.existsSync(outputFilePath)) {
      fs.unlinkSync(outputFilePath);
    }

    // Output results using the HTML reporter
    await outputResults(null, outputFilePath, testResults, {
      reporters: ["html"],
    });

    // Check that output file exists
    expect(fs.existsSync(outputFilePath)).to.equal(true);

    // Clean up
    fs.unlinkSync(outputFilePath);
  });

  // Test that HTML file is self-contained (has inline styles)
  it("HTML reporter creates a self-contained HTML file with inline styles", async function () {
    const outputDir = path.resolve("./test");
    const outputFilePath = path.resolve(outputDir, "test-results-styles.html");

    // Clean up any existing file
    if (fs.existsSync(outputFilePath)) {
      fs.unlinkSync(outputFilePath);
    }

    // Output results using the HTML reporter
    await outputResults(null, outputFilePath, testResults, {
      reporters: ["html"],
    });

    // Read the file content
    const htmlContent = fs.readFileSync(outputFilePath, "utf-8");

    // Check that it contains style tags (self-contained CSS)
    expect(htmlContent).to.include("<style>");
    expect(htmlContent).to.include("</style>");

    // Clean up
    fs.unlinkSync(outputFilePath);
  });

  // Test that HTML file has proper structure
  it("HTML reporter creates valid HTML structure", async function () {
    const outputDir = path.resolve("./test");
    const outputFilePath = path.resolve(outputDir, "test-results-structure.html");

    // Clean up any existing file
    if (fs.existsSync(outputFilePath)) {
      fs.unlinkSync(outputFilePath);
    }

    // Output results using the HTML reporter
    await outputResults(null, outputFilePath, testResults, {
      reporters: ["html"],
    });

    // Read the file content
    const htmlContent = fs.readFileSync(outputFilePath, "utf-8");

    // Check basic HTML structure
    expect(htmlContent).to.include("<!DOCTYPE html>");
    expect(htmlContent).to.include("<html");
    expect(htmlContent).to.include("<head>");
    expect(htmlContent).to.include("</head>");
    expect(htmlContent).to.include("<body>");
    expect(htmlContent).to.include("</body>");
    expect(htmlContent).to.include("</html>");

    // Clean up
    fs.unlinkSync(outputFilePath);
  });

  // Test that HTML file uses green-based color scheme
  it("HTML reporter uses green-based color scheme", async function () {
    const outputDir = path.resolve("./test");
    const outputFilePath = path.resolve(outputDir, "test-results-colors.html");

    // Clean up any existing file
    if (fs.existsSync(outputFilePath)) {
      fs.unlinkSync(outputFilePath);
    }

    // Output results using the HTML reporter
    await outputResults(null, outputFilePath, testResults, {
      reporters: ["html"],
    });

    // Read the file content
    const htmlContent = fs.readFileSync(outputFilePath, "utf-8");

    // Check for green-based colors (checking for green hex codes or green color names)
    // Should have at least some green colors for pass states
    expect(
      htmlContent.includes("#2e7d32") || // dark green
      htmlContent.includes("#4caf50") || // material green
      htmlContent.includes("#66bb6a") || // lighter green
      htmlContent.includes("#a5d6a7") || // light green
      htmlContent.includes("green")
    ).to.equal(true);

    // Clean up
    fs.unlinkSync(outputFilePath);
  });

  // Test that HTML report includes summary stats
  it("HTML reporter includes summary statistics", async function () {
    const outputDir = path.resolve("./test");
    const outputFilePath = path.resolve(outputDir, "test-results-summary.html");

    // Clean up any existing file
    if (fs.existsSync(outputFilePath)) {
      fs.unlinkSync(outputFilePath);
    }

    // Output results using the HTML reporter
    await outputResults(null, outputFilePath, testResults, {
      reporters: ["html"],
    });

    // Read the file content
    const htmlContent = fs.readFileSync(outputFilePath, "utf-8");

    // Check that summary stats are included
    expect(htmlContent).to.include("Specs");
    expect(htmlContent).to.include("Tests");
    expect(htmlContent).to.include("Steps");

    // Clean up
    fs.unlinkSync(outputFilePath);
  });

  // Test that HTML reporter includes test details
  it("HTML reporter includes test details", async function () {
    const outputDir = path.resolve("./test");
    const outputFilePath = path.resolve(outputDir, "test-results-details.html");

    // Clean up any existing file
    if (fs.existsSync(outputFilePath)) {
      fs.unlinkSync(outputFilePath);
    }

    // Output results using the HTML reporter
    await outputResults(null, outputFilePath, testResults, {
      reporters: ["html"],
    });

    // Read the file content
    const htmlContent = fs.readFileSync(outputFilePath, "utf-8");

    // Check that test details are included (from test-results.json)
    expect(htmlContent).to.include("Do all the things!");
    expect(htmlContent).to.include("PASS");

    // Clean up
    fs.unlinkSync(outputFilePath);
  });

  // Test HTML reporter handles directory output path
  it("HTML reporter creates file when output is directory", async function () {
    const outputDir = path.resolve("./test/html-output");

    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Output results using the HTML reporter
    const result = await outputResults(null, outputDir, testResults, {
      reporters: ["html"],
      command: "runTests",
    });

    // Find the created HTML file in the directory
    const files = fs.readdirSync(outputDir);
    const htmlFiles = files.filter((f) => f.endsWith(".html"));

    expect(htmlFiles.length).to.be.greaterThan(0);

    // Clean up
    htmlFiles.forEach((file) => {
      fs.unlinkSync(path.join(outputDir, file));
    });
    fs.rmdirSync(outputDir);
  });

  // Test HTML reporter handles empty results
  it("HTML reporter handles empty or missing results gracefully", async function () {
    const outputDir = path.resolve("./test");
    const outputFilePath = path.resolve(outputDir, "test-results-empty.html");

    // Clean up any existing file
    if (fs.existsSync(outputFilePath)) {
      fs.unlinkSync(outputFilePath);
    }

    // Output results using the HTML reporter with null results
    await outputResults(null, outputFilePath, null, {
      reporters: ["html"],
    });

    // Check that output file exists even with empty results
    expect(fs.existsSync(outputFilePath)).to.equal(true);

    // Read the file content and check it has valid structure
    const htmlContent = fs.readFileSync(outputFilePath, "utf-8");
    expect(htmlContent).to.include("<!DOCTYPE html>");

    // Clean up
    fs.unlinkSync(outputFilePath);
  });
});
