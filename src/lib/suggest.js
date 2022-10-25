const prompt = require("prompt-sync")({ sigint: true });
const path = require("path");
const fs = require("fs");
const uuid = require("uuid");
const { log, timestamp } = require("./utils");
const { sanitizePath, sanitizeUri } = require("./sanitize");
const { exit } = require("process");
const { runTests } = require("./tests");

exports.suggestTests = suggestTests;
exports.runSuggestions = runSuggestions;

const intents = {
  find: { intent: "find", description: "Find an element." },
  matchText: {
    intent: "matchText",
    description: "Verify that an element has this text.",
  },
  type: { intent: "type", description: "Type keys in an element." },
  click: { intent: "click", description: "Click an element." },
  captureImage: { intent: "captureImage", description: "Capture an image." },
  openLink: { intent: "openLink", description: "Open the link." },
  checkLink: {
    intent: "checkLink",
    description: "Check that the link is valid.",
  },
  runShell: {
    intent: "runShell",
    description: "Perform a native command, such as running a script.",
  },
  makeHttpRequest: {
    intent: "makeHttpRequest",
    description: "Make an HTTP request, such as calling an API.",
  },
};

const markupToIntent = {
  onscreenText: {
    item: "text",
    intents: [intents.find, intents.matchText, intents.click],
  },
  image: {
    item: "image",
    intents: [intents.captureImage],
  },
  hyperlink: {
    item: "link",
    intents: [intents.openLink, intents.checkLink],
  },
  codeInline: {
    item: "inline code",
    //intents: [intents.makeHttpRequest, intents.runShell],
    intents: [intents.runShell],
  },
  codeBlock: {
    item: "code block",
    //intents: [intents.makeHttpRequest, intents.runShell],
    intents: [intents.runShell],
  },
  interaction: {
    item: "item",
    intents: [
      intents.find,
      intents.matchText,
      intents.click,
      intents.type,
      intents.openLink,
      intents.checkLink,
      // intents.makeHttpRequest,
      intents.runShell,
    ],
  },
};

function constructPrompt(prompt, defaultValue) {
  if (defaultValue) {
    prompt = `${prompt.trim()} [${defaultValue}]: `;
  } else {
    prompt = `${prompt.trim()}: `;
  }
  return prompt;
}

function decideIntent(match, filepath) {
  lineText = getLineFromFile(filepath, match.line);
  console.log("---");
  console.log(`Found '${match.text}' on line ${match.line}:`);
  console.log(lineText);
  console.log();
  console.log(
    `What do you want to do with this ${
      markupToIntent[match.type].item
    }? Enter nothing to ignore.`
  );
  markupToIntent[match.type].intents.forEach((intent, index) => {
    console.log(`(${index + 1}) ${intent.description}`);
  });
  let choice = prompt("Enter a number: ");
  if (choice) {
    choice = Number(choice) - 1;
    return markupToIntent[match.type].intents[choice].intent;
  } else {
    // Ignore match
    return null;
  }
}

function buildGoTo(config, match) {
  // Filter input
  text =
    match.text.match(/(?<=\()(\w|\W)*(?=\))/) ||
    match.text.match(/(?<=href=")(\w|\W)*(?=")/);
  if (text) text = text[0];

  // Prep
  defaults = {
    action: "goTo",
    uri: text,
  };
  action = {
    action: "goTo",
  };

  // URI (Required)
  // Define
  console.log("-");
  let message = constructPrompt("URI", defaults.uri);
  console.log("(Required) Which URI do you want to open?");
  let uri = prompt(message);
  uri = uri || defaults.uri;
  // Required value. Return early if empty.
  if (!uri) {
    log(config, "warning", "Skipping markup. Required value is empty.");
    return null;
  }
  // Sanitize
  uri = sanitizeUri(uri);
  // Set
  action.uri = uri;

  // Report
  log(config, "debug", action);
  return action;
}

function buildCheckLink(config, match) {
  // Filter input
  text =
    match.text.match(/(?<=\()(\w|\W)*(?=\))/) ||
    match.text.match(/(?<=href=")(\w|\W)*(?=")/);
  if (text) text = text[0];

  // Prep
  defaults = {
    action: "checkLink",
    uri: text,
  };
  action = {
    action: "checkLink",
  };

  // URI (Required)
  // Define
  console.log("-");
  let message = constructPrompt("URI", defaults.uri);
  console.log("(Required) Which URI do you want to validate?");
  let uri = prompt(message);
  uri = uri || defaults.uri;
  // Required value. Return early if empty.
  if (!uri) {
    log(config, "warning", "Skipping markup. Required value is empty.");
    return null;
  }
  // Sanitize
  uri = sanitizeUri(uri);
  // Set
  action.uri = uri;

  // Report
  log(config, "debug", action);
  return action;
}

