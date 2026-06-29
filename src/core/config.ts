import os from "node:os";
import fs from "node:fs";
import { validate } from "../common/src/validate.js";
import { log, spawnCommand, loadEnvs, replaceEnvs } from "./utils.js";
import path from "node:path";
import { spawn as spawnChild } from "node:child_process";
import { loadHeavyDep, resolveHeavyDepPath } from "../runtime/loader.js";
import { getBrowsersDir, readInstalledRecord } from "../runtime/cacheDir.js";
import { verifyDriverBinary, geckodriverBinaryInCache } from "../runtime/browsers.js";
import { setAppiumHome } from "./appium.js";
import { loadDescription } from "./openapi.js";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export { setConfig, getAvailableApps, getBrowserDiagnostics, getEnvironment, resolveConcurrentRunners, clearAppCache, verifyAppDrivers };

/**
 * A candidate browser app plus the driver binary that must be functional for
 * it to be offered. `driverPath`/`driverName` may be absent when the binary
 * can't be located cheaply — in that case the app passes through and the
 * runtime session attempt (plus cross-browser fallback) is the safety net.
 */
interface AppDriverDescriptor {
  app: any;
  driverName?: string;
  driverPath?: string;
}

/**
 * Layer 2 of the driver-resilience strategy: gate each candidate browser on
 * its driver *executing*, not merely existing on disk. A present-but-broken
 * driver (e.g. a partially downloaded geckodriver on Windows) is excluded so
 * the runner never builds a doomed session for it; the default-browser picker
 * then moves to the next available engine. Drivers without a resolvable path
 * pass through unchecked. Pure and injectable so it unit-tests without real
 * binaries.
 */
async function verifyAppDrivers(
  descriptors: AppDriverDescriptor[],
  {
    verify,
    logger,
  }: {
    verify: (
      driverName: string,
      driverPath: string
    ) => Promise<{ ok: boolean; error?: string }>;
    logger?: (msg: string, level?: string) => void;
  }
): Promise<any[]> {
  const out: any[] = [];
  for (const d of descriptors) {
    if (!d.driverName || !d.driverPath) {
      out.push(d.app);
      continue;
    }
    const res = await verify(d.driverName, d.driverPath);
    if (res.ok) {
      out.push(d.app);
    } else if (logger) {
      logger(
        `Excluding ${
          d.app?.name ?? d.driverName
        } from available browsers: its ${d.driverName} driver is present but did not validate (${
          res.error ?? "no error reported"
        }). Possible causes include a partial or corrupt download, a permissions issue, or a missing dependency.`,
        "warning"
      );
    }
  }
  return out;
}

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
        "<data\\s+[^>]*?name=[\"']doc-detective[\"'][^>]*?value='test\\s+([^']+?)'[^>]*?(?:\\/\\s*>|>\\s*<\\/data>)",
        '<data\\s+[^>]*?name=["\']doc-detective["\'][^>]*?value="test\\s+([^"]+?)"[^>]*?(?:\\/\\s*>|>\\s*<\\/data>)',
        "<data\\s+[^>]*?value='test\\s+([^']+?)'[^>]*?name=[\"']doc-detective[\"'][^>]*?(?:\\/\\s*>|>\\s*<\\/data>)",
        '<data\\s+[^>]*?value="test\\s+([^"]+?)"[^>]*?name=["\']doc-detective["\'][^>]*?(?:\\/\\s*>|>\\s*<\\/data>)',
      ],
      testEnd: [
        "<\\?doc-detective\\s+test\\s+end\\s*\\?>",
        "<!--\\s*test end([\\s\\S]+?)-->",
        "<data\\s+[^>]*?name=[\"']doc-detective[\"'][^>]*?value=[\"']test end[\"'][^>]*?(?:\\/\\s*>|>\\s*<\\/data>)",
        "<data\\s+[^>]*?value=[\"']test end[\"'][^>]*?name=[\"']doc-detective[\"'][^>]*?(?:\\/\\s*>|>\\s*<\\/data>)",
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
        "<data\\s+[^>]*?name=[\"']doc-detective[\"'][^>]*?value='step\\s+([^']+?)'[^>]*?(?:\\/\\s*>|>\\s*<\\/data>)",
        '<data\\s+[^>]*?name=["\']doc-detective["\'][^>]*?value="step\\s+([^"]+?)"[^>]*?(?:\\/\\s*>|>\\s*<\\/data>)',
        "<data\\s+[^>]*?value='step\\s+([^']+?)'[^>]*?name=[\"']doc-detective[\"'][^>]*?(?:\\/\\s*>|>\\s*<\\/data>)",
        '<data\\s+[^>]*?value="step\\s+([^"]+?)"[^>]*?name=["\']doc-detective["\'][^>]*?(?:\\/\\s*>|>\\s*<\\/data>)',
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
  // Dry runs return the resolved-tests preview without ever executing.
  // `environment.apps` is only surfaced in the resolved-config output here —
  // the runner paths in tests.ts re-discover apps themselves via
  // getAvailableApps rather than reading this field back — so skipping the
  // detection on a dry run avoids the @puppeteer/browsers load, the
  // browser-cache scan, and the unbounded `appium driver list` spawn (the work
  // that pushes dryRun.test.js past its mocha timeout on a starved
  // windows+node22 runner) with no effect on resolved output or execution.
  config.environment.apps = config.dryRun ? [] : await getAvailableApps({ config });

  // Resolve concurrent runners configuration
  config.concurrentRunners = resolveConcurrentRunners(config);

  // TODO: Revise loadDescriptions() so it doesn't mutate the input but instead returns an updated object
  await loadDescriptions(config);

  return config;
}

