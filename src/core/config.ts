import os from "node:os";
import { validate } from "doc-detective-common";
import { log, spawnCommand, loadEnvs, replaceEnvs } from "./utils.js";
import { exec } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import * as browsers from "@puppeteer/browsers";
import { setAppiumHome } from "./appium.js";
import { loadDescription } from "./openapi.js";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export { setConfig, getAvailableApps, getEnvironment, resolveConcurrentRunners, clearAppCache };

/**
 * Deep merge two objects, with override properties taking precedence
 * @param {Object} target - The target object to merge into
 * @param {Object} override - The override object containing properties to merge
 * @returns {Object} A new object with merged properties
 */
function deepMerge(target: any, override: any): any {
  const result = { ...target };

  for (const key in override) {
    if (override.hasOwnProperty(key)) {
      if (
        override[key] != null &&
        typeof override[key] === "object" &&
        !Array.isArray(override[key])
      ) {
        if (
          result[key] != null &&
          typeof result[key] === "object" &&
          !Array.isArray(result[key])
        ) {
          result[key] = deepMerge(result[key], override[key]);
        } else {
          result[key] = deepMerge({}, override[key]);
        }
      } else {
        result[key] = override[key];
      }
    }
  }

  return result;
}

// Map of Node-detected platforms to common-term equivalents
const platformMap: any = {
  darwin: "mac",
  linux: "linux",
  win32: "windows",
};

// List of default apps to check for
// Note: Edge/Microsoft Edge is not supported and detection is intentionally excluded
const defaultAppIDs = {
  chromium: {
    linux: "chromium-browser",
    mac: "org.chromium.Chromium",
    windows: "chromium",
  },
  firefox: {
    linux: "firefox",
    mac: "org.mozilla.firefox",
    windows: "firefox",
  },
  chrome: {
    linux: "google-chrome",
    mac: "org.google.Chrome",
    windows: "chrome",
  },
};