function buildFind(config, match, intent) {
  // Prep
  defaults = {
    action: "find",
    css: "",
    matchText: {
      text: "",
    },
    moveMouse: "",
    click: {},
    type: {
      keys: "",
      specialTrailingKey: "",
    },
  };
  action = {
    action: "find",
  };

  // Filter input
  text =
    match.text.match(/(?<=\*\*).+?(?=\*\*)/) ||
    match.text.match(/(?<=>)(\w|\W)*(?=<)/);
  if (text) text = text[0];

  // Update defaults
  if (text && intent === "type") {
    defaults.type.keys = text;
  } else if (text) {
    defaults.matchText.text = text;
  }

  // CSS (Required)
  // Define
  console.log("-");
  let message = constructPrompt("CSS selector", defaults.css);
  console.log("(Required) What is the unique CSS selector for the element?");
  let css = prompt(message);
  css = css || defaults.css;
  // Required value. Return early if empty.
  if (!css) {
    log(config, "warning", "Skipping markup. Required value is empty.");
    return null;
  }
  // Set
  action.css = css;

  // Match text
  // Define
  console.log("-");
  if (intent === "matchText") {
    matchText = "yes";
  } else {
    console.log("Do you want to validate the text of the element?");
    responses = ["No", "Yes"];
    responses.forEach((response, index) =>
      console.log(`(${index + 1}) ${response}`)
    );
    choice = prompt("Enter a number: ");
    if (choice) {
      choice = Number(choice) - 1;
      matchText = responses[choice];
    } else {
      matchText = "No";
    }
  }
  switch (matchText.toLowerCase()) {
    case "yes":
    case "y":
      console.log();
      console.log("What text do you expect the element to have?");
      message = constructPrompt("Text", defaults.matchText.text);
      matchText = prompt(message);
      matchText = matchText || defaults.matchText.text;
      break;
    default:
      matchText = null;
      break;
  }
  // Optional value. Set if present.
  if (matchText) {
    action.matchText = {};
    action.matchText.text = matchText;
  }

  // Move mouse
  // Define
  console.log("-");
  console.log("Do you want to move the mouse to the element?");
  responses = ["No", "Yes"];
  responses.forEach((response, index) =>
    console.log(`(${index + 1}) ${response}`)
  );
  choice = prompt("Enter a number: ");
  if (choice) {
    choice = Number(choice) - 1;
    moveMouse = responses[choice];
  } else {
    moveMouse = "No";
  }
  switch (moveMouse.toLowerCase()) {
    case "yes":
    case "y":
      moveMouse = {};
      break;
    default:
      moveMouse = null;
      break;
  }
  // Optional value. Set if present.
  if (moveMouse) {
    action.moveMouse = moveMouse;
  }

  // Click
  // Define
  if (intent === "click") {
    click = "yes";
  } else {
    console.log("-");
    console.log("Do you want to click the element?");
    responses = ["No", "Yes"];
    responses.forEach((response, index) =>
      console.log(`(${index + 1}) ${response}`)
    );
    choice = prompt("Enter a number: ");
    if (choice) {
      choice = Number(choice) - 1;
      click = responses[choice];
    } else {
      click = "No";
    }
  }
  switch (click.toLowerCase()) {
    case "yes":
    case "y":
      click = {};
      break;
    default:
      click = null;
      break;
  }
  // Optional value. Set if present.
  if (click) {
    action.click = click;
  }

  // Type
  // Define
  console.log("-");
  if (intent === "type") {
    keys = "yes";
  } else {
    console.log("Do you want to type keys?");
    responses = ["No", "Yes"];
    responses.forEach((response, index) =>
      console.log(`(${index + 1}) ${response}`)
    );
    choice = prompt("Enter a number: ");
    if (choice) {
      choice = Number(choice) - 1;
      keys = responses[choice];
    } else {
      keys = "No";
    }
  }
  switch (keys.toLowerCase()) {
    case "yes":
    case "y":
      console.log();
      console.log("What text do you want to type?");
      message = constructPrompt("Text", defaults.type.keys);
      keys = prompt(message);
      keys = keys || defaults.type.keys;
      break;
    default:
      keys = null;
      break;
  }
  // Optional value. Set if present.
  if (keys) {
    if (typeof action.type === "undefined") action.type = {};
    action.type.keys = keys;
  }

  // Trailing special key
  // Define
  console.log("-");
  console.log("Do you want to press a special key (such as 'Enter')?");
  responses = ["No", "Yes"];
  responses.forEach((response, index) =>
    console.log(`(${index + 1}) ${response}`)
  );
  choice = prompt("Enter a number: ");
  if (choice) {
    choice = Number(choice) - 1;
    specialKey = responses[choice];
  } else {
    specialKey = "No";
  }
  switch (specialKey.toLowerCase()) {
    case "yes":
    case "y":
      console.log();
      console.log(
        "What key do you want to press? For an list of supported key values, see https://pptr.dev/api/puppeteer.keyinput"
      );
      message = constructPrompt("Key", defaults.type.specialTrailingKey);
      specialKey = prompt(message);
      break;
    default:
      specialKey = null;
      break;
  }
  // Optional value. Set if present.
  if (specialKey) {
    if (typeof action.type === "undefined") action.type = {};
    action.type.specialTrailingKey = specialKey;
  }

  // Report
  log(config, "debug", action);
  return action;
}