/**
 * Resolves the concurrentRunners configuration value from various input formats
 * to a concrete positive integer for the core execution engine. Always returns
 * an integer >= 1: the CLI/config path is already schema-validated, but API
 * callers can hand core a pre-resolved config that skipped validation, so an
 * invalid value (0, NaN, a string, undefined) must not propagate — it would
 * size the worker pool and the Appium server pool to 0 and hang driver
 * contexts on an empty pool.
 *
 * @param {Object} config - The configuration object
 * @returns {number} The resolved concurrent runners value (integer >= 1)
 */
function resolveConcurrentRunners(config: any) {
  if (config.concurrentRunners === true) {
    // Cap at 4 for the boolean convenience option; floor at 1 in case
    // os.cpus() reports 0 (some restricted containers) so the pool is never
    // sized to 0.
    return Math.max(1, Math.min(os.cpus().length, 4));
  }
  // Coerce to a positive integer; fall back to 1 for anything invalid.
  const runners = Math.floor(Number(config.concurrentRunners));
  return Number.isFinite(runners) && runners >= 1 ? runners : 1;
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
    const failed: any[] = [];
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
        failed.push(openApiConfig);
      }
    }
    // Remove failed configurations after iteration
    if (failed.length > 0) {
      config.integrations.openApi = config.integrations.openApi.filter(
        (item: any) => !failed.includes(item)
      );
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

// Module-level cache for available apps detection, keyed by the
// resolved browsers-cache directory. The lookup is cache-dir-sensitive
// (the same process might detect different browsers depending on
// config.cacheDir or DOC_DETECTIVE_CACHE_DIR), and lazy-install can
// materialize new browsers between calls — so a single process-global
// slot would (a) cross-contaminate different cacheDir values and (b)
// return stale "no browsers" results after a JIT pre-flight install.
// Avoids redundant `appium driver list` calls (~17s each) and browser
// scanning for repeat lookups against the same cache dir.
const cachedAppsByDir: Map<string, any[]> = new Map();

function cacheKeyFor(config: any): string {
  // Reuse `getBrowsersDir` so the key respects every override the rest
  // of the runtime honors (env var > config.cacheDir > tmpdir, with the
  // legacy `./browser-snapshots/` fallback).
  return getBrowsersDir({ cacheDir: config?.cacheDir });
}

function clearAppCache(config?: any) {
  if (config === undefined) {
    cachedAppsByDir.clear();
    return;
  }
  cachedAppsByDir.delete(cacheKeyFor(config));
}

// Live browser/driver probing for `getAvailableApps` — the runtime gate
// that decides whether a real run can launch a browser right now.
//
// Returns the raw `@puppeteer/browsers` install list and the combined
// `appium driver list` output, plus a `browserDetectionFailed` flag set
// only on an *unexpected* failure (the dep is present but fails to
// load/scan) so callers can skip caching. A simply-absent dep (lean
// install) is the normal "nothing installed" case, not a failure.
//
// Note: the diagnostic dump uses `getBrowserDiagnostics` instead, which
// reads doc-detective's `installed.json` record so it reports the same
// values as `doc-detective install` / `install status`.
async function probeBrowserEnvironment({
  config,
  browsersDir,
}: any): Promise<{
  installedBrowsers: any[];
  appiumDriverOutput: string;
  browserDetectionFailed: boolean;
}> {
  setAppiumHome({ cacheDir: config?.cacheDir });
  const cwd = process.cwd();
  process.chdir(path.join(__dirname, "../.."));
  let installedBrowsers: any[] = [];
  let browserDetectionFailed = false;
  let appiumDriverOutput = "";
  try {
    // Detect installed browsers read-only: autoInstall=false so config
    // resolution never triggers a heavy @puppeteer/browsers install (which
    // would defeat DOC_DETECTIVE_AUTOINSTALL=0 and the lazy-install contract).
    // Provisioning is the JIT pre-flight's job (core/index.ts) when a run
    // actually needs a browser. Gate the load on a non-installing presence
    // check so a missing dep (lean install) is a normal empty result rather
    // than a thrown error; only a present-but-broken dep counts as a failure.
    const browsersInstalled = resolveHeavyDepPath("@puppeteer/browsers", {
      cacheDir: config?.cacheDir,
    });
    if (browsersInstalled) {
      try {
        const browsers = await loadHeavyDep<any>("@puppeteer/browsers", {
          ctx: { cacheDir: config?.cacheDir },
          autoInstall: false,
        });
        installedBrowsers = await browsers.getInstalledBrowsers({
          cacheDir: browsersDir,
        });
      } catch (err: any) {
        // Present but failed to load/scan (corrupt cache, API change, etc.):
        // non-fatal for detection, but surface the reason and don't cache it.
        browserDetectionFailed = true;
        log(
          config,
          "warning",
          `Browser detection failed; continuing without detected browsers: ${err?.message ?? err}`
        );
        installedBrowsers = [];
      }
    }
    // Resolve appium's JS entry directly (shim first, then cache)
    // and spawn `node <entry> driver list`. Bypasses `.cmd` shims,
    // `npm exec`, and shell:true — the same pattern as the Appium
    // spawns in src/core/tests.ts.
    const appiumEntry = resolveHeavyDepPath("appium", {
      cacheDir: config?.cacheDir,
    });
    const installedAppiumDrivers = await new Promise<{
      stdout: string;
      stderr: string;
      exitCode: number;
    }>((resolve) => {
      if (!appiumEntry) {
        resolve({
          stdout: "",
          stderr: "appium is not installed; driver list unavailable",
          exitCode: 1,
        });
        return;
      }
      const child = spawnChild(
        process.execPath,
        [appiumEntry, "driver", "list"],
        { env: process.env }
      );
      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (c: Buffer | string) => {
        stdout += typeof c === "string" ? c : c.toString("utf8");
      });
      child.stderr?.on("data", (c: Buffer | string) => {
        stderr += typeof c === "string" ? c : c.toString("utf8");
      });
      // Treat a spawn error (ENOENT, EACCES) as exitCode 1 with the
      // message in stderr so the downstream driver-presence regex
      // checks degrade to "no drivers detected" rather than aborting
      // the run.
      child.on("error", (err) => {
        resolve({
          stdout: stdout.replace(/\n$/, ""),
          stderr: (stderr + String(err)).replace(/\n$/, ""),
          exitCode: 1,
        });
      });
      child.on("close", (code: number | null) => {
        resolve({
          stdout: stdout.replace(/\n$/, ""),
          stderr: stderr.replace(/\n$/, ""),
          exitCode: code ?? 1,
        });
      });
    });

    // `appium driver list` writes its formatted table to stdout; combine both
    // streams so detection works regardless of which version uses which stream.
    appiumDriverOutput =
      installedAppiumDrivers.stdout + "\n" + installedAppiumDrivers.stderr;
  } finally {
    // Always restore the original working directory
    process.chdir(cwd);
  }

  return { installedBrowsers, appiumDriverOutput, browserDetectionFailed };
}

