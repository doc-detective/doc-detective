const prompt = require("prompt-sync")({ sigint: true });
const { log } = require("./utils");
const { sanitizePath, sanitizeUri } = require("./sanitize");
const { exit } = require("process");

exports.suggestTests = suggestTests;

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
    intents: [intents.makeHttpRequest, intents.runShell],
  },
  codeBlock: {
    item: "code block",
    intents: [intents.makeHttpRequest, intents.runShell],
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
      intents.makeHttpRequest,
      intents.runShell,
    ],
  },
};

function constructPrompt(prompt, defaultValue) {
  prompt = `${prompt.trim()} `;
  if (defaultValue) prompt = `${prompt}[${defaultValue}] `;
  return prompt;
}
function decideIntent(match) {
  console.log("---");
  console.log(`Found '${match.text}' on line ${match.line}.`);
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
  text = match.text.match(/(?<=\()(\w|\W)*(?=\))/);

  // Prep
  defaults = {
    action: "goTo",
    uri: text[0],
  };
  action = {
    action: "goTo",
  };

  // URI (Required)
  // Define
  console.log("-");
  let message = constructPrompt(
    "(Required) Which URI do you want to open?",
    defaults.uri
  );
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
  text = match.text.match(/(?<=\()(\w|\W)*(?=\))/);

  // Prep
  defaults = {
    action: "checkLink",
    uri: text[0],
  };
  action = {
    action: "checkLink",
  };

  // URI (Required)
  // Define
  console.log("-");
  let message = constructPrompt(
    "(Required) Which URI do you want to validate?",
    defaults.uri
  );
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
    wait: {
      duration: 10000,
    },
    matchText: {
      text: "",
    },
    moveMouse: {},
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
  text = match.text.match(/(?<=\()(\w|\W)*(?=\))/);

  // Update defaults
  switch (intent) {
    case "type":
      defaults.type.keys = text;
      break;
    default:
      defaults.matchText.text = text;
      break;
  }

  // CSS (Required)
  // Define
  console.log("-");
  let message = constructPrompt(
    "(Required) What is the unique CSS selector for the element?",
    defaults.css
  );
  let css = prompt(message);
  css = css || defaults.css;
  // Required value. Return early if empty.
  if (!css) {
    log(config, "warning", "Skipping markup. Required value is empty.");
    return null;
  }
  // Set
  action.css = css;

  // Report
  log(config, "debug", action);
  return action;
}

function buildScreenshot(match) {
  prompts = [];
  action = {
    action: "goTo",
    uri: "",
  };
}

function buildHttpRequest(match) {
  prompts = [];
  action = {
    action: "httpRequest",
    uri: "",
  };
}

function buildRunShell(match) {
  prompts = [
    "Do you want to load environment variables before running the command?",
    "What command do you want to run?",
  ];
  action = {
    action: "runShell",
    command: "",
    env: "",
  };
}

function buildFind(intent, match) {
  prompts = [
    "What is the unique CSS selector for the element?",
    "What text do you want to match?",
    "Do you want to move the mouse to the element?",
    "Do you want to click the element?",
    "What keys do you want to type?",
    "What trailing special keys do you want to press after you type? For example, 'Enter'. Leave blank for none.",
  ];
  action = {
    action: "find",
    css: "",
    matchText: {
      text: "$TEXT",
    },
    moveMouse: {},
    click: {},
    type: {
      keys: "$KEYS",
      specialTrailingKey: "$SPECIAL_KEY",
    },
  };
}

function transformMatches(fileMarkupObject) {
  matches = [];
  // Load array with uncovered matches
  Object.keys(fileMarkupObject).forEach((mark) => {
    fileMarkupObject[mark].uncoveredMatches.forEach((match) => {
      match.type = mark;
      matches.push(match);
    });
  });
  // Sort matches by line, then index
  matches.sort((a, b) => a.line - b.line || a.indexInFile - b.indexInFile);
  return matches;
}

function suggestTests(config, markupCoverage) {
  let suggestions = {
    tests: [],
  };

  markupCoverage.files.forEach((file) => {
    test = {
      file: file.file,
      actions: [],
    };

    console.log("------");
    console.log(`File: ${file.file}`);

    matches = transformMatches(file.markup);
    matches.forEach((match) => {
      // Skip over certain match types
      if (match.type === "unorderedList" || match.type === "orderedList")
        return;
      // Deliniate match
      console.log("---");
      // Prompt for intent
      intent = decideIntent(match);
      // Skip over if user ignored prompt
      if (intent === null) return;
      switch (intent) {
        case "find":
          action = buildFind(config, match, intent);
          break;
        case "matchText":
          action = buildMatchText(config, match);
          break;
        case "type":
          action = buildType(config, match);
          break;
        case "click":
          action = buildClick(config, match);
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
          break;
      }
      // Only add to array when action present
      if (action) test.actions.push(action);
    });
    suggestions.tests.push(test);
  });
  console.log(suggestions);
  return suggestions;
}