// List of default file type definitions
let defaultFileTypes: any = {
  asciidoc_1_0: {
    name: "asciidoc",
    extensions: ["adoc", "asciidoc", "asc"],
    inlineStatements: {
      testStart: ["\\/\\/\\s+\\(\\s*test\\s+([\\s\\S]*?)\\s*\\)"],
      testEnd: ["\\/\\/\\s+\\(\\s*test end\\s*\\)"],
      ignoreStart: ["\\/\\/\\s+\\(\\s*test ignore start\\s*\\)"],
      ignoreEnd: ["\\/\\/\\s+\\(\\s*test ignore end\\s*\\)"],
      step: ["\\/\\/\\s+\\(\\s*step\\s+([\\s\\S]*?)\\s*\\)"],
    },
    markup: [],
  },
  dita_1_0: {
    name: "dita",
    extensions: ["dita", "ditamap", "xml"],
    inlineStatements: {
      testStart: [
        "<\\?doc-detective\\s+test([\\s\\S]*?)\\?>",
        "<!--\\s*test([\\s\\S]+?)-->",
      ],
      testEnd: [
        "<\\?doc-detective\\s+test\\s+end\\s*\\?>",
        "<!--\\s*test end([\\s\\S]+?)-->",
      ],
      ignoreStart: [
        "<\\?doc-detective\\s+test\\s+ignore\\s+start\\s*\\?>",
        "<!--\\s*test ignore\\s+start\\s*-->",
      ],
      ignoreEnd: [
        "<\\?doc-detective\\s+test\\s+ignore\\s+end\\s*\\?>",
        "<!--\\s*test ignore\\s+end\\s*-->",
      ],
      step: [
        "<\\?doc-detective\\s+step\\s+([\\s\\S]*?)\\s*\\?>",
        "<!--\\s*step([\\s\\S]+?)-->",
        '<data\\s+name="step"\\s*>([\\s\\S]*?)<\\/data>',
      ],
    },
    markup: [
      {
        name: "clickUiControl",
        regex: [
          "(?:[Cc]lick|[Tt]ap|[Ss]elect|[Pp]ress|[Cc]hoose)\\s+(?:the\\s+)?<uicontrol>([^<]+)<\\/uicontrol>",
        ],
        actions: ["click"],
      },
      {
        name: "typeIntoUiControl",
        regex: [
          "(?:[Tt]ype|[Ee]nter|[Ii]nput)\\s+<userinput>([^<]+)<\\/userinput>\\s+(?:in|into)(?:\\s+the)?\\s+<uicontrol>([^<]+)<\\/uicontrol>",
        ],
        actions: [
          {
            type: {
              keys: "$1",
              selector: "$2",
            },
          },
        ],
      },
      {
        name: "navigateToXref",
        regex: [
          '(?:[Nn]avigate\\s+to|[Oo]pen|[Gg]o\\s+to|[Vv]isit|[Bb]rowse\\s+to)\\s+<xref\\s+[^>]*href="(https?:\\/\\/[^"]+)"[^>]*>',
        ],
        actions: ["goTo"],
      },
      {
        name: "findUiControl",
        regex: ["<uicontrol>([^<]+)<\\/uicontrol>"],
        actions: ["find"],
      },
      {
        name: "verifyWindowTitle",
        regex: ["<wintitle>([^<]+)<\\/wintitle>"],
        actions: ["find"],
      },
      {
        name: "checkExternalXref",
        regex: [
          '<xref\\s+[^>]*scope="external"[^>]*href="(https?:\\/\\/[^"]+)"[^>]*>',
          '<xref\\s+[^>]*href="(https?:\\/\\/[^"]+)"[^>]*scope="external"[^>]*>',
        ],
        actions: ["checkLink"],
      },
      {
        name: "checkHyperlink",
        regex: ['<xref\\s+href="(https?:\\/\\/[^"]+)"[^>]*>'],
        actions: ["checkLink"],
      },
      {
        name: "checkLinkElement",
        regex: ['<link\\s+href="(https?:\\/\\/[^"]+)"[^>]*>'],
        actions: ["checkLink"],
      },
      {
        name: "clickOnscreenText",
        regex: [
          "\\b(?:[Cc]lick|[Tt]ap|[Ll]eft-click|[Cc]hoose|[Ss]elect|[Cc]heck)\\b\\s+<b>((?:(?!<\\/b>).)+)<\\/b>",
        ],
        actions: ["click"],
      },
      {
        name: "findOnscreenText",
        regex: ["<b>((?:(?!<\\/b>).)+)<\\/b>"],
        actions: ["find"],
      },
      {
        name: "goToUrl",
        regex: [
          '\\b(?:[Gg]o\\s+to|[Oo]pen|[Nn]avigate\\s+to|[Vv]isit|[Aa]ccess|[Pp]roceed\\s+to|[Ll]aunch)\\b\\s+<xref\\s+href="(https?:\\/\\/[^"]+)"[^>]*>',
        ],
        actions: ["goTo"],
      },
      {
        name: "typeText",
        regex: ['\\b(?:[Pp]ress|[Ee]nter|[Tt]ype)\\b\\s+"([^"]+)"'],
        actions: ["type"],
      },
    ],
  },
  html_1_0: {
    name: "html",
    extensions: ["html", "htm"],
    inlineStatements: {
      testStart: ["<!--\\s*test\\s+?([\\s\\S]*?)\\s*-->"],
      testEnd: ["<!--\\s*test end\\s*([\\s\\S]*?)\\s*-->"],
      ignoreStart: ["<!--\\s*test ignore start\\s*-->"],
      ignoreEnd: ["<!--\\s*test ignore end\\s*-->"],
      step: ["<!--\\s*step\\s+?([\\s\\S]*?)\\s*-->"],
    },
    markup: [],
  },
  markdown_1_0: {
    name: "markdown",
    extensions: ["md", "markdown", "mdx"],
    inlineStatements: {
      testStart: [
        "{\\/\\*\\s*test\\s+?([\\s\\S]*?)\\s*\\*\\/}",
        "<!--\\s*test\\s*([\\s\\S]*?)\\s*-->",
        "\\[comment\\]:\\s+#\\s+\\(test\\s*(.*?)\\s*\\)",
        "\\[comment\\]:\\s+#\\s+\\(test start\\s*(.*?)\\s*\\)",
        "\\[comment\\]:\\s+#\\s+'test\\s*(.*?)\\s*'",
        "\\[comment\\]:\\s+#\\s+'test start\\s*(.*?)\\s*'",
        '\\[comment\\]:\\s+#\\s+"test\\s*((?:[^"\\\\]|\\\\.)*)\\s*"',
        '\\[comment\\]:\\s+#\\s+"test start\\s*((?:[^"\\\\]|\\\\.)*)\\s*"',
      ],
      testEnd: [
        "{\\/\\*\\s*test end\\s*\\*\\/}",
        "<!--\\s*test end\\s*([\\s\\S]*?)\\s*-->",
        "\\[comment\\]:\\s+#\\s+\\(test end\\)",
        "\\[comment\\]:\\s+#\\s+'test end'",
        '\\[comment\\]:\\s+#\\s+"test end"',
      ],
      ignoreStart: [
        "{\\/\\*\\s*test ignore start\\s*\\*\\/}",
        "<!--\\s*test ignore start\\s*-->",
        "\\[comment\\]:\\s+#\\s+\\(test ignore start\\)",
        "\\[comment\\]:\\s+#\\s+'test ignore start'",
        '\\[comment\\]:\\s+#\\s+"test ignore start"',
      ],
      ignoreEnd: [
        "{\\/\\*\\s*test ignore end\\s*\\*\\/}",
        "<!--\\s*test ignore end\\s*-->",
        "\\[comment\\]:\\s+#\\s+\\(test ignore end\\)",
        "\\[comment\\]:\\s+#\\s+'test ignore end'",
        '\\[comment\\]:\\s+#\\s+"test ignore end"',
      ],
      step: [
        "{\\/\\*\\s*step\\s+?([\\s\\S]*?)\\s*\\*\\/}",
        "<!--\\s*step\\s*([\\s\\S]*?)\\s*-->",
        "\\[comment\\]:\\s+#\\s+\\(step\\s*(.*?)\\s*\\)",
        "\\[comment\\]:\\s+#\\s+'step\\s*(.*?)\\s*'",
        '\\[comment\\]:\\s+#\\s+"step\\s*((?:[^"\\\\]|\\\\.)*)\\s*"',
      ],
    },
    markup: [
      {
        name: "checkHyperlink",
        regex: [
          '(?<!\\!)\\[[^\\]]+\\]\\(\\s*(https?:\\/\\/[^\\s)]+)(?:\\s+"[^"]*")?\\s*\\)',
        ],
        actions: ["checkLink"],
      },
      {
        name: "clickOnscreenText",
        regex: [
          "\\b(?:[Cc]lick|[Tt]ap|[Ll]eft-click|[Cc]hoose|[Ss]elect|[Cc]heck)\\b\\s+\\*\\*((?:(?!\\*\\*).)+)\\*\\*",
        ],
        actions: ["click"],
      },
      {
        name: "findOnscreenText",
        regex: ["\\*\\*((?:(?!\\*\\*).)+)\\*\\*"],
        actions: ["find"],
      },
      {
        name: "goToUrl",
        regex: [
          '\\b(?:[Gg]o\\s+to|[Oo]pen|[Nn]avigate\\s+to|[Vv]isit|[Aa]ccess|[Pp]roceed\\s+to|[Ll]aunch)\\b\\s+\\[[^\\]]+\\]\\(\\s*(https?:\\/\\/[^\\s)]+)(?:\\s+"[^"]*")?\\s*\\)',
        ],
        actions: ["goTo"],
      },
      {
        name: "screenshotImage",
        regex: [
          '!\\[[^\\]]*\\]\\(\\s*([^\\s)]+)(?:\\s+"[^"]*")?\\s*\\)\\s*\\{(?=[^}]*\\.screenshot)[^}]*\\}',
        ],
        actions: ["screenshot"],
      },
      {
        name: "typeText",
        regex: ['\\b(?:press|enter|type)\\b\\s+"([^"]+)"'],
        actions: ["type"],
      },
      {
        name: "httpRequestFormat",
        regex: [
          "```(?:http)?\\r?\\n([A-Z]+)\\s+([^\\s]+)(?:\\s+HTTP\\/[\\d.]+)?\\r?\\n((?:[^\\s]+:\\s+[^\\s]+\\r?\\n)*)?(?:\\s+([\\s\\S]*?)\\r?\\n+)?```",
        ],
        actions: [
          {
            httpRequest: {
              method: "$1",
              url: "$2",
              request: {
                headers: "$3",
                body: "$4",
              },
            },
          },
        ],
      },
      {
        name: "runCode",
        regex: [
          "```(bash|python|py|javascript|js)(?![^\\r\\n]*testIgnore)[^\\r\\n]*\\r?\\n([\\s\\S]*?)\\r?\\n```",
        ],
        actions: [
          {
            unsafe: true,
            runCode: {
              language: "$1",
              code: "$2",
            },
          },
        ],
      },
    ],
  },
};
// Set keyword versions
defaultFileTypes = {
  ...defaultFileTypes,
  markdown: defaultFileTypes.markdown_1_0,
  asciidoc: defaultFileTypes.asciidoc_1_0,
  html: defaultFileTypes.html_1_0,
  dita: defaultFileTypes.dita_1_0,
};