async function getAvailableApps({ config }: any) {
  // Resolve the browsers cache dir *before* chdir-ing. `getBrowsersDir`'s
  // legacy-snapshot fallback probes `path.resolve('browser-snapshots')`
  // relative to the current CWD, so it has to run against the user's
  // original CWD to honor a project-local `./browser-snapshots/` directory.
  // Reusing the same resolved absolute path for both the cache key and the
  // `getInstalledBrowsers` call below keeps `cachedAppsByDir` consistent
  // with the directory actually scanned.
  const browsersDir = getBrowsersDir({ cacheDir: config?.cacheDir });
  const key = browsersDir;
  const hit = cachedAppsByDir.get(key);
  if (hit) return hit;

  const { installedBrowsers, appiumDriverOutput, browserDetectionFailed } =
    await probeBrowserEnvironment({ config, browsersDir });

  // Note: Edge/Microsoft Edge detection is intentionally excluded
  // Only Chrome, Firefox, and Safari are supported browsers.
  //
  // Build candidate apps with the driver binary each needs, then gate them on
  // the driver actually executing (Layer 2). Presence in `installed.json` /
  // `appium driver list` is necessary but not sufficient — a partially
  // downloaded driver passes presence checks yet can't start a session.
  const descriptors: AppDriverDescriptor[] = [];

  // Detect Chrome
  const chrome = installedBrowsers.find(
    (browser: any) => browser.browser === "chrome"
  );
  const chromeVersion = chrome?.buildId;
  const chromedriver = installedBrowsers.find(
    (browser: any) => browser.browser === "chromedriver"
  );
  const appiumChromium = appiumDriverOutput.match(
    /\n.*chromium.*installed \(npm\).*\n/
  );

  if (chrome && chromedriver && appiumChromium) {
    descriptors.push({
      app: {
        name: "chrome",
        version: chromeVersion,
        path: chrome.executablePath,
        driver: chromedriver.executablePath,
      },
      driverName: "chromedriver",
      driverPath: chromedriver.executablePath,
    });
  }

  // Detect Firefox
  const firefox = installedBrowsers.find(
    (browser: any) => browser.browser === "firefox"
  );
  const appiumFirefox = appiumDriverOutput.match(
    /\n.*gecko.*installed \(npm\).*\n/
  );

  if (firefox && appiumFirefox) {
    // Resolve the geckodriver binary so Layer 2 can execute it. Best-effort:
    // if it can't be located cheaply, the descriptor carries no driverPath
    // and the app passes through to the runtime fallback (Layer 4).
    const geckodriverPath = resolveGeckodriverBinaryPath(config);
    descriptors.push({
      app: {
        name: "firefox",
        version: firefox.buildId,
        path: firefox.executablePath,
      },
      driverName: geckodriverPath ? "geckodriver" : undefined,
      driverPath: geckodriverPath,
    });
  }

  // Detect Safari
  if (config.environment.platform === "mac") {
    const safariVersion = await spawnCommand(
      "defaults read /Applications/Safari.app/Contents/Info.plist CFBundleShortVersionString"
    );
    const appiumSafari = appiumDriverOutput.match(
      /\n.*safari.*installed \(npm\).*\n/
    );

    if (safariVersion.exitCode === 0 && appiumSafari) {
      // safaridriver ships with macOS at a fixed path; verifying it executes
      // confirms the binary runs. Note this does NOT prove "Allow Remote
      // Automation" is enabled — that can still be off and only surface at
      // session start, where the cross-browser fallback then takes over.
      descriptors.push({
        app: { name: "safari", version: safariVersion.stdout.trim(), path: "" },
        driverName: "safaridriver",
        driverPath: "/usr/bin/safaridriver",
      });
    }
  }

  // TODO
  // Detect Android Studio
  // Detect iOS Simulator

  const apps = await verifyAppDrivers(descriptors, {
    verify: (driverName, driverPath) =>
      verifyDriverBinary(driverName, driverPath),
    logger: (msg, level) => log(config, level ?? "warning", msg),
  });

  // Don't cache a result built on a failed browser detection — a transient
  // failure must not suppress later successful detection in this process.
  if (!browserDetectionFailed) cachedAppsByDir.set(key, apps);
  return apps;
}

