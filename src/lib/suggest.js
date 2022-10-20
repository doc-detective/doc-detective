const prompt = require("prompt-sync")({ sigint: true });
const { log } = require("./utils");
const { sanitizeUri } = require("./sanitize");

exports.suggestTests = suggestTests;

buildGoTo();

const intents = {
  find: {},
  matchText: {},
  type: {},
  click: {},
  captureImage: {},
  matchImage: {},
  openLink: {},
  checkLink: {},
  runScript: {},
  makeHttpRequest: {},
};

const markupToIntent = {
  onscreenText: ["find", "matchText", "click"],
  image: ["capture", "matchImage"],
  hyperlink: ["openLink", "checkLink"],
  orderedList: ["click"],
  unorderedList: [],
  codeInline: ["runScript", "makeHttpRequest"],
  codeBlock: ["runScript", "makeHttpRequest"],
  interction: ["find", "click"],
};

function constructPrompt(prompt, defaultValue) {
  prompt = `${prompt.trim()} `;
  if (defaultValue) prompt = `${prompt}[Default: ${defaultValue}] `;
  return prompt;
}

function buildGoTo(config, match) {
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

function suggestTests(config, markupCoverage) {
  let suggestions = {
    tests: [],
  };

  markupCoverage.files.forEach((file) => {});
  return suggestions;
}