/**
 * Sets up and validates the configuration object for Doc Detective
 * @async
 * @param {Object} config - The configuration object to process
 * @returns {Promise<Object>} The processed and validated configuration object
 * @throws Will exit process with code 1 if configuration is invalid
 */
async function setConfig({ config }: any) {
  // Set environment variables from file
  if (config.loadVariables) await loadEnvs(config.loadVariables);

  // Load environment variables for `config`
  config = replaceEnvs(config);

  // Apply config overrides from DOC_DETECTIVE environment variable
  if (process.env.DOC_DETECTIVE) {
    try {
      const docDetectiveEnv = JSON.parse(process.env.DOC_DETECTIVE);
      if (
        docDetectiveEnv.config &&
        typeof docDetectiveEnv.config === "object"
      ) {
        config = deepMerge(config, docDetectiveEnv.config);
      }
    } catch (error: any) {
      log(
        config,
        "warning",
        `Invalid JSON in DOC_DETECTIVE environment variable: ${error.message}. Ignoring config overrides.`
      );
    }
  }

  // Validate inbound `config`.
  const validityCheck = validate({ schemaKey: "config_v3", object: config });
  if (!validityCheck.valid) {
    // TODO: Improve error message reporting.
    log(
      config,
      "error",
      `Invalid config object: ${validityCheck.errors}. Exiting.`
    );
    throw new Error(`Invalid config object: ${validityCheck.errors}. Exiting.`);
  }
  config = validityCheck.object;

  // Replace fileType strings with objects
  config.fileTypes = config.fileTypes.map((fileType: any) => {
    if (typeof fileType === "object") return fileType;
    const fileTypeObject = defaultFileTypes[fileType];
    if (typeof fileTypeObject !== "undefined") return fileTypeObject;
    log(
      config,
      "error",
      `Invalid config. "${fileType}" isn't a valid fileType value.`
    );
    throw new Error(
      `Invalid config. "${fileType}" isn't a valid fileType value.`
    );
  });

  // Standardize value formats
  if (typeof config.input === "string") config.input = [config.input];
  if (typeof config.beforeAny === "string") {
    if (config.beforeAny === "") {
      config.beforeAny = [];
    } else {
      config.beforeAny = [config.beforeAny];
    }
  }
  if (typeof config.afterAll === "string") {
    if (config.afterAll === "") {
      config.afterAll = [];
    } else {
      config.afterAll = [config.afterAll];
    }
  }
  if (typeof config.fileTypes === "string") {
    config.fileTypes = [config.fileTypes];
  }
  config.fileTypes = config.fileTypes.map((fileType: any) => {
    if (fileType.inlineStatements) {
      if (typeof fileType.inlineStatements.testStart === "string")
        fileType.inlineStatements.testStart = [
          fileType.inlineStatements.testStart,
        ];
      if (typeof fileType.inlineStatements.testEnd === "string")
        fileType.inlineStatements.testEnd = [fileType.inlineStatements.testEnd];
      if (typeof fileType.inlineStatements.ignoreStart === "string")
        fileType.inlineStatements.ignoreStart = [
          fileType.inlineStatements.ignoreStart,
        ];
      if (typeof fileType.inlineStatements.ignoreEnd === "string")
        fileType.inlineStatements.ignoreEnd = [
          fileType.inlineStatements.ignoreEnd,
        ];
      if (typeof fileType.inlineStatements.step === "string")
        fileType.inlineStatements.step = [fileType.inlineStatements.step];
    }
    if (fileType.markup) {
      fileType.markup = fileType.markup.map((markup: any) => {
        if (typeof markup?.regex === "string") markup.regex = [markup.regex];
        return markup;
      });
    }
    if (fileType.extends) {
      // If fileType extends another, merge the properties
      const extendedFileTypeRaw = defaultFileTypes[fileType.extends];
      if (!extendedFileTypeRaw) {
        log(
          config,
          "error",
          'Invalid config. fileType.extends references unknown fileType definition: "' +
            fileType.extends +
            '".'
        );
        throw new Error(
          'Invalid config. fileType.extends references unknown fileType definition: "' +
            fileType.extends +
            '".'
        );
      }
      const extendedFileType = JSON.parse(JSON.stringify(extendedFileTypeRaw));
      if (extendedFileType) {
        if (!fileType.name) {
          fileType.name = extendedFileType.name;
        }
        // Merge extensions
        if (extendedFileType?.extensions) {
          fileType.extensions = [
            ...new Set([
              ...(extendedFileType.extensions || []),
              ...(fileType.extensions || []),
            ]),
          ];
        }
        // Merge inlineStatements
        if (extendedFileType?.inlineStatements) {
          if (fileType.inlineStatements === undefined) {
            fileType.inlineStatements = {};
          }
          const keys = [
            "testStart",
            "testEnd",
            "ignoreStart",
            "ignoreEnd",
            "step",
          ];
          for (const key of keys) {
            if (
              extendedFileType?.inlineStatements?.[key] ||
              fileType?.inlineStatements?.[key]
            ) {
              fileType.inlineStatements[key] = [
                ...new Set([
                  ...(extendedFileType?.inlineStatements?.[key] || []),
                  ...(fileType?.inlineStatements?.[key] || []),
                ]),
              ];
            }
          }
        }
        // Merge markup array
        if (extendedFileType?.markup) {
          fileType.markup = fileType.markup || [];
          extendedFileType.markup.forEach((extendedMarkup: any) => {
            const existingMarkupIndex = fileType.markup.findIndex(
              (markup: any) => markup.name === extendedMarkup.name
            );
            if (existingMarkupIndex === -1) {
              fileType.markup.push(extendedMarkup);
            }
          });
        }
      }
    }

    return fileType;
  });

  // Detect current environment.
  config.environment = getEnvironment();
  config.environment.apps = await getAvailableApps({ config });

  // Resolve concurrent runners configuration
  config.concurrentRunners = resolveConcurrentRunners(config);

  // TODO: Revise loadDescriptions() so it doesn't mutate the input but instead returns an updated object
  await loadDescriptions(config);

  return config;
}