/**
 * Best-effort resolution of the geckodriver binary path for Layer 2's
 * functional check. Probes the browsers cache directly for the extracted
 * `geckodriver(.exe)` binary (root + one level deep) rather than loading the
 * geckodriver module and mutating the process-wide `GECKODRIVER_CACHE_DIR` —
 * that env dance would race across concurrent `getAvailableApps()` calls for
 * different cache dirs. Gated on the geckodriver package being resolvable (so a
 * lean install without it returns undefined), and returns undefined when the
 * binary can't be located so Firefox detection degrades to the runtime fallback.
 */
function resolveGeckodriverBinaryPath(config: any): string | undefined {
  const installed = resolveHeavyDepPath("geckodriver", {
    cacheDir: config?.cacheDir,
  });
  if (!installed) return undefined;
  return geckodriverBinaryInCache(getBrowsersDir({ cacheDir: config?.cacheDir }));
}

interface BrowserComponent {
  // What this component is, e.g. "chrome browser", "chromedriver",
  // "appium-chromium-driver".
  label: string;
  installed: boolean;
  // Version and/or path when known.
  detail?: string;
}

interface BrowserDiagnostic {
  name: "chrome" | "firefox" | "safari";
  // false when the browser can't run on this platform at all (Safari off macOS).
  supported: boolean;
  // true when every component Doc Detective gates on for a real run is present
  // (mirrors `getAvailableApps`).
  available: boolean;
  components: BrowserComponent[];
  note?: string;
}

