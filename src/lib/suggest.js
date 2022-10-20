const prompt = require("prompt-sync")({ sigint: true });
const { log } = require("./utils");
const { sanitizeUri } = require("./sanitize");
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
  interction: {
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
  if (defaultValue) prompt = `${prompt}[Default: ${defaultValue}] `;
  return prompt;
}
function decideIntent(match) {
  console.log(`Found '${match.text}' on line ${match.line}.`);
  console.log(
    `What do you want to do with this ${
      markupToIntent[match.type].item
    }? Enter nothing to ignore.`
  );
  markupToIntent[match.type].intents.forEach((intent, index) => {
    console.log(`(${index + 1}) ${intent.description}`);
  });
  let choice = prompt("Enter a value: ");
  if (choice) {
    choice = Number(choice) - 1;
    return markupToIntent[match.type].intents[choice].intent;
  } else {
    // Ignore match
    return null;
  }
}

function buildGoTo(match) {
  // Prep
  defaults = {
    action: "goTo",
    uri: "",
  };
  action = {
    action: "goTo",
  };

  // URI (Required)
  // Define
  let message = constructPrompt(
    "(Required) What URI do you want to open?",
    defaults.uri
  );
  let uri = prompt(message);
  // Sanitize
  uri = sanitizeUri(uri);
  // Set
  action.uri = uri || defaults.uri;

  // Report
  console.log(action);
  return action;
}

function buildFind(match, intent) {
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

function buildScreenshot(match) {
  prompts = [];
  action = {
    action: "goTo",
    uri: "",
  };
}

function buildCheckLink(match) {
  prompts = [];
  action = {
    action: "checkLink",
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
      console.log(intent);
    });
  });

  exit();
  return suggestions;
}