function buildScreenshot(config, match) {
  // Filter input
  text =
    match.text.match(/(?<=\()(\w|\W)*(?=\))/) ||
    match.text.match(/(?<=src=")(\w|\W)*(?=")/);
  if (text) text = text[0];

  defaults = {
    action: "screenshot",
    filename: text || `${uuid.v4()}.png`,
    matchPrevious: "Yes",
    matchThreshold: 10,
  };
  action = {
    action: "screenshot",
  };

  // Filename
  // Define
  console.log("-");
  let message = constructPrompt("Filename", defaults.filename);
  console.log(
    "What do you want the screenshot filename to be? Must end in '.png'. If left empty, defaults to a random string."
  );
  let filename = prompt(message);
  filename = filename || defaults.filename;
  // Set
  action.filename = filename;

  // Match previous
  // Define
  console.log("-");
  console.log(
    "During testing, do you want to check for differences (such as UI changes) between new and old screenshots?"
  );
  responses = ["No", "Yes"];
  responses.forEach((response, index) =>
    console.log(`(${index + 1}) ${response}`)
  );
  choice = prompt("Enter a number: ");
  if (choice) {
    choice = Number(choice) - 1;
    matchPrevious = responses[choice];
  } else {
    matchPrevious = "No";
  }
  switch (matchPrevious.toLowerCase()) {
    case "yes":
    case "y":
      matchPrevious = true;
      console.log();
      console.log(
        "On a scale of 0-100, what is the mimumim percentage of a new screenshot that must be different to make this action fail?"
      );
      message = constructPrompt("Percentage", defaults.matchThreshold);
      matchThreshold = prompt(message);
      matchThreshold = matchThreshold.replace("%", "");
      matchThreshold = Number(matchThreshold) / 100;
      break;
    default:
      matchPrevious = null;
      matchThreshold = null;
      break;
  }
  // Optional value. Set if present.
  if (matchPrevious && matchThreshold) {
    action.matchPrevious = matchPrevious;
    action.matchThreshold = matchThreshold;
  }

  // Report
  log(config, "debug", action);
  return action;
}

function buildHttpRequest(config, match) {
  console.log();
  console.log(
    "Not yet supported by this test builder. For action details, see https://github.com/hawkeyexl/doc-detective#http-request"
  );
  return null;

  // Filter input
  text =
    match.text.match(/(?<=\()(\w|\W)*(?=\))/) ||
    match.text.match(/(?<=href=")(\w|\W)*(?=")/);
  if (text) text = text[0];

  // Prep
  defaults = {
    action: "httpRequest",
    uri: text,
  };
  action = {
    action: "httpRequest",
  };

  // URI (Required)
  // Define
  console.log("-");
  let message = constructPrompt("URI", defaults.uri);
  console.log("(Required) Which URI do you want to validate?");
  let uri = prompt(message);
  uri = uri || defaults.uri;
  // Required value. Return early if empty.
  if (!uri) {
    log(config, "warning", "Skipping markup. Required value is empty.");
    return null;
  }
  // Sanitize
  uri = sanitizeUri(uri);
  // Set
  action.uri = uri;

  // Report
  log(config, "debug", action);
  return action;
}

function buildRunShell(config, match) {
  defaults = {
    action: "runShell",
    command: "",
    env: "",
  };
  action = {
    action: "runShell",
  };

  // Command (Required)
  // Define
  console.log("-");
  let message = constructPrompt("Command", defaults.command);
  console.log(
    "(Required) What command do you want to run? If specifying a path, enter a fully qualified file path or a path relative to the current working directory."
  );
  let command = prompt(message);
  command = command || defaults.command;
  // Required value. Return early if empty.
  if (!command) {
    log(config, "warning", "Skipping markup. Required value is empty.");
    return null;
  }
  // Set
  action.command = command;

  // Env
  // Define
  console.log("-");
  console.log(
    "Do you want to load environment variables before running the command?"
  );
  responses = ["No", "Yes"];
  responses.forEach((response, index) =>
    console.log(`(${index + 1}) ${response}`)
  );
  let choice = prompt("Enter a number: ");
  if (choice) {
    choice = Number(choice) - 1;
    env = responses[choice];
  } else {
    env = "No";
  }
  switch (env.toLowerCase()) {
    case "yes":
    case "y":
      console.log();
      console.log(
        "What is the path to your .env file? Enter a fully qualified file path or a path relative to the current working directory."
      );
      env = prompt("Path: ");
      // Sanitize
      env = sanitizePath(env);
      break;
    default:
      env = null;
      break;
  }
  env = env || defaults.env;
  // Optional value. Set if present.
  if (env) {
    action.env = env;
  }

  // Report
  log(config, "debug", action);
  return action;
}