// Bounded, killable Safari version probe for diagnostics. `spawnCommand`
// has no timeout and the debug-side `Promise.race` doesn't cancel the
// child, so a hung `defaults` could keep the process alive past the cap.
// Spawn it directly (no shell) with a hard kill-on-timeout. Returns the
// version string, or null if Safari is absent / the probe times out / errors.
function probeSafariVersion(timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawnChild>;
    try {
      child = spawnChild(
        "defaults",
        [
          "read",
          "/Applications/Safari.app/Contents/Info.plist",
          "CFBundleShortVersionString",
        ],
        { stdio: ["ignore", "pipe", "ignore"] }
      );
    } catch {
      resolve(null);
      return;
    }
    let stdout = "";
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        child.kill();
      } catch {
        // Best-effort.
      }
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    timer.unref?.();
    child.stdout?.on("data", (c: Buffer | string) => {
      stdout += typeof c === "string" ? c : c.toString("utf8");
    });
    child.on("error", () => finish(null));
    child.on("close", (code: number | null) =>
      finish(code === 0 ? stdout.trim() : null)
    );
  });
}

// Per-browser, per-component status for the diagnostic dump. Always reports
// all supported browsers (Chrome, Firefox, Safari) whether or not they're
// usable, so a user can see exactly which piece is missing.
//
// Reads from the same `<cacheDir>/installed.json` record that
// `doc-detective install` / `install status` use (`readInstalledRecord`),
// NOT live `@puppeteer/browsers` / `appium driver list` probing — so the
// dump reports the SAME values as the installer (e.g. the appium-*-driver
// npm packages and the geckodriver binary that live probing misses). A
// browser is `available` when its browser binary, its webdriver, and its
// Appium driver are all recorded as installed.
async function getBrowserDiagnostics({ config }: any): Promise<{
  browsers: BrowserDiagnostic[];
  detectionFailed: boolean;
}> {
  // Track unexpected failures so the caller can warn that component status
  // may be incomplete. Reading the record is normally defensive (returns an
  // empty record on a bad/missing file), but guard it anyway, and flag a
  // throwing Safari probe below.
  let detectionFailed = false;
  let record: ReturnType<typeof readInstalledRecord>;
  try {
    record = readInstalledRecord({ cacheDir: config?.cacheDir });
  } catch {
    detectionFailed = true;
    record = { npmPackages: {}, browsers: {} };
  }
  const browsersRec = record.browsers || {};
  const platform = config?.environment?.platform;

  // Browser binaries are tracked in installed.json (matches the `@version`
  // shown by `install`/`install status`).
  const brow = (name: string) => browsersRec[name];
  // Heavy npm packages (the appium-*-driver wrappers) count as installed
  // when resolvable from the shim's node_modules OR the runtime cache —
  // the same presence check `ensureRuntimeInstalled` uses to decide
  // "already-up-to-date". The cache record alone would miss packages that
  // resolve from node_modules (e.g. a dev checkout or pre-installed deps).
  const npmInstalled = (name: string) =>
    Boolean(resolveHeavyDepPath(name, { cacheDir: config?.cacheDir }));
  const browsers: BrowserDiagnostic[] = [];

  // Chrome: browser binary + chromedriver + appium-chromium-driver.
  const chrome = brow("chrome");
  const chromedriver = brow("chromedriver");
  const appiumChromium = npmInstalled("appium-chromium-driver");
  browsers.push({
    name: "chrome",
    supported: true,
    available: Boolean(chrome && chromedriver && appiumChromium),
    components: [
      { label: "chrome browser", installed: Boolean(chrome), detail: chrome?.installedVersion },
      { label: "chromedriver", installed: Boolean(chromedriver), detail: chromedriver?.installedVersion },
      { label: "appium-chromium-driver", installed: appiumChromium },
    ],
  });

  // Firefox: browser binary + geckodriver + appium-geckodriver.
  const firefox = brow("firefox");
  const geckodriver = brow("geckodriver");
  const appiumGecko = npmInstalled("appium-geckodriver");
  browsers.push({
    name: "firefox",
    supported: true,
    available: Boolean(firefox && geckodriver && appiumGecko),
    components: [
      { label: "firefox browser", installed: Boolean(firefox), detail: firefox?.installedVersion },
      { label: "geckodriver", installed: Boolean(geckodriver), detail: geckodriver?.installedVersion },
      { label: "appium-geckodriver", installed: appiumGecko },
    ],
  });

  // Safari (macOS only): the OS-provided app + safaridriver, plus the
  // appium-safari-driver npm package. The app/driver are OS-provided (not
  // tracked in installed.json), so they're probed directly.
  const isMac = platform === "mac";
  const appiumSafari = npmInstalled("appium-safari-driver");
  let safariApp = false;
  let safariVersion: string | undefined;
  let safaridriver = false;
  if (isMac) {
    try {
      const version = await probeSafariVersion(4000);
      safariApp = version !== null;
      safariVersion = version ?? undefined;
      // safaridriver ships with macOS; it still needs `safaridriver --enable`
      // and "Allow Remote Automation" before a run can use it.
      safaridriver = fs.existsSync("/usr/bin/safaridriver");
    } catch {
      // An unexpected probe failure (not just "Safari absent") — flag it so
      // the caller can note the component status may be incomplete.
      detectionFailed = true;
    }
  }
  browsers.push({
    name: "safari",
    supported: isMac,
    available: Boolean(isMac && safariApp && safaridriver && appiumSafari),
    components: [
      { label: "Safari app", installed: safariApp, detail: safariVersion },
      {
        label: "safaridriver",
        installed: safaridriver,
        detail: safaridriver ? "/usr/bin/safaridriver" : undefined,
      },
      { label: "appium-safari-driver", installed: appiumSafari },
    ],
    note: isMac ? undefined : "Safari is only available on macOS",
  });

  return { browsers, detectionFailed };
}