/**
 * Resolves the concurrentRunners configuration value from various input formats
 * to a concrete integer for the core execution engine.
 *
 * @param {Object} config - The configuration object
 * @returns {number} The resolved concurrent runners value
 */
function resolveConcurrentRunners(config: any) {
  if (config.concurrentRunners === true) {
    // Cap at 4 only for the boolean convenience option
    return Math.min(os.cpus().length, 4);
  }
  // Respect explicit numeric values and default
  return config.concurrentRunners || 1;
}

/**
 * Loads OpenAPI descriptions for all configured OpenAPI integrations.
 *
 * @async
 * @param {Object} config - The configuration object.
 * @returns {Promise<void>} - A promise that resolves when all descriptions are loaded.
 *
 * @remarks
 * This function modifies the input config object by:
 * 1. Adding a 'definition' property to each OpenAPI configuration with the loaded description.
 * 2. Removing any OpenAPI configurations where the description failed to load.
 */
async function loadDescriptions(config: any) {
  if (config?.integrations?.openApi) {
    for (const openApiConfig of config.integrations.openApi) {
      try {
        openApiConfig.definition = await loadDescription(
          openApiConfig.descriptionPath
        );
      } catch (error: any) {
        log(
          config,
          "error",
          `Failed to load OpenAPI description from ${openApiConfig.descriptionPath}: ${error.message}`
        );
        // Remove the failed OpenAPI configuration
        config.integrations.openApi = config.integrations.openApi.filter(
          (item: any) => item !== openApiConfig
        );
      }
    }
  }
}