function transformMatches(fileMarkupObject) {
  matches = [];
  // Load array with uncovered matches
  Object.keys(fileMarkupObject).forEach((mark) => {
    if (fileMarkupObject[mark].includeInSuggestions) {
      fileMarkupObject[mark].uncoveredMatches.forEach((match) => {
        match.type = mark;
        matches.push(match);
      });
    }
  });
  // Sort matches by line, then index
  matches.sort((a, b) => a.line - b.line || a.indexInFile - b.indexInFile);
  return matches;
}

function getLineFromFile(filepath, line) {
  const fileBody = fs.readFileSync(filepath, {
    encoding: "utf8",
    flag: "r",
  });
  lines = fileBody.split("\n");
  return lines[line - 1];
}

function suggestTests(config, markupCoverage) {
  let report = {
    name: "Doc Detective Test Suggestion Report",
    timestamp: timestamp(),
    files: [],
  };

  markupCoverage.files.forEach((file) => {
    suggestions = {
      tests: [
        {
          id: `${uuid.v4()}`,
          file: file.file,
          actions: [],
        },
      ],
    };

    console.log("------");
    console.log(`File: ${file.file}`);

    matches = transformMatches(file.markup);
    matches.forEach((match) => {
      // Skip over certain match types
      if (match.type === "unorderedList" || match.type === "orderedList")
        return;
      // Prompt for intent
      intent = decideIntent(match, file.file);
      // Skip over if user ignored prompt
      if (intent === null) return;
      switch (intent) {
        case "find":
          action = buildFind(config, match, intent);
          break;
        case "matchText":
          action = buildFind(config, match, intent);
          break;
        case "type":
          action = buildFind(config, match, intent);
          break;
        case "click":
          action = buildFind(config, match, intent);
          break;
        case "captureImage":
          action = buildScreenshot(config, match);
          break;
        case "openLink":
          action = buildGoTo(config, match);
          break;
        case "checkLink":
          action = buildCheckLink(config, match);
          break;
        case "makeHttpRequest":
          action = buildHttpRequest(config, match);
          break;
        case "runShell":
          action = buildRunShell(config, match);
          break;
        default:
          action = null;
          break;
      }
      // Only add to array when action present
      if (action) {
        suggestions.tests[0].actions.push(action);
        // IF SOURCE UPDATE IS TRUE, UPDATE SOURCE WITH TEST FENCES
        // IF SOURCE UPDATE IS TRUE AND LAST ARRAY ITEM, CLOSE TEST FENCE
      }
    });
    // Various outputs
    if (suggestions.tests[0].actions.length > 0) {
      // Write test to sidecar file
      testPath = path.resolve(
        path.dirname(file.file),
        `${path.basename(file.file, path.extname(file.file))}.test.json`
      );
      if (fs.existsSync(testPath)) {
        testPath = path.resolve(
          path.dirname(file.file),
          `${path.basename(file.file, path.extname(file.file))}.test.${
            suggestions.tests[0].id
          }.json`
        );
      }
      let data = JSON.stringify(suggestions, null, 2);
      fs.writeFile(testPath, data, (err) => {
        if (err) throw err;
      });
      report.files.push({
        file: file.file,
        test: testPath,
        suggestions,
      });
    }
  });
  return report;
}

async function runSuggestions(config, suggestionReport) {
  let tests = { tests: [] };
  suggestionReport.files.forEach((file) => {
    file.suggestions.tests.forEach((test) => tests.tests.push(test));
  });
  if (tests.tests.length == 0) return suggestionReport;

  console.log("Do you want to run the suggested tests now?");
  console.log("Note: Tests that require additional updates may fail.");
  responses = ["No", "Yes"];
  responses.forEach((response, index) =>
    console.log(`(${index + 1}) ${response}`)
  );
  let choice = prompt("Enter a number: ");
  if (choice) {
    choice = Number(choice) - 1;
    run = responses[choice];
  } else {
    run = "No";
  }
  switch (run.toLowerCase()) {
    case "yes":
    case "y":
      // Run tests
      suggestionReport.results = await runTests(config, tests);
      break;
    default:
      break;
  }
  return suggestionReport;
}