// Detect aspects of the environment running Doc Detective.
function getEnvironment() {
  const environment: any = {};
  // Detect system architecture
  environment.arch = os.arch();
  // Detect system platform
  environment.platform = platformMap[process.platform];
  return environment;
}

// Module-level cache for available apps detection.
// Avoids redundant `npx appium driver list` calls (~17s each) and browser scanning.
let cachedApps: any[] | null = null;

function clearAppCache() {
  cachedApps = null;
}

// Detect available apps.
async function getAvailableApps({ config }: any) {
  if (cachedApps) return cachedApps;

  setAppiumHome();
  const cwd = process.cwd();
  process.chdir(path.join(__dirname, "../.."));
  const apps: any[] = [];

  const installedBrowsers = await browsers.getInstalledBrowsers({
    cacheDir: path.resolve("browser-snapshots"),
  });
  const installedAppiumDrivers = await spawnCommand("npx appium driver list");

  // Note: Edge/Microsoft Edge detection is intentionally excluded
  // Only Chrome, Firefox, and Safari are supported browsers

  // Detect Chrome
  const chrome = installedBrowsers.find(
    (browser: any) => browser.browser === "chrome"
  );
  const chromeVersion = chrome?.buildId;
  const chromedriver = installedBrowsers.find(
    (browser: any) => browser.browser === "chromedriver"
  );
  const appiumChromium = installedAppiumDrivers.stderr.match(
    /\n.*chromium.*installed \(npm\).*\n/
  );

  if (chrome && chromedriver && appiumChromium) {
    apps.push({
      name: "chrome",
      version: chromeVersion,
      path: chrome.executablePath,
      driver: chromedriver.executablePath,
    });
  }

  // Detect Firefox
  const firefox = installedBrowsers.find(
    (browser: any) => browser.browser === "firefox"
  );
  const appiumFirefox = installedAppiumDrivers.stderr.match(
    /\n.*gecko.*installed \(npm\).*\n/
  );

  if (firefox && appiumFirefox) {
    apps.push({
      name: "firefox",
      version: firefox.buildId,
      path: firefox.executablePath,
    });
  }

  // Detect Safari
  if (config.environment.platform === "mac") {
    const safariVersion = await spawnCommand(
      "defaults read /Applications/Safari.app/Contents/Info.plist CFBundleShortVersionString"
    );
    const appiumSafari = installedAppiumDrivers.stderr.match(
      /\n.*safari.*installed \(npm\).*\n/
    );

    if (safariVersion.exitCode === 0 && appiumSafari) {
      apps.push({ name: "safari", version: safariVersion, path: "" });
    }
  }

  // Return to original working directory after finishing with `BROWSERS`
  process.chdir(cwd);

  // TODO
  // Detect Android Studio
  // Detect iOS Simulator

  cachedApps = apps;
  return apps;
}
