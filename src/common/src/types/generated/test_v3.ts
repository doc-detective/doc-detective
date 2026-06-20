/* eslint-disable */
/**
 * Auto-generated from test_v3.schema.json
 * Do not edit manually
 */

/**
 * A Doc Detective test.
 */
export type Test = {
  [k: string]: unknown;
} & {
  /**
   * Unique identifier for the test.
   */
  testId?: string;
  /**
   * Description of the test.
   */
  description?: string;
  /**
   * Path to the content that the test is associated with.
   */
  contentPath?: string;
  /**
   * Whether or not to detect steps in input files based on markup regex.
   */
  detectSteps?: boolean;
  /**
   * If `true`, captures a screenshot after every step in this test that runs in a browser. Overrides `autoScreenshot` set at the spec or config level. When unset, defers to the spec level, then the config level.
   */
  autoScreenshot?: boolean;
  /**
   * If `true`, records a video of every browser context in this test. Overrides `autoRecord` set at the spec or config level. When unset, defers to the spec level, then the config level.
   */
  autoRecord?: boolean;
  /**
   * Contexts to run the test in. Overrides contexts defined at the config and spec levels.
   */
  runOn?: Context[];
  openApi?: (OpenApi & OpenAPIDescriptionTest)[];
  if?: Condition;
  /**
   * Routing entries evaluated when this test passes. Phase 1: validated but ignored at runtime.
   */
  onPass?: Routing[];
  /**
   * Routing entries evaluated when this test fails. Phase 1: validated but ignored at runtime.
   */
  onFail?: Routing1[];
  /**
   * Routing entries evaluated when this test produces a warning. Phase 1: validated but ignored at runtime.
   */
  onWarning?: Routing2[];
  /**
   * Routing entries evaluated when this test is skipped. Phase 1: validated but ignored at runtime.
   */
  onSkip?: Routing3[];
  /**
   * Path to a test specification to perform before this test, while maintaining this test's context. Useful for setting up testing environments. Only the `steps` property is used from the first test in the setup spec.
   */
  before?: string;
  /**
   * Path to a test specification to perform after this test, while maintaining this test's context. Useful for cleaning up testing environments. Only the `steps` property is used from the first test in the cleanup spec.
   */
  after?: string;
  /**
   * Steps to perform as part of the test. Performed in the sequence defined. If one or more actions fail, the test fails. By default, if a step fails, the test stops and the remaining steps are not executed.
   *
   * @minItems 1
   */
  steps?: [Step, ...Step[]];
  contexts?: ResolvedContexts;
};
/**
 * OpenAPI description and configuration.
 */
export type OpenApi = {
  [k: string]: unknown;
};
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition = string | [string, ...string[]];
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing1 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing2 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing3 = {
  [k: string]: unknown;
};
/**
 * A step in a test.
 */
export type Step =
  | (Common & CheckLink)
  | (Common1 & Click)
  | (Common2 & Find)
  | (Common3 & GoTo)
  | (Common4 & HttpRequest)
  | (Common5 & RunShell)
  | (Common6 & RunCode)
  | (Common7 & RunBrowserScript)
  | (Common8 & Type)
  | (Common9 & Screenshot)
  | (Common10 & SaveCookie)
  | (Common11 & Record)
  | (Common12 & StopRecord)
  | (Common13 & LoadVariables)
  | (Common14 & DragAndDrop)
  | (Common15 & LoadCookie)
  | (Common16 & Wait);
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition1 = string | [string, ...string[]];
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition2 = string | [string, ...string[]];
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing4 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing5 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing6 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing7 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
export type CheckLink1 = CheckLinkDetailed | CheckLinkDetailed1;
/**
 * Check if an HTTP or HTTPS URL returns an acceptable status code from a GET request.
 */
export type CheckLinkDetailed = string;
/**
 * Headers to include in the HTTP request, as newline-separated values. For example, `X-Api-Key: abc123
 * Authorization: Bearer token`.
 */
export type RequestHeadersString = string;
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition3 = string | [string, ...string[]];
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition4 = string | [string, ...string[]];
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing8 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing9 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing10 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing11 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * Click or tap an element.
 */
export type Click1 = ClickElementSimple | ClickElementDetailed | boolean;
/**
 * Identifier for the element to click. Can be a selector, element text, ARIA name, ID, or test ID.
 */
export type ClickElementSimple = string;
export type ClickElementDetailed =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition5 = string | [string, ...string[]];
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition6 = string | [string, ...string[]];
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing12 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing13 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing14 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing15 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * Find an element based on display text or a selector, then optionally interact with it.
 */
export type Find1 = FindElementSimple | FindElementDetailed;
/**
 * Identifier for the element to find. Can be a selector, element text, ARIA name, ID, or test ID.
 */
export type FindElementSimple = string;
export type FindElementDetailed =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition7 = string | [string, ...string[]];
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition8 = string | [string, ...string[]];
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing16 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing17 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing18 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing19 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
export type GoTo1 = GoToURLSimple | GoToURLDetailed;
/**
 * Navigate to an HTTP or HTTPS URL. Can be a full URL or a path. If a path is provided, navigates relative to the current URL, if any.
 */
export type GoToURLSimple = string;
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition9 = string | [string, ...string[]];
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition10 = string | [string, ...string[]];
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing20 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing21 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing22 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing23 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * Perform a generic HTTP request, for example to an API.
 */
export type HttpRequest1 = HTTPRequestSimple | HTTPRequestDetailed;
/**
 * URL for the HTTP request.
 */
export type HTTPRequestSimple = string;
export type HTTPRequestDetailed =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition11 = string | [string, ...string[]];
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition12 = string | [string, ...string[]];
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing24 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing25 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing26 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing27 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * Perform a native shell command.
 */
export type RunShell1 = RunShellCommandSimple | RunShellCommandDetailed;
/**
 * Command to perform in the machine's default shell.
 */
export type RunShellCommandSimple = string;
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition13 = string | [string, ...string[]];
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition14 = string | [string, ...string[]];
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing28 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing29 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing30 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing31 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * Assemble and run code.
 */
export type RunCode1 = RunCodeDetailed;
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition15 = string | [string, ...string[]];
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition16 = string | [string, ...string[]];
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing32 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing33 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing34 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing35 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * Execute arbitrary JavaScript in the browser page context. Runs via the WebDriver `executeScript` endpoint, so it has access to the page's `document`, `window`, and DOM. Doc Detective captures the script's return value in the step's `outputs.result`. Distinct from `runCode`, which runs Node/Python/bash on the host machine.
 */
export type RunBrowserScript1 = RunBrowserScriptSimple | RunBrowserScriptDetailed;
/**
 * JavaScript to evaluate in the browser page context. Supports `return` to capture a value into `outputs.result`.
 */
export type RunBrowserScriptSimple = string;
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition17 = string | [string, ...string[]];
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition18 = string | [string, ...string[]];
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing36 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing37 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing38 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing39 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * Type keys. To type special keys, begin and end the string with `$` and use the special key's keyword. For example, to type the Escape key, enter `$ESCAPE$`.
 */
export type TypeKeys = TypeKeysSimple | TypeKeysDetailed;
/**
 * Sequence of keys to enter.
 */
export type TypeKeysSimple = string | string[];
/**
 * Sequence of keys to enter.
 */
export type TypeKeysSimple1 = string | string[];
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition19 = string | [string, ...string[]];
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition20 = string | [string, ...string[]];
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing40 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing41 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing42 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing43 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * Takes a screenshot in PNG format.
 */
export type Screenshot1 = ScreenshotSimple | CaptureScreenshotDetailed | CaptureScreenshot;
/**
 * File path of the PNG file. Accepts absolute paths. If not specified, the file name is the ID of the step. If an `http(s)` URL is supplied, the remote image is downloaded and used as a read-only reference for comparison; the new capture is written to a local run-specific folder instead of being uploaded back to the URL.
 */
export type ScreenshotSimple = string;
/**
 * File path of the PNG file. Accepts absolute paths. If not specified, the file name is the ID of the step. If an `http(s)` URL is supplied, the remote image is downloaded and used as a read-only reference for comparison; the new capture is written to a local run-specific folder instead of being uploaded back to the URL.
 */
export type ScreenshotSimple1 = string;
/**
 * Display text or selector of the element to screenshot.
 */
export type CropByElementSimple = string;
/**
 * Crop the screenshot to a specific element.
 */
export type CropByElementDetailed =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * If `true`, captures a screenshot. If `false`, doesn't capture a screenshot.
 */
export type CaptureScreenshot = boolean;
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition21 = string | [string, ...string[]];
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition22 = string | [string, ...string[]];
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing44 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing45 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing46 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing47 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * Save a specific browser cookie to a file or environment variable for later reuse.
 */
export type SaveCookie1 = CookieName | SaveCookieDetailed;
/**
 * Name of the specific cookie to save. Will be saved to a default file path or environment variable.
 */
export type CookieName = string;
export type SaveCookieDetailed =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition23 = string | [string, ...string[]];
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition24 = string | [string, ...string[]];
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing48 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing49 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing50 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing51 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * Start recording. Must be followed by a `stopRecord` step. The `browser` engine captures the Chrome viewport (works under concurrency); the `ffmpeg` engine captures the screen and supports any application. Supported extensions: [ '.mp4', '.webm', '.gif' ]
 */
export type Record1 = RecordSimple | RecordDetailed | RecordBoolean;
/**
 * File path of the recording. Supports the `.mp4`, `.webm`, and `.gif` extensions. If not specified, the file name is the ID of the step, and the extension is `.mp4`.
 */
export type RecordSimple = string;
/**
 * Recording engine to use. Either a string shorthand selecting the engine with defaults, or an object for full control. If unset, defaults to the `browser` engine when a visible Chrome context is available and to `ffmpeg` otherwise.
 */
export type RecordingEngine = RecordingEngineSimple | RecordingEngineDetailed;
/**
 * `browser` records the Chrome viewport (concurrency-safe); `ffmpeg` records the screen and supports any application.
 */
export type RecordingEngineSimple = "browser" | "ffmpeg";
/**
 * If `true`, starts recording — auto-selecting the `browser` engine for a visible Chrome context and the `ffmpeg` engine otherwise. If `false`, doesn't record.
 */
export type RecordBoolean = boolean;
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition25 = string | [string, ...string[]];
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition26 = string | [string, ...string[]];
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing52 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing53 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing54 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing55 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * Stop a recording started by an earlier `record` step. With no target (`true`/`null`), stops the most recently started recording that is still active (LIFO). To stop a specific recording when several overlap, target it by name with a string (`stopRecord: "<name>"`) or an object (`stopRecord: { name: "<name>" }`).
 */
export type StopRecord1 = StopRecordBoolean | StopRecordNull | StopRecordName | StopRecordDetailed;
/**
 * If `true`, stops the most recently started active recording (LIFO). If `false`, does nothing — an explicit no-op (mirrors `record: false`).
 */
export type StopRecordBoolean = boolean;
/**
 * Stops the most recently started active recording (LIFO).
 */
export type StopRecordNull = null;
/**
 * Name of the recording to stop. Matches the `name` given to a `record` step.
 */
export type StopRecordName = string;
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition27 = string | [string, ...string[]];
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition28 = string | [string, ...string[]];
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing56 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing57 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing58 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing59 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * Load environment variables from the specified `.env` file.
 */
export type LoadVariables1 = string;
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition29 = string | [string, ...string[]];
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition30 = string | [string, ...string[]];
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing60 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing61 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing62 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing63 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * Display text, selector, or regex pattern (enclosed in forward slashes) of the element.
 */
export type ElementSimple = string;
export type ElementDetailed =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * Display text, selector, or regex pattern (enclosed in forward slashes) of the element.
 */
export type ElementSimple1 = string;
export type ElementDetailed1 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition31 = string | [string, ...string[]];
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition32 = string | [string, ...string[]];
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing64 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing65 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing66 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing67 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * Load a specific cookie from a file or environment variable into the browser.
 */
export type LoadCookie1 = CookieNameOrFilePath | LoadCookieDetailed;
/**
 * Name of the specific cookie to load from default location, or file path to cookie file.
 */
export type CookieNameOrFilePath = string;
export type LoadCookieDetailed =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition33 = string | [string, ...string[]];
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition34 = string | [string, ...string[]];
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing68 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing69 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing70 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing71 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * Pause (in milliseconds) before performing the next action.
 */
export type Wait1 = WaitSimple | WaitEnvironmentVariable | WaitBoolean;
export type WaitSimple = number;
export type WaitEnvironmentVariable = string;
export type WaitBoolean = boolean;
/**
 * OpenAPI description and configuration.
 */
export type OpenApi1 = {
  [k: string]: unknown;
};
/**
 * A step in a test.
 */
export type Step1 =
  | (Common17 & CheckLink2)
  | (Common18 & Click2)
  | (Common19 & Find2)
  | (Common20 & GoTo2)
  | (Common21 & HttpRequest2)
  | (Common22 & RunShell2)
  | (Common23 & RunCode2)
  | (Common24 & RunBrowserScript2)
  | (Common25 & Type1)
  | (Common26 & Screenshot2)
  | (Common27 & SaveCookie2)
  | (Common28 & Record2)
  | (Common29 & StopRecord2)
  | (Common30 & LoadVariables2)
  | (Common31 & DragAndDrop2)
  | (Common32 & LoadCookie2)
  | (Common33 & Wait2);
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition35 = string | [string, ...string[]];
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition36 = string | [string, ...string[]];
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing72 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing73 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing74 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing75 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
export type CheckLink3 = CheckLinkDetailed2 | CheckLinkDetailed3;
/**
 * Check if an HTTP or HTTPS URL returns an acceptable status code from a GET request.
 */
export type CheckLinkDetailed2 = string;
/**
 * Headers to include in the HTTP request, as newline-separated values. For example, `X-Api-Key: abc123
 * Authorization: Bearer token`.
 */
export type RequestHeadersString1 = string;
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition37 = string | [string, ...string[]];
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition38 = string | [string, ...string[]];
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing76 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing77 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing78 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing79 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * Click or tap an element.
 */
export type Click3 = ClickElementSimple1 | ClickElementDetailed1 | boolean;
/**
 * Identifier for the element to click. Can be a selector, element text, ARIA name, ID, or test ID.
 */
export type ClickElementSimple1 = string;
export type ClickElementDetailed1 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition39 = string | [string, ...string[]];
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition40 = string | [string, ...string[]];
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing80 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing81 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing82 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing83 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * Find an element based on display text or a selector, then optionally interact with it.
 */
export type Find3 = FindElementSimple1 | FindElementDetailed1;
/**
 * Identifier for the element to find. Can be a selector, element text, ARIA name, ID, or test ID.
 */
export type FindElementSimple1 = string;
export type FindElementDetailed1 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition41 = string | [string, ...string[]];
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition42 = string | [string, ...string[]];
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing84 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing85 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing86 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing87 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
export type GoTo3 = GoToURLSimple1 | GoToURLDetailed1;
/**
 * Navigate to an HTTP or HTTPS URL. Can be a full URL or a path. If a path is provided, navigates relative to the current URL, if any.
 */
export type GoToURLSimple1 = string;
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition43 = string | [string, ...string[]];
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition44 = string | [string, ...string[]];
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing88 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing89 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing90 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing91 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * Perform a generic HTTP request, for example to an API.
 */
export type HttpRequest3 = HTTPRequestSimple1 | HTTPRequestDetailed1;
/**
 * URL for the HTTP request.
 */
export type HTTPRequestSimple1 = string;
export type HTTPRequestDetailed1 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition45 = string | [string, ...string[]];
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition46 = string | [string, ...string[]];
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing92 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing93 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing94 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing95 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * Perform a native shell command.
 */
export type RunShell3 = RunShellCommandSimple1 | RunShellCommandDetailed1;
/**
 * Command to perform in the machine's default shell.
 */
export type RunShellCommandSimple1 = string;
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition47 = string | [string, ...string[]];
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition48 = string | [string, ...string[]];
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing96 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing97 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing98 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing99 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * Assemble and run code.
 */
export type RunCode3 = RunCodeDetailed1;
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition49 = string | [string, ...string[]];
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition50 = string | [string, ...string[]];
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing100 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing101 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing102 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing103 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * Execute arbitrary JavaScript in the browser page context. Runs via the WebDriver `executeScript` endpoint, so it has access to the page's `document`, `window`, and DOM. Doc Detective captures the script's return value in the step's `outputs.result`. Distinct from `runCode`, which runs Node/Python/bash on the host machine.
 */
export type RunBrowserScript3 = RunBrowserScriptSimple1 | RunBrowserScriptDetailed1;
/**
 * JavaScript to evaluate in the browser page context. Supports `return` to capture a value into `outputs.result`.
 */
export type RunBrowserScriptSimple1 = string;
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition51 = string | [string, ...string[]];
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition52 = string | [string, ...string[]];
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing104 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing105 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing106 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing107 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * Type keys. To type special keys, begin and end the string with `$` and use the special key's keyword. For example, to type the Escape key, enter `$ESCAPE$`.
 */
export type TypeKeys1 = TypeKeysSimple2 | TypeKeysDetailed1;
/**
 * Sequence of keys to enter.
 */
export type TypeKeysSimple2 = string | string[];
/**
 * Sequence of keys to enter.
 */
export type TypeKeysSimple3 = string | string[];
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition53 = string | [string, ...string[]];
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition54 = string | [string, ...string[]];
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing108 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing109 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing110 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing111 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * Takes a screenshot in PNG format.
 */
export type Screenshot3 = ScreenshotSimple2 | CaptureScreenshotDetailed1 | CaptureScreenshot1;
/**
 * File path of the PNG file. Accepts absolute paths. If not specified, the file name is the ID of the step. If an `http(s)` URL is supplied, the remote image is downloaded and used as a read-only reference for comparison; the new capture is written to a local run-specific folder instead of being uploaded back to the URL.
 */
export type ScreenshotSimple2 = string;
/**
 * File path of the PNG file. Accepts absolute paths. If not specified, the file name is the ID of the step. If an `http(s)` URL is supplied, the remote image is downloaded and used as a read-only reference for comparison; the new capture is written to a local run-specific folder instead of being uploaded back to the URL.
 */
export type ScreenshotSimple3 = string;
/**
 * Display text or selector of the element to screenshot.
 */
export type CropByElementSimple1 = string;
/**
 * Crop the screenshot to a specific element.
 */
export type CropByElementDetailed1 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * If `true`, captures a screenshot. If `false`, doesn't capture a screenshot.
 */
export type CaptureScreenshot1 = boolean;
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition55 = string | [string, ...string[]];
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition56 = string | [string, ...string[]];
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing112 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing113 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing114 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing115 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * Save a specific browser cookie to a file or environment variable for later reuse.
 */
export type SaveCookie3 = CookieName1 | SaveCookieDetailed1;
/**
 * Name of the specific cookie to save. Will be saved to a default file path or environment variable.
 */
export type CookieName1 = string;
export type SaveCookieDetailed1 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition57 = string | [string, ...string[]];
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition58 = string | [string, ...string[]];
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing116 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing117 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing118 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing119 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * Start recording. Must be followed by a `stopRecord` step. The `browser` engine captures the Chrome viewport (works under concurrency); the `ffmpeg` engine captures the screen and supports any application. Supported extensions: [ '.mp4', '.webm', '.gif' ]
 */
export type Record3 = RecordSimple1 | RecordDetailed1 | RecordBoolean1;
/**
 * File path of the recording. Supports the `.mp4`, `.webm`, and `.gif` extensions. If not specified, the file name is the ID of the step, and the extension is `.mp4`.
 */
export type RecordSimple1 = string;
/**
 * Recording engine to use. Either a string shorthand selecting the engine with defaults, or an object for full control. If unset, defaults to the `browser` engine when a visible Chrome context is available and to `ffmpeg` otherwise.
 */
export type RecordingEngine1 = RecordingEngineSimple1 | RecordingEngineDetailed1;
/**
 * `browser` records the Chrome viewport (concurrency-safe); `ffmpeg` records the screen and supports any application.
 */
export type RecordingEngineSimple1 = "browser" | "ffmpeg";
/**
 * If `true`, starts recording — auto-selecting the `browser` engine for a visible Chrome context and the `ffmpeg` engine otherwise. If `false`, doesn't record.
 */
export type RecordBoolean1 = boolean;
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition59 = string | [string, ...string[]];
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition60 = string | [string, ...string[]];
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing120 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing121 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing122 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing123 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * Stop a recording started by an earlier `record` step. With no target (`true`/`null`), stops the most recently started recording that is still active (LIFO). To stop a specific recording when several overlap, target it by name with a string (`stopRecord: "<name>"`) or an object (`stopRecord: { name: "<name>" }`).
 */
export type StopRecord3 = StopRecordBoolean1 | StopRecordNull1 | StopRecordName1 | StopRecordDetailed1;
/**
 * If `true`, stops the most recently started active recording (LIFO). If `false`, does nothing — an explicit no-op (mirrors `record: false`).
 */
export type StopRecordBoolean1 = boolean;
/**
 * Stops the most recently started active recording (LIFO).
 */
export type StopRecordNull1 = null;
/**
 * Name of the recording to stop. Matches the `name` given to a `record` step.
 */
export type StopRecordName1 = string;
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition61 = string | [string, ...string[]];
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition62 = string | [string, ...string[]];
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing124 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing125 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing126 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing127 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * Load environment variables from the specified `.env` file.
 */
export type LoadVariables3 = string;
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition63 = string | [string, ...string[]];
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition64 = string | [string, ...string[]];
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing128 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing129 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing130 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing131 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * Display text, selector, or regex pattern (enclosed in forward slashes) of the element.
 */
export type ElementSimple2 = string;
export type ElementDetailed2 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * Display text, selector, or regex pattern (enclosed in forward slashes) of the element.
 */
export type ElementSimple3 = string;
export type ElementDetailed3 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition65 = string | [string, ...string[]];
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition66 = string | [string, ...string[]];
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing132 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing133 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing134 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing135 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * Load a specific cookie from a file or environment variable into the browser.
 */
export type LoadCookie3 = CookieNameOrFilePath1 | LoadCookieDetailed1;
/**
 * Name of the specific cookie to load from default location, or file path to cookie file.
 */
export type CookieNameOrFilePath1 = string;
export type LoadCookieDetailed1 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition67 = string | [string, ...string[]];
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition68 = string | [string, ...string[]];
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing136 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing137 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing138 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, and `retry` are evaluated at runtime; `goToStep` and `goToTest` are validated but not yet executed. Test-level handlers are validated but not yet evaluated.
 */
export type Routing139 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * Pause (in milliseconds) before performing the next action.
 */
export type Wait3 = WaitSimple1 | WaitEnvironmentVariable1 | WaitBoolean1;
export type WaitSimple1 = number;
export type WaitEnvironmentVariable1 = string;
export type WaitBoolean1 = boolean;
/**
 * Resolved contexts to run the test in. This is a resolved version of the `runOn` property. It is not user-defined and should not be used in test specifications.
 */
export type ResolvedContexts = ResolvedContext[];

/**
 * A context in which to perform tests. If no contexts are specified but a context is required by one or more tests, Doc Detective attempts to identify a supported context in the current environment and run tests against it. For example, if a browser isn't specified but is required by steps in the test, Doc Detective will search for and use a supported browser available in the current environment.
 */
export interface Context {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/context_v3.schema.json";
  /**
   * Unique identifier for the context.
   */
  contextId?: string;
  /**
   * Platforms to run tests on.
   */
  platforms?: ("linux" | "mac" | "windows") | ("linux" | "mac" | "windows")[];
  /**
   * Browsers to run tests on.
   */
  browsers?:
    | ("chrome" | "firefox" | "safari" | "webkit")
    | Browser
    | (("chrome" | "firefox" | "safari" | "webkit") | Browser1)[];
}
/**
 * Browser configuration.
 */
export interface Browser {
  /**
   * Name of the browser.
   */
  name: "chrome" | "firefox" | "safari" | "webkit";
  /**
   * If `true`, runs the browser in headless mode.
   */
  headless?: boolean;
  window?: BrowserWindow;
  viewport?: BrowserViewport;
}
/**
 * Browser dimensions.
 */
export interface BrowserWindow {
  /**
   * Width of the browser window in pixels.
   */
  width?: number;
  /**
   * Height of the browser window in pixels.
   */
  height?: number;
}
/**
 * Viewport dimensions.
 */
export interface BrowserViewport {
  /**
   * Width of the viewport in pixels.
   */
  width?: number;
  /**
   * Height of the viewport in pixels.
   */
  height?: number;
}
/**
 * Browser configuration.
 */
export interface Browser1 {
  /**
   * Name of the browser.
   */
  name: "chrome" | "firefox" | "safari" | "webkit";
  /**
   * If `true`, runs the browser in headless mode.
   */
  headless?: boolean;
  window?: BrowserWindow1;
  viewport?: BrowserViewport1;
}
/**
 * Browser dimensions.
 */
export interface BrowserWindow1 {
  /**
   * Width of the browser window in pixels.
   */
  width?: number;
  /**
   * Height of the browser window in pixels.
   */
  height?: number;
}
/**
 * Viewport dimensions.
 */
export interface BrowserViewport1 {
  /**
   * Width of the viewport in pixels.
   */
  width?: number;
  /**
   * Height of the viewport in pixels.
   */
  height?: number;
}
export interface OpenAPIDescriptionTest {
  [k: string]: unknown;
}
export interface Common {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep;
  variables?: VariablesStep;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  if?: Condition1;
  /**
   * Assertions for this step. As authored input, a custom condition expression (or array of expressions, combined with logical AND). In a test result, the runner replaces this with the array of articulated assertion records it evaluated (implicit then custom).
   */
  assertions?: Condition2 | Assertion[];
  /**
   * Routing entries evaluated when this step passes. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onPass?: Routing4[];
  /**
   * Routing entries evaluated when this step fails. The first entry whose `if` matches applies; the default when none is set stops the test. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onFail?: Routing5[];
  /**
   * Routing entries evaluated when this step produces a warning. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onWarning?: Routing6[];
  /**
   * Routing entries evaluated when this step is skipped (reached but not run — unsafe-blocked or guard-`if` false). The first entry whose `if` matches applies. `continue` and `stop` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed. (`retry` is a no-op here — a step that never ran cannot be re-run.)
   */
  onSkip?: Routing7[];
  location?: SourceLocation;
  /**
   * Path, relative to the run's artifact directory (the report's `runDir`), of the screenshot captured automatically after this step. Always a non-empty, forward-slash, relative path. Present only in test results, when `autoScreenshot` is enabled and the capture succeeded. This is system-populated metadata and should not be set manually.
   */
  autoScreenshot?: string;
  /**
   * Total number of times this step ran (the initial attempt plus retries) when a routing `retry` action re-ran it. Present only in test results, and only when the step was retried at least once (so the value is always >= 2). This is system-populated metadata and should not be set manually.
   */
  attempts?: number;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * An articulated assertion record produced by the runner for a step result. Each record names a single verification check, whether it passed, and the values it compared. The step's result is the roll-up of its assertion results (FAIL > WARNING > all-SKIPPED > PASS). System-populated; appears in test results, not in authored specs.
 */
export interface Assertion {
  /**
   * Human-readable articulation of the check, e.g. `exitCode in [0]`.
   */
  statement: string;
  /**
   * Who defined the assertion: `implicit` (runner-defined) or `custom` (user-defined).
   */
  source: "implicit" | "custom";
  /**
   * Outcome of evaluating the assertion.
   */
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  /**
   * The value (or values) the assertion expected. Optional.
   */
  expected?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * The value actually observed. Optional.
   */
  actual?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * Human-readable explanation of the outcome. Optional.
   */
  description?: string;
}
/**
 * Source location where this step was detected in the original file. This is system-populated metadata and should not be set manually.
 */
export interface SourceLocation {
  /**
   * 1-indexed line number in the source file where the step was detected.
   */
  line: number;
  /**
   * 0-indexed character offset from the start of the source file where the step begins.
   */
  startIndex: number;
  /**
   * 0-indexed character offset from the start of the source file where the step ends (exclusive).
   */
  endIndex: number;
}
export interface CheckLink {
  checkLink: CheckLink1;
  [k: string]: unknown;
}
/**
 * Check if an HTTP or HTTPS URL returns an acceptable status code from a GET request.
 */
export interface CheckLinkDetailed1 {
  /**
   * URL to check. Can be a full URL or a path. If a path is provided, `origin` must be specified.
   */
  url: string;
  /**
   * Protocol and domain to navigate to. Prepended to `url`.
   */
  origin?: string;
  /**
   * Query parameters to append to the resolved URL. Merged on top of `originParams` from config; step keys win on collision. If `url` already contains a colliding query key, the value here replaces it. Values support environment variable substitution via `$VAR` syntax. WARNING: values are embedded in the request URL and appear in test results, logs, and reports.
   */
  params?: {
    [k: string]: string;
  };
  /**
   * Accepted status codes. If the specified URL returns a code other than what is specified here, the action fails.
   */
  statusCodes?: number | number[];
  /**
   * Additional HTTP headers to include in the request. Merged on top of Doc Detective's default browser-mimicking headers. Useful for sites behind bot protection or WAFs that allowlist specific headers (for example, a Cloudflare Access service token or a `Cookie` with a `cf_clearance` value).
   */
  headers?: RequestHeadersObject | RequestHeadersString;
}
/**
 * Headers to include in the HTTP request, in key/value format. Values must be strings.
 */
export interface RequestHeadersObject {
  [k: string]: string;
}
export interface Common1 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep1;
  variables?: VariablesStep1;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  if?: Condition3;
  /**
   * Assertions for this step. As authored input, a custom condition expression (or array of expressions, combined with logical AND). In a test result, the runner replaces this with the array of articulated assertion records it evaluated (implicit then custom).
   */
  assertions?: Condition4 | Assertion1[];
  /**
   * Routing entries evaluated when this step passes. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onPass?: Routing8[];
  /**
   * Routing entries evaluated when this step fails. The first entry whose `if` matches applies; the default when none is set stops the test. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onFail?: Routing9[];
  /**
   * Routing entries evaluated when this step produces a warning. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onWarning?: Routing10[];
  /**
   * Routing entries evaluated when this step is skipped (reached but not run — unsafe-blocked or guard-`if` false). The first entry whose `if` matches applies. `continue` and `stop` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed. (`retry` is a no-op here — a step that never ran cannot be re-run.)
   */
  onSkip?: Routing11[];
  location?: SourceLocation1;
  /**
   * Path, relative to the run's artifact directory (the report's `runDir`), of the screenshot captured automatically after this step. Always a non-empty, forward-slash, relative path. Present only in test results, when `autoScreenshot` is enabled and the capture succeeded. This is system-populated metadata and should not be set manually.
   */
  autoScreenshot?: string;
  /**
   * Total number of times this step ran (the initial attempt plus retries) when a routing `retry` action re-ran it. Present only in test results, and only when the step was retried at least once (so the value is always >= 2). This is system-populated metadata and should not be set manually.
   */
  attempts?: number;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep1 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep1`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep1 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep1`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * An articulated assertion record produced by the runner for a step result. Each record names a single verification check, whether it passed, and the values it compared. The step's result is the roll-up of its assertion results (FAIL > WARNING > all-SKIPPED > PASS). System-populated; appears in test results, not in authored specs.
 */
export interface Assertion1 {
  /**
   * Human-readable articulation of the check, e.g. `exitCode in [0]`.
   */
  statement: string;
  /**
   * Who defined the assertion: `implicit` (runner-defined) or `custom` (user-defined).
   */
  source: "implicit" | "custom";
  /**
   * Outcome of evaluating the assertion.
   */
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  /**
   * The value (or values) the assertion expected. Optional.
   */
  expected?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * The value actually observed. Optional.
   */
  actual?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * Human-readable explanation of the outcome. Optional.
   */
  description?: string;
}
/**
 * Source location where this step was detected in the original file. This is system-populated metadata and should not be set manually.
 */
export interface SourceLocation1 {
  /**
   * 1-indexed line number in the source file where the step was detected.
   */
  line: number;
  /**
   * 0-indexed character offset from the start of the source file where the step begins.
   */
  startIndex: number;
  /**
   * 0-indexed character offset from the start of the source file where the step ends (exclusive).
   */
  endIndex: number;
}
export interface Click {
  click: Click1;
  [k: string]: unknown;
}
export interface Common2 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep2;
  variables?: VariablesStep2;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  if?: Condition5;
  /**
   * Assertions for this step. As authored input, a custom condition expression (or array of expressions, combined with logical AND). In a test result, the runner replaces this with the array of articulated assertion records it evaluated (implicit then custom).
   */
  assertions?: Condition6 | Assertion2[];
  /**
   * Routing entries evaluated when this step passes. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onPass?: Routing12[];
  /**
   * Routing entries evaluated when this step fails. The first entry whose `if` matches applies; the default when none is set stops the test. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onFail?: Routing13[];
  /**
   * Routing entries evaluated when this step produces a warning. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onWarning?: Routing14[];
  /**
   * Routing entries evaluated when this step is skipped (reached but not run — unsafe-blocked or guard-`if` false). The first entry whose `if` matches applies. `continue` and `stop` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed. (`retry` is a no-op here — a step that never ran cannot be re-run.)
   */
  onSkip?: Routing15[];
  location?: SourceLocation2;
  /**
   * Path, relative to the run's artifact directory (the report's `runDir`), of the screenshot captured automatically after this step. Always a non-empty, forward-slash, relative path. Present only in test results, when `autoScreenshot` is enabled and the capture succeeded. This is system-populated metadata and should not be set manually.
   */
  autoScreenshot?: string;
  /**
   * Total number of times this step ran (the initial attempt plus retries) when a routing `retry` action re-ran it. Present only in test results, and only when the step was retried at least once (so the value is always >= 2). This is system-populated metadata and should not be set manually.
   */
  attempts?: number;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep2 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep2`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep2 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep2`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * An articulated assertion record produced by the runner for a step result. Each record names a single verification check, whether it passed, and the values it compared. The step's result is the roll-up of its assertion results (FAIL > WARNING > all-SKIPPED > PASS). System-populated; appears in test results, not in authored specs.
 */
export interface Assertion2 {
  /**
   * Human-readable articulation of the check, e.g. `exitCode in [0]`.
   */
  statement: string;
  /**
   * Who defined the assertion: `implicit` (runner-defined) or `custom` (user-defined).
   */
  source: "implicit" | "custom";
  /**
   * Outcome of evaluating the assertion.
   */
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  /**
   * The value (or values) the assertion expected. Optional.
   */
  expected?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * The value actually observed. Optional.
   */
  actual?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * Human-readable explanation of the outcome. Optional.
   */
  description?: string;
}
/**
 * Source location where this step was detected in the original file. This is system-populated metadata and should not be set manually.
 */
export interface SourceLocation2 {
  /**
   * 1-indexed line number in the source file where the step was detected.
   */
  line: number;
  /**
   * 0-indexed character offset from the start of the source file where the step begins.
   */
  startIndex: number;
  /**
   * 0-indexed character offset from the start of the source file where the step ends (exclusive).
   */
  endIndex: number;
}
export interface Find {
  find: Find1;
  [k: string]: unknown;
}
export interface Common3 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep3;
  variables?: VariablesStep3;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  if?: Condition7;
  /**
   * Assertions for this step. As authored input, a custom condition expression (or array of expressions, combined with logical AND). In a test result, the runner replaces this with the array of articulated assertion records it evaluated (implicit then custom).
   */
  assertions?: Condition8 | Assertion3[];
  /**
   * Routing entries evaluated when this step passes. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onPass?: Routing16[];
  /**
   * Routing entries evaluated when this step fails. The first entry whose `if` matches applies; the default when none is set stops the test. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onFail?: Routing17[];
  /**
   * Routing entries evaluated when this step produces a warning. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onWarning?: Routing18[];
  /**
   * Routing entries evaluated when this step is skipped (reached but not run — unsafe-blocked or guard-`if` false). The first entry whose `if` matches applies. `continue` and `stop` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed. (`retry` is a no-op here — a step that never ran cannot be re-run.)
   */
  onSkip?: Routing19[];
  location?: SourceLocation3;
  /**
   * Path, relative to the run's artifact directory (the report's `runDir`), of the screenshot captured automatically after this step. Always a non-empty, forward-slash, relative path. Present only in test results, when `autoScreenshot` is enabled and the capture succeeded. This is system-populated metadata and should not be set manually.
   */
  autoScreenshot?: string;
  /**
   * Total number of times this step ran (the initial attempt plus retries) when a routing `retry` action re-ran it. Present only in test results, and only when the step was retried at least once (so the value is always >= 2). This is system-populated metadata and should not be set manually.
   */
  attempts?: number;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep3 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep3`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep3 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep3`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * An articulated assertion record produced by the runner for a step result. Each record names a single verification check, whether it passed, and the values it compared. The step's result is the roll-up of its assertion results (FAIL > WARNING > all-SKIPPED > PASS). System-populated; appears in test results, not in authored specs.
 */
export interface Assertion3 {
  /**
   * Human-readable articulation of the check, e.g. `exitCode in [0]`.
   */
  statement: string;
  /**
   * Who defined the assertion: `implicit` (runner-defined) or `custom` (user-defined).
   */
  source: "implicit" | "custom";
  /**
   * Outcome of evaluating the assertion.
   */
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  /**
   * The value (or values) the assertion expected. Optional.
   */
  expected?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * The value actually observed. Optional.
   */
  actual?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * Human-readable explanation of the outcome. Optional.
   */
  description?: string;
}
/**
 * Source location where this step was detected in the original file. This is system-populated metadata and should not be set manually.
 */
export interface SourceLocation3 {
  /**
   * 1-indexed line number in the source file where the step was detected.
   */
  line: number;
  /**
   * 0-indexed character offset from the start of the source file where the step begins.
   */
  startIndex: number;
  /**
   * 0-indexed character offset from the start of the source file where the step ends (exclusive).
   */
  endIndex: number;
}
export interface GoTo {
  goTo: GoTo1;
  [k: string]: unknown;
}
/**
 * Navigate to an HTTP or HTTPS URL.
 */
export interface GoToURLDetailed {
  /**
   * URL to navigate to. Can be a full URL or a path. If a path is provided and `origin` is specified, prepends `origin` to `url`. If a path is provided but `origin` isn't specified, attempts to navigate relative to the current URL, if any.
   */
  url: string;
  /**
   * Protocol and domain to navigate to. Prepended to `url`.
   */
  origin?: string;
  /**
   * Query parameters to append to the resolved URL. Merged on top of `originParams` from config; step keys win on collision. If `url` already contains a colliding query key, the value here replaces it. Values support environment variable substitution via `$VAR` syntax. WARNING: values are embedded in the request URL and appear in test results, logs, and reports.
   */
  params?: {
    [k: string]: string;
  };
  /**
   * Maximum time in milliseconds to wait for the page to be ready. If exceeded, the goTo action fails.
   */
  timeout?: number;
  /**
   * Configuration for waiting conditions after navigation.
   */
  waitUntil?: {
    /**
     * Wait for network activity to be idle (no new requests) for this duration in milliseconds. Set to `null` to skip this check.
     */
    networkIdleTime?: number | null;
    /**
     * Wait for DOM mutations to stop for this duration in milliseconds. Set to `null` to skip this check.
     */
    domIdleTime?: number | null;
    /**
     * Wait for a specific element to be present in the DOM. At least one of selector or elementText must be specified.
     */
    find?:
      | {
          [k: string]: unknown;
        }
      | {
          [k: string]: unknown;
        }
      | {
          [k: string]: unknown;
        }
      | {
          [k: string]: unknown;
        }
      | {
          [k: string]: unknown;
        }
      | {
          [k: string]: unknown;
        }
      | {
          [k: string]: unknown;
        };
  };
}
export interface Common4 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep4;
  variables?: VariablesStep4;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  if?: Condition9;
  /**
   * Assertions for this step. As authored input, a custom condition expression (or array of expressions, combined with logical AND). In a test result, the runner replaces this with the array of articulated assertion records it evaluated (implicit then custom).
   */
  assertions?: Condition10 | Assertion4[];
  /**
   * Routing entries evaluated when this step passes. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onPass?: Routing20[];
  /**
   * Routing entries evaluated when this step fails. The first entry whose `if` matches applies; the default when none is set stops the test. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onFail?: Routing21[];
  /**
   * Routing entries evaluated when this step produces a warning. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onWarning?: Routing22[];
  /**
   * Routing entries evaluated when this step is skipped (reached but not run — unsafe-blocked or guard-`if` false). The first entry whose `if` matches applies. `continue` and `stop` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed. (`retry` is a no-op here — a step that never ran cannot be re-run.)
   */
  onSkip?: Routing23[];
  location?: SourceLocation4;
  /**
   * Path, relative to the run's artifact directory (the report's `runDir`), of the screenshot captured automatically after this step. Always a non-empty, forward-slash, relative path. Present only in test results, when `autoScreenshot` is enabled and the capture succeeded. This is system-populated metadata and should not be set manually.
   */
  autoScreenshot?: string;
  /**
   * Total number of times this step ran (the initial attempt plus retries) when a routing `retry` action re-ran it. Present only in test results, and only when the step was retried at least once (so the value is always >= 2). This is system-populated metadata and should not be set manually.
   */
  attempts?: number;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep4 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep4`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep4 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep4`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * An articulated assertion record produced by the runner for a step result. Each record names a single verification check, whether it passed, and the values it compared. The step's result is the roll-up of its assertion results (FAIL > WARNING > all-SKIPPED > PASS). System-populated; appears in test results, not in authored specs.
 */
export interface Assertion4 {
  /**
   * Human-readable articulation of the check, e.g. `exitCode in [0]`.
   */
  statement: string;
  /**
   * Who defined the assertion: `implicit` (runner-defined) or `custom` (user-defined).
   */
  source: "implicit" | "custom";
  /**
   * Outcome of evaluating the assertion.
   */
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  /**
   * The value (or values) the assertion expected. Optional.
   */
  expected?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * The value actually observed. Optional.
   */
  actual?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * Human-readable explanation of the outcome. Optional.
   */
  description?: string;
}
/**
 * Source location where this step was detected in the original file. This is system-populated metadata and should not be set manually.
 */
export interface SourceLocation4 {
  /**
   * 1-indexed line number in the source file where the step was detected.
   */
  line: number;
  /**
   * 0-indexed character offset from the start of the source file where the step begins.
   */
  startIndex: number;
  /**
   * 0-indexed character offset from the start of the source file where the step ends (exclusive).
   */
  endIndex: number;
}
export interface HttpRequest {
  httpRequest: HttpRequest1;
  [k: string]: unknown;
}
export interface Common5 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep5;
  variables?: VariablesStep5;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  if?: Condition11;
  /**
   * Assertions for this step. As authored input, a custom condition expression (or array of expressions, combined with logical AND). In a test result, the runner replaces this with the array of articulated assertion records it evaluated (implicit then custom).
   */
  assertions?: Condition12 | Assertion5[];
  /**
   * Routing entries evaluated when this step passes. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onPass?: Routing24[];
  /**
   * Routing entries evaluated when this step fails. The first entry whose `if` matches applies; the default when none is set stops the test. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onFail?: Routing25[];
  /**
   * Routing entries evaluated when this step produces a warning. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onWarning?: Routing26[];
  /**
   * Routing entries evaluated when this step is skipped (reached but not run — unsafe-blocked or guard-`if` false). The first entry whose `if` matches applies. `continue` and `stop` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed. (`retry` is a no-op here — a step that never ran cannot be re-run.)
   */
  onSkip?: Routing27[];
  location?: SourceLocation5;
  /**
   * Path, relative to the run's artifact directory (the report's `runDir`), of the screenshot captured automatically after this step. Always a non-empty, forward-slash, relative path. Present only in test results, when `autoScreenshot` is enabled and the capture succeeded. This is system-populated metadata and should not be set manually.
   */
  autoScreenshot?: string;
  /**
   * Total number of times this step ran (the initial attempt plus retries) when a routing `retry` action re-ran it. Present only in test results, and only when the step was retried at least once (so the value is always >= 2). This is system-populated metadata and should not be set manually.
   */
  attempts?: number;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep5 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep5`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep5 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep5`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * An articulated assertion record produced by the runner for a step result. Each record names a single verification check, whether it passed, and the values it compared. The step's result is the roll-up of its assertion results (FAIL > WARNING > all-SKIPPED > PASS). System-populated; appears in test results, not in authored specs.
 */
export interface Assertion5 {
  /**
   * Human-readable articulation of the check, e.g. `exitCode in [0]`.
   */
  statement: string;
  /**
   * Who defined the assertion: `implicit` (runner-defined) or `custom` (user-defined).
   */
  source: "implicit" | "custom";
  /**
   * Outcome of evaluating the assertion.
   */
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  /**
   * The value (or values) the assertion expected. Optional.
   */
  expected?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * The value actually observed. Optional.
   */
  actual?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * Human-readable explanation of the outcome. Optional.
   */
  description?: string;
}
/**
 * Source location where this step was detected in the original file. This is system-populated metadata and should not be set manually.
 */
export interface SourceLocation5 {
  /**
   * 1-indexed line number in the source file where the step was detected.
   */
  line: number;
  /**
   * 0-indexed character offset from the start of the source file where the step begins.
   */
  startIndex: number;
  /**
   * 0-indexed character offset from the start of the source file where the step ends (exclusive).
   */
  endIndex: number;
}
export interface RunShell {
  runShell: RunShell1;
  [k: string]: unknown;
}
export interface RunShellCommandDetailed {
  /**
   * Command to perform in the machine's default shell.
   */
  command: string;
  /**
   * Arguments for the command.
   */
  args?: string[];
  /**
   * Working directory for the command.
   */
  workingDirectory?: string;
  /**
   * Expected exit codes of the command. If the command's actual exit code isn't in this list, the step fails.
   */
  exitCodes?: number[];
  /**
   * Content expected in the command's stdout or stderr. If the expected content can't be found in the command's stdout or stderr, the step fails. Supports strings and regular expressions. To use a regular expression, the string must start and end with a forward slash, like in `/^hello-world.* /`.
   */
  stdio?: string;
  /**
   * File path to save the command's output, relative to `directory`.
   */
  path?: string;
  /**
   * Directory to save the command's output. If the directory doesn't exist, creates the directory. If not specified, the directory is your media directory.
   */
  directory?: string;
  /**
   * Allowed variation as a fraction (0 to 1) of text different between the current output and previously saved output. For example, 0.1 means 10%. If the difference between the current output and the previous output is greater than `maxVariation`, the step fails. If output doesn't exist at `path`, this value is ignored.
   */
  maxVariation?: number;
  /**
   * If `true`, overwrites the existing output at `path` if it exists.
   * If `aboveVariation`, overwrites the existing output at `path` if the difference between the new output and the existing output is greater than `maxVariation`.
   */
  overwrite?: "true" | "false" | "aboveVariation";
  /**
   * Max time in milliseconds the command is allowed to run. If the command runs longer than this, the step fails.
   */
  timeout?: number;
}
export interface Common6 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep6;
  variables?: VariablesStep6;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  if?: Condition13;
  /**
   * Assertions for this step. As authored input, a custom condition expression (or array of expressions, combined with logical AND). In a test result, the runner replaces this with the array of articulated assertion records it evaluated (implicit then custom).
   */
  assertions?: Condition14 | Assertion6[];
  /**
   * Routing entries evaluated when this step passes. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onPass?: Routing28[];
  /**
   * Routing entries evaluated when this step fails. The first entry whose `if` matches applies; the default when none is set stops the test. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onFail?: Routing29[];
  /**
   * Routing entries evaluated when this step produces a warning. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onWarning?: Routing30[];
  /**
   * Routing entries evaluated when this step is skipped (reached but not run — unsafe-blocked or guard-`if` false). The first entry whose `if` matches applies. `continue` and `stop` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed. (`retry` is a no-op here — a step that never ran cannot be re-run.)
   */
  onSkip?: Routing31[];
  location?: SourceLocation6;
  /**
   * Path, relative to the run's artifact directory (the report's `runDir`), of the screenshot captured automatically after this step. Always a non-empty, forward-slash, relative path. Present only in test results, when `autoScreenshot` is enabled and the capture succeeded. This is system-populated metadata and should not be set manually.
   */
  autoScreenshot?: string;
  /**
   * Total number of times this step ran (the initial attempt plus retries) when a routing `retry` action re-ran it. Present only in test results, and only when the step was retried at least once (so the value is always >= 2). This is system-populated metadata and should not be set manually.
   */
  attempts?: number;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep6 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep6`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep6 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep6`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * An articulated assertion record produced by the runner for a step result. Each record names a single verification check, whether it passed, and the values it compared. The step's result is the roll-up of its assertion results (FAIL > WARNING > all-SKIPPED > PASS). System-populated; appears in test results, not in authored specs.
 */
export interface Assertion6 {
  /**
   * Human-readable articulation of the check, e.g. `exitCode in [0]`.
   */
  statement: string;
  /**
   * Who defined the assertion: `implicit` (runner-defined) or `custom` (user-defined).
   */
  source: "implicit" | "custom";
  /**
   * Outcome of evaluating the assertion.
   */
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  /**
   * The value (or values) the assertion expected. Optional.
   */
  expected?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * The value actually observed. Optional.
   */
  actual?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * Human-readable explanation of the outcome. Optional.
   */
  description?: string;
}
/**
 * Source location where this step was detected in the original file. This is system-populated metadata and should not be set manually.
 */
export interface SourceLocation6 {
  /**
   * 1-indexed line number in the source file where the step was detected.
   */
  line: number;
  /**
   * 0-indexed character offset from the start of the source file where the step begins.
   */
  startIndex: number;
  /**
   * 0-indexed character offset from the start of the source file where the step ends (exclusive).
   */
  endIndex: number;
}
export interface RunCode {
  runCode: RunCode1;
  [k: string]: unknown;
}
export interface RunCodeDetailed {
  /**
   * Language of the code to run.
   */
  language: "python" | "bash" | "javascript";
  /**
   * Code to run.
   */
  code: string;
  /**
   * Arguments for the command.
   */
  args?: string[];
  /**
   * Working directory for the command.
   */
  workingDirectory?: string;
  /**
   * Expected exit codes of the command. If the command's actual exit code isn't in this list, the step fails.
   */
  exitCodes?: number[];
  /**
   * Content expected in the command's output. If the expected content can't be found in the command's output (either stdout or stderr), the step fails. Supports strings and regular expressions. To use a regular expression, the string must start and end with a forward slash, like in `/^hello-world.* /`.
   */
  stdio?: string;
  /**
   * File path to save the command's output, relative to `directory`.
   */
  path?: string;
  /**
   * Directory to save the command's output. If the directory doesn't exist, creates the directory. If not specified, the directory is your media directory.
   */
  directory?: string;
  /**
   * Allowed variation as a fraction (0 to 1) of text different between the current output and previously saved output. For example, 0.1 means 10%. If the difference between the current output and the previous output is greater than `maxVariation`, the step fails. If output doesn't exist at `path`, this value is ignored.
   */
  maxVariation?: number;
  /**
   * If `true`, overwrites the existing output at `path` if it exists.
   * If `aboveVariation`, overwrites the existing output at `path` if the difference between the new output and the existing output is greater than `maxVariation`.
   */
  overwrite?: "true" | "false" | "aboveVariation";
  /**
   * Max time in milliseconds the command is allowed to run. If the command runs longer than this, the step fails.
   */
  timeout?: number;
  [k: string]: unknown;
}
export interface Common7 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep7;
  variables?: VariablesStep7;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  if?: Condition15;
  /**
   * Assertions for this step. As authored input, a custom condition expression (or array of expressions, combined with logical AND). In a test result, the runner replaces this with the array of articulated assertion records it evaluated (implicit then custom).
   */
  assertions?: Condition16 | Assertion7[];
  /**
   * Routing entries evaluated when this step passes. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onPass?: Routing32[];
  /**
   * Routing entries evaluated when this step fails. The first entry whose `if` matches applies; the default when none is set stops the test. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onFail?: Routing33[];
  /**
   * Routing entries evaluated when this step produces a warning. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onWarning?: Routing34[];
  /**
   * Routing entries evaluated when this step is skipped (reached but not run — unsafe-blocked or guard-`if` false). The first entry whose `if` matches applies. `continue` and `stop` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed. (`retry` is a no-op here — a step that never ran cannot be re-run.)
   */
  onSkip?: Routing35[];
  location?: SourceLocation7;
  /**
   * Path, relative to the run's artifact directory (the report's `runDir`), of the screenshot captured automatically after this step. Always a non-empty, forward-slash, relative path. Present only in test results, when `autoScreenshot` is enabled and the capture succeeded. This is system-populated metadata and should not be set manually.
   */
  autoScreenshot?: string;
  /**
   * Total number of times this step ran (the initial attempt plus retries) when a routing `retry` action re-ran it. Present only in test results, and only when the step was retried at least once (so the value is always >= 2). This is system-populated metadata and should not be set manually.
   */
  attempts?: number;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep7 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep7`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep7 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep7`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * An articulated assertion record produced by the runner for a step result. Each record names a single verification check, whether it passed, and the values it compared. The step's result is the roll-up of its assertion results (FAIL > WARNING > all-SKIPPED > PASS). System-populated; appears in test results, not in authored specs.
 */
export interface Assertion7 {
  /**
   * Human-readable articulation of the check, e.g. `exitCode in [0]`.
   */
  statement: string;
  /**
   * Who defined the assertion: `implicit` (runner-defined) or `custom` (user-defined).
   */
  source: "implicit" | "custom";
  /**
   * Outcome of evaluating the assertion.
   */
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  /**
   * The value (or values) the assertion expected. Optional.
   */
  expected?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * The value actually observed. Optional.
   */
  actual?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * Human-readable explanation of the outcome. Optional.
   */
  description?: string;
}
/**
 * Source location where this step was detected in the original file. This is system-populated metadata and should not be set manually.
 */
export interface SourceLocation7 {
  /**
   * 1-indexed line number in the source file where the step was detected.
   */
  line: number;
  /**
   * 0-indexed character offset from the start of the source file where the step begins.
   */
  startIndex: number;
  /**
   * 0-indexed character offset from the start of the source file where the step ends (exclusive).
   */
  endIndex: number;
}
export interface RunBrowserScript {
  runBrowserScript: RunBrowserScript1;
  [k: string]: unknown;
}
export interface RunBrowserScriptDetailed {
  /**
   * JavaScript to evaluate in the browser page context. Supports `return` to capture a value into `outputs.result`. The script reads arguments supplied in `args` through the `arguments` object (`arguments[0]`, `arguments[1]`, and so on).
   */
  script: string;
  /**
   * Arguments passed positionally to the script and exposed through the `arguments` object. Each item may be any JSON-serializable value (string, number, boolean, null, object, or array), matching what `executeScript` accepts.
   */
  args?: unknown[];
  /**
   * Content expected in the script's serialized return value. Doc Detective serializes non-string return values to JSON before matching. If the serialized return value doesn't contain the expected content, the step fails. Supports strings and regular expressions. To use a regular expression, the string must start and end with a forward slash, like in `/^hello-world.* /`.
   */
  output?: string;
  /**
   * File path to save the script's serialized return value, relative to `directory`.
   */
  path?: string;
  /**
   * Directory to save the script's return value. If the directory doesn't exist, creates the directory. If not specified, the directory is your media directory.
   */
  directory?: string;
  /**
   * Allowed variation as a fraction (0 to 1) of text different between the current return value and previously saved value. For example, 0.1 means 10%. If the difference between the current value and the previous value is greater than `maxVariation`, the step returns a warning. If no output exists at `path`, Doc Detective ignores this value.
   */
  maxVariation?: number;
  /**
   * If `true`, overwrites the existing output at `path` if it exists.
   * If `aboveVariation`, overwrites the existing output at `path` if the difference between the new output and the existing output is greater than `maxVariation`.
   */
  overwrite?: "true" | "false" | "aboveVariation";
  /**
   * Maximum time in milliseconds the script may run. If the script runs longer than this, the step fails.
   */
  timeout?: number;
}
export interface Common8 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep8;
  variables?: VariablesStep8;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  if?: Condition17;
  /**
   * Assertions for this step. As authored input, a custom condition expression (or array of expressions, combined with logical AND). In a test result, the runner replaces this with the array of articulated assertion records it evaluated (implicit then custom).
   */
  assertions?: Condition18 | Assertion8[];
  /**
   * Routing entries evaluated when this step passes. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onPass?: Routing36[];
  /**
   * Routing entries evaluated when this step fails. The first entry whose `if` matches applies; the default when none is set stops the test. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onFail?: Routing37[];
  /**
   * Routing entries evaluated when this step produces a warning. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onWarning?: Routing38[];
  /**
   * Routing entries evaluated when this step is skipped (reached but not run — unsafe-blocked or guard-`if` false). The first entry whose `if` matches applies. `continue` and `stop` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed. (`retry` is a no-op here — a step that never ran cannot be re-run.)
   */
  onSkip?: Routing39[];
  location?: SourceLocation8;
  /**
   * Path, relative to the run's artifact directory (the report's `runDir`), of the screenshot captured automatically after this step. Always a non-empty, forward-slash, relative path. Present only in test results, when `autoScreenshot` is enabled and the capture succeeded. This is system-populated metadata and should not be set manually.
   */
  autoScreenshot?: string;
  /**
   * Total number of times this step ran (the initial attempt plus retries) when a routing `retry` action re-ran it. Present only in test results, and only when the step was retried at least once (so the value is always >= 2). This is system-populated metadata and should not be set manually.
   */
  attempts?: number;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep8 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep8`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep8 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep8`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * An articulated assertion record produced by the runner for a step result. Each record names a single verification check, whether it passed, and the values it compared. The step's result is the roll-up of its assertion results (FAIL > WARNING > all-SKIPPED > PASS). System-populated; appears in test results, not in authored specs.
 */
export interface Assertion8 {
  /**
   * Human-readable articulation of the check, e.g. `exitCode in [0]`.
   */
  statement: string;
  /**
   * Who defined the assertion: `implicit` (runner-defined) or `custom` (user-defined).
   */
  source: "implicit" | "custom";
  /**
   * Outcome of evaluating the assertion.
   */
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  /**
   * The value (or values) the assertion expected. Optional.
   */
  expected?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * The value actually observed. Optional.
   */
  actual?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * Human-readable explanation of the outcome. Optional.
   */
  description?: string;
}
/**
 * Source location where this step was detected in the original file. This is system-populated metadata and should not be set manually.
 */
export interface SourceLocation8 {
  /**
   * 1-indexed line number in the source file where the step was detected.
   */
  line: number;
  /**
   * 0-indexed character offset from the start of the source file where the step begins.
   */
  startIndex: number;
  /**
   * 0-indexed character offset from the start of the source file where the step ends (exclusive).
   */
  endIndex: number;
}
export interface Type {
  type: TypeKeys;
  [k: string]: unknown;
}
export interface TypeKeysDetailed {
  keys: TypeKeysSimple1;
  /**
   * Delay in milliseconds between each key press during a recording
   */
  inputDelay?: number;
  /**
   * Selector for the element to type into. If not specified, the typing occurs in the active element.
   */
  selector?: string;
  /**
   * Display text of the element to type into. If combined with other element finding fields, the element must match all specified criteria.
   */
  elementText?: string;
  /**
   * ID attribute of the element to find. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementId?: string;
  /**
   * data-testid attribute of the element to find. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementTestId?: string;
  /**
   * Class or array of classes that the element must have. Each class supports exact match or regex pattern using /pattern/ syntax. Element must have all specified classes.
   */
  elementClass?: string | string[];
  /**
   * Object of attribute key-value pairs that the element must have. Values can be strings (supporting /pattern/ regex), numbers, or booleans. Boolean true matches attribute presence, false matches absence.
   */
  elementAttribute?: {
    [k: string]: string | number | boolean;
  };
  /**
   * Computed accessible name of the element per ARIA specification. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementAria?: string;
}
export interface Common9 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep9;
  variables?: VariablesStep9;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  if?: Condition19;
  /**
   * Assertions for this step. As authored input, a custom condition expression (or array of expressions, combined with logical AND). In a test result, the runner replaces this with the array of articulated assertion records it evaluated (implicit then custom).
   */
  assertions?: Condition20 | Assertion9[];
  /**
   * Routing entries evaluated when this step passes. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onPass?: Routing40[];
  /**
   * Routing entries evaluated when this step fails. The first entry whose `if` matches applies; the default when none is set stops the test. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onFail?: Routing41[];
  /**
   * Routing entries evaluated when this step produces a warning. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onWarning?: Routing42[];
  /**
   * Routing entries evaluated when this step is skipped (reached but not run — unsafe-blocked or guard-`if` false). The first entry whose `if` matches applies. `continue` and `stop` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed. (`retry` is a no-op here — a step that never ran cannot be re-run.)
   */
  onSkip?: Routing43[];
  location?: SourceLocation9;
  /**
   * Path, relative to the run's artifact directory (the report's `runDir`), of the screenshot captured automatically after this step. Always a non-empty, forward-slash, relative path. Present only in test results, when `autoScreenshot` is enabled and the capture succeeded. This is system-populated metadata and should not be set manually.
   */
  autoScreenshot?: string;
  /**
   * Total number of times this step ran (the initial attempt plus retries) when a routing `retry` action re-ran it. Present only in test results, and only when the step was retried at least once (so the value is always >= 2). This is system-populated metadata and should not be set manually.
   */
  attempts?: number;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep9 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep9`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep9 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep9`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * An articulated assertion record produced by the runner for a step result. Each record names a single verification check, whether it passed, and the values it compared. The step's result is the roll-up of its assertion results (FAIL > WARNING > all-SKIPPED > PASS). System-populated; appears in test results, not in authored specs.
 */
export interface Assertion9 {
  /**
   * Human-readable articulation of the check, e.g. `exitCode in [0]`.
   */
  statement: string;
  /**
   * Who defined the assertion: `implicit` (runner-defined) or `custom` (user-defined).
   */
  source: "implicit" | "custom";
  /**
   * Outcome of evaluating the assertion.
   */
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  /**
   * The value (or values) the assertion expected. Optional.
   */
  expected?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * The value actually observed. Optional.
   */
  actual?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * Human-readable explanation of the outcome. Optional.
   */
  description?: string;
}
/**
 * Source location where this step was detected in the original file. This is system-populated metadata and should not be set manually.
 */
export interface SourceLocation9 {
  /**
   * 1-indexed line number in the source file where the step was detected.
   */
  line: number;
  /**
   * 0-indexed character offset from the start of the source file where the step begins.
   */
  startIndex: number;
  /**
   * 0-indexed character offset from the start of the source file where the step ends (exclusive).
   */
  endIndex: number;
}
export interface Screenshot {
  screenshot: Screenshot1;
  [k: string]: unknown;
}
export interface CaptureScreenshotDetailed {
  path?: ScreenshotSimple1;
  /**
   * Directory of the PNG file. If the directory doesn't exist, creates the directory.
   */
  directory?: string;
  /**
   * Allowed variation in percentage of pixels between the new screenshot and the existing screenshot at `path`. If the difference between the new screenshot and the existing screenshot is greater than `maxVariation`, the step fails. If a screenshot doesn't exist at `path`, this value is ignored.
   */
  maxVariation?: number;
  /**
   * If `true`, overwrites the existing screenshot at `path` if it exists.
   * If `aboveVariation`, overwrites the existing screenshot at `path` if the difference between the new screenshot and the existing screenshot is greater than `maxVariation`.
   */
  overwrite?: "true" | "false" | "aboveVariation";
  crop?: CropByElementSimple | CropByElementDetailed;
  sourceIntegration?: SourceIntegration;
}
/**
 * Information about the source integration for this screenshot, enabling upload of changed files back to the source CMS. Set automatically during test resolution for files from integrations.
 */
export interface SourceIntegration {
  /**
   * The type of integration. Currently supported: 'heretto'. Additional types may be added in the future.
   */
  type: "heretto";
  /**
   * The name of the integration configuration in the config file. Used to look up authentication credentials.
   */
  integrationName: string;
  /**
   * The unique identifier (UUID) of the file in the source CMS. If not provided, the file will be looked up by path.
   */
  fileId?: string;
  /**
   * The path of the file in the source CMS. Used for lookup if fileId is not available.
   */
  filePath?: string;
  /**
   * The local path to the file that references this source. Used for resolving relative paths.
   */
  contentPath?: string;
}
export interface Common10 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep10;
  variables?: VariablesStep10;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  if?: Condition21;
  /**
   * Assertions for this step. As authored input, a custom condition expression (or array of expressions, combined with logical AND). In a test result, the runner replaces this with the array of articulated assertion records it evaluated (implicit then custom).
   */
  assertions?: Condition22 | Assertion10[];
  /**
   * Routing entries evaluated when this step passes. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onPass?: Routing44[];
  /**
   * Routing entries evaluated when this step fails. The first entry whose `if` matches applies; the default when none is set stops the test. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onFail?: Routing45[];
  /**
   * Routing entries evaluated when this step produces a warning. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onWarning?: Routing46[];
  /**
   * Routing entries evaluated when this step is skipped (reached but not run — unsafe-blocked or guard-`if` false). The first entry whose `if` matches applies. `continue` and `stop` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed. (`retry` is a no-op here — a step that never ran cannot be re-run.)
   */
  onSkip?: Routing47[];
  location?: SourceLocation10;
  /**
   * Path, relative to the run's artifact directory (the report's `runDir`), of the screenshot captured automatically after this step. Always a non-empty, forward-slash, relative path. Present only in test results, when `autoScreenshot` is enabled and the capture succeeded. This is system-populated metadata and should not be set manually.
   */
  autoScreenshot?: string;
  /**
   * Total number of times this step ran (the initial attempt plus retries) when a routing `retry` action re-ran it. Present only in test results, and only when the step was retried at least once (so the value is always >= 2). This is system-populated metadata and should not be set manually.
   */
  attempts?: number;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep10 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep10`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep10 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep10`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * An articulated assertion record produced by the runner for a step result. Each record names a single verification check, whether it passed, and the values it compared. The step's result is the roll-up of its assertion results (FAIL > WARNING > all-SKIPPED > PASS). System-populated; appears in test results, not in authored specs.
 */
export interface Assertion10 {
  /**
   * Human-readable articulation of the check, e.g. `exitCode in [0]`.
   */
  statement: string;
  /**
   * Who defined the assertion: `implicit` (runner-defined) or `custom` (user-defined).
   */
  source: "implicit" | "custom";
  /**
   * Outcome of evaluating the assertion.
   */
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  /**
   * The value (or values) the assertion expected. Optional.
   */
  expected?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * The value actually observed. Optional.
   */
  actual?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * Human-readable explanation of the outcome. Optional.
   */
  description?: string;
}
/**
 * Source location where this step was detected in the original file. This is system-populated metadata and should not be set manually.
 */
export interface SourceLocation10 {
  /**
   * 1-indexed line number in the source file where the step was detected.
   */
  line: number;
  /**
   * 0-indexed character offset from the start of the source file where the step begins.
   */
  startIndex: number;
  /**
   * 0-indexed character offset from the start of the source file where the step ends (exclusive).
   */
  endIndex: number;
}
export interface SaveCookie {
  saveCookie: SaveCookie1;
  [k: string]: unknown;
}
export interface Common11 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep11;
  variables?: VariablesStep11;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  if?: Condition23;
  /**
   * Assertions for this step. As authored input, a custom condition expression (or array of expressions, combined with logical AND). In a test result, the runner replaces this with the array of articulated assertion records it evaluated (implicit then custom).
   */
  assertions?: Condition24 | Assertion11[];
  /**
   * Routing entries evaluated when this step passes. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onPass?: Routing48[];
  /**
   * Routing entries evaluated when this step fails. The first entry whose `if` matches applies; the default when none is set stops the test. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onFail?: Routing49[];
  /**
   * Routing entries evaluated when this step produces a warning. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onWarning?: Routing50[];
  /**
   * Routing entries evaluated when this step is skipped (reached but not run — unsafe-blocked or guard-`if` false). The first entry whose `if` matches applies. `continue` and `stop` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed. (`retry` is a no-op here — a step that never ran cannot be re-run.)
   */
  onSkip?: Routing51[];
  location?: SourceLocation11;
  /**
   * Path, relative to the run's artifact directory (the report's `runDir`), of the screenshot captured automatically after this step. Always a non-empty, forward-slash, relative path. Present only in test results, when `autoScreenshot` is enabled and the capture succeeded. This is system-populated metadata and should not be set manually.
   */
  autoScreenshot?: string;
  /**
   * Total number of times this step ran (the initial attempt plus retries) when a routing `retry` action re-ran it. Present only in test results, and only when the step was retried at least once (so the value is always >= 2). This is system-populated metadata and should not be set manually.
   */
  attempts?: number;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep11 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep11`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep11 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep11`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * An articulated assertion record produced by the runner for a step result. Each record names a single verification check, whether it passed, and the values it compared. The step's result is the roll-up of its assertion results (FAIL > WARNING > all-SKIPPED > PASS). System-populated; appears in test results, not in authored specs.
 */
export interface Assertion11 {
  /**
   * Human-readable articulation of the check, e.g. `exitCode in [0]`.
   */
  statement: string;
  /**
   * Who defined the assertion: `implicit` (runner-defined) or `custom` (user-defined).
   */
  source: "implicit" | "custom";
  /**
   * Outcome of evaluating the assertion.
   */
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  /**
   * The value (or values) the assertion expected. Optional.
   */
  expected?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * The value actually observed. Optional.
   */
  actual?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * Human-readable explanation of the outcome. Optional.
   */
  description?: string;
}
/**
 * Source location where this step was detected in the original file. This is system-populated metadata and should not be set manually.
 */
export interface SourceLocation11 {
  /**
   * 1-indexed line number in the source file where the step was detected.
   */
  line: number;
  /**
   * 0-indexed character offset from the start of the source file where the step begins.
   */
  startIndex: number;
  /**
   * 0-indexed character offset from the start of the source file where the step ends (exclusive).
   */
  endIndex: number;
}
export interface Record {
  record: Record1;
  [k: string]: unknown;
}
export interface RecordDetailed {
  /**
   * File path of the recording. Supports the `.mp4`, `.webm`, and `.gif` extensions. If not specified, the file name is the ID of the step, and the extension is `.mp4`.
   */
  path?: string;
  /**
   * Directory of the file. If the directory doesn't exist, creates the directory.
   */
  directory?: string;
  /**
   * If `true`, overwrites the existing recording at `path` if it exists.
   */
  overwrite?: "true" | "false";
  /**
   * Identifier for this recording. A later `stopRecord` step can target it by name (`stopRecord: "<name>"`), which is how you stop a specific recording when several overlap. Names must be unique among recordings that are active at the same time. If omitted, the recording is anonymous and is stopped LIFO by an untargeted `stopRecord`.
   */
  name?: string;
  engine?: RecordingEngine;
  [k: string]: unknown;
}
export interface RecordingEngineDetailed {
  /**
   * Recording engine. `browser` records the Chrome viewport (concurrency-safe); `ffmpeg` records the screen and supports any application.
   */
  name: "browser" | "ffmpeg";
  /**
   * What the `ffmpeg` engine captures. `display` records the full screen, `window` the active window, `viewport` the browser content area. Ignored by the `browser` engine, which always captures its tab. `window` and `viewport` are best-effort (captured full-screen, then cropped).
   */
  target?: "display" | "window" | "viewport";
  /**
   * Capture frame rate for the `ffmpeg` engine.
   */
  fps?: number;
}
export interface Common12 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep12;
  variables?: VariablesStep12;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  if?: Condition25;
  /**
   * Assertions for this step. As authored input, a custom condition expression (or array of expressions, combined with logical AND). In a test result, the runner replaces this with the array of articulated assertion records it evaluated (implicit then custom).
   */
  assertions?: Condition26 | Assertion12[];
  /**
   * Routing entries evaluated when this step passes. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onPass?: Routing52[];
  /**
   * Routing entries evaluated when this step fails. The first entry whose `if` matches applies; the default when none is set stops the test. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onFail?: Routing53[];
  /**
   * Routing entries evaluated when this step produces a warning. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onWarning?: Routing54[];
  /**
   * Routing entries evaluated when this step is skipped (reached but not run — unsafe-blocked or guard-`if` false). The first entry whose `if` matches applies. `continue` and `stop` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed. (`retry` is a no-op here — a step that never ran cannot be re-run.)
   */
  onSkip?: Routing55[];
  location?: SourceLocation12;
  /**
   * Path, relative to the run's artifact directory (the report's `runDir`), of the screenshot captured automatically after this step. Always a non-empty, forward-slash, relative path. Present only in test results, when `autoScreenshot` is enabled and the capture succeeded. This is system-populated metadata and should not be set manually.
   */
  autoScreenshot?: string;
  /**
   * Total number of times this step ran (the initial attempt plus retries) when a routing `retry` action re-ran it. Present only in test results, and only when the step was retried at least once (so the value is always >= 2). This is system-populated metadata and should not be set manually.
   */
  attempts?: number;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep12 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep12`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep12 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep12`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * An articulated assertion record produced by the runner for a step result. Each record names a single verification check, whether it passed, and the values it compared. The step's result is the roll-up of its assertion results (FAIL > WARNING > all-SKIPPED > PASS). System-populated; appears in test results, not in authored specs.
 */
export interface Assertion12 {
  /**
   * Human-readable articulation of the check, e.g. `exitCode in [0]`.
   */
  statement: string;
  /**
   * Who defined the assertion: `implicit` (runner-defined) or `custom` (user-defined).
   */
  source: "implicit" | "custom";
  /**
   * Outcome of evaluating the assertion.
   */
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  /**
   * The value (or values) the assertion expected. Optional.
   */
  expected?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * The value actually observed. Optional.
   */
  actual?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * Human-readable explanation of the outcome. Optional.
   */
  description?: string;
}
/**
 * Source location where this step was detected in the original file. This is system-populated metadata and should not be set manually.
 */
export interface SourceLocation12 {
  /**
   * 1-indexed line number in the source file where the step was detected.
   */
  line: number;
  /**
   * 0-indexed character offset from the start of the source file where the step begins.
   */
  startIndex: number;
  /**
   * 0-indexed character offset from the start of the source file where the step ends (exclusive).
   */
  endIndex: number;
}
export interface StopRecord {
  stopRecord: StopRecord1;
  [k: string]: unknown;
}
export interface StopRecordDetailed {
  /**
   * Name of the recording to stop. Matches the `name` given to a `record` step.
   */
  name: string;
}
export interface Common13 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep13;
  variables?: VariablesStep13;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  if?: Condition27;
  /**
   * Assertions for this step. As authored input, a custom condition expression (or array of expressions, combined with logical AND). In a test result, the runner replaces this with the array of articulated assertion records it evaluated (implicit then custom).
   */
  assertions?: Condition28 | Assertion13[];
  /**
   * Routing entries evaluated when this step passes. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onPass?: Routing56[];
  /**
   * Routing entries evaluated when this step fails. The first entry whose `if` matches applies; the default when none is set stops the test. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onFail?: Routing57[];
  /**
   * Routing entries evaluated when this step produces a warning. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onWarning?: Routing58[];
  /**
   * Routing entries evaluated when this step is skipped (reached but not run — unsafe-blocked or guard-`if` false). The first entry whose `if` matches applies. `continue` and `stop` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed. (`retry` is a no-op here — a step that never ran cannot be re-run.)
   */
  onSkip?: Routing59[];
  location?: SourceLocation13;
  /**
   * Path, relative to the run's artifact directory (the report's `runDir`), of the screenshot captured automatically after this step. Always a non-empty, forward-slash, relative path. Present only in test results, when `autoScreenshot` is enabled and the capture succeeded. This is system-populated metadata and should not be set manually.
   */
  autoScreenshot?: string;
  /**
   * Total number of times this step ran (the initial attempt plus retries) when a routing `retry` action re-ran it. Present only in test results, and only when the step was retried at least once (so the value is always >= 2). This is system-populated metadata and should not be set manually.
   */
  attempts?: number;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep13 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep13`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep13 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep13`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * An articulated assertion record produced by the runner for a step result. Each record names a single verification check, whether it passed, and the values it compared. The step's result is the roll-up of its assertion results (FAIL > WARNING > all-SKIPPED > PASS). System-populated; appears in test results, not in authored specs.
 */
export interface Assertion13 {
  /**
   * Human-readable articulation of the check, e.g. `exitCode in [0]`.
   */
  statement: string;
  /**
   * Who defined the assertion: `implicit` (runner-defined) or `custom` (user-defined).
   */
  source: "implicit" | "custom";
  /**
   * Outcome of evaluating the assertion.
   */
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  /**
   * The value (or values) the assertion expected. Optional.
   */
  expected?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * The value actually observed. Optional.
   */
  actual?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * Human-readable explanation of the outcome. Optional.
   */
  description?: string;
}
/**
 * Source location where this step was detected in the original file. This is system-populated metadata and should not be set manually.
 */
export interface SourceLocation13 {
  /**
   * 1-indexed line number in the source file where the step was detected.
   */
  line: number;
  /**
   * 0-indexed character offset from the start of the source file where the step begins.
   */
  startIndex: number;
  /**
   * 0-indexed character offset from the start of the source file where the step ends (exclusive).
   */
  endIndex: number;
}
export interface LoadVariables {
  loadVariables: LoadVariables1;
  [k: string]: unknown;
}
export interface Common14 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep14;
  variables?: VariablesStep14;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  if?: Condition29;
  /**
   * Assertions for this step. As authored input, a custom condition expression (or array of expressions, combined with logical AND). In a test result, the runner replaces this with the array of articulated assertion records it evaluated (implicit then custom).
   */
  assertions?: Condition30 | Assertion14[];
  /**
   * Routing entries evaluated when this step passes. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onPass?: Routing60[];
  /**
   * Routing entries evaluated when this step fails. The first entry whose `if` matches applies; the default when none is set stops the test. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onFail?: Routing61[];
  /**
   * Routing entries evaluated when this step produces a warning. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onWarning?: Routing62[];
  /**
   * Routing entries evaluated when this step is skipped (reached but not run — unsafe-blocked or guard-`if` false). The first entry whose `if` matches applies. `continue` and `stop` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed. (`retry` is a no-op here — a step that never ran cannot be re-run.)
   */
  onSkip?: Routing63[];
  location?: SourceLocation14;
  /**
   * Path, relative to the run's artifact directory (the report's `runDir`), of the screenshot captured automatically after this step. Always a non-empty, forward-slash, relative path. Present only in test results, when `autoScreenshot` is enabled and the capture succeeded. This is system-populated metadata and should not be set manually.
   */
  autoScreenshot?: string;
  /**
   * Total number of times this step ran (the initial attempt plus retries) when a routing `retry` action re-ran it. Present only in test results, and only when the step was retried at least once (so the value is always >= 2). This is system-populated metadata and should not be set manually.
   */
  attempts?: number;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep14 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep14`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep14 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep14`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * An articulated assertion record produced by the runner for a step result. Each record names a single verification check, whether it passed, and the values it compared. The step's result is the roll-up of its assertion results (FAIL > WARNING > all-SKIPPED > PASS). System-populated; appears in test results, not in authored specs.
 */
export interface Assertion14 {
  /**
   * Human-readable articulation of the check, e.g. `exitCode in [0]`.
   */
  statement: string;
  /**
   * Who defined the assertion: `implicit` (runner-defined) or `custom` (user-defined).
   */
  source: "implicit" | "custom";
  /**
   * Outcome of evaluating the assertion.
   */
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  /**
   * The value (or values) the assertion expected. Optional.
   */
  expected?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * The value actually observed. Optional.
   */
  actual?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * Human-readable explanation of the outcome. Optional.
   */
  description?: string;
}
/**
 * Source location where this step was detected in the original file. This is system-populated metadata and should not be set manually.
 */
export interface SourceLocation14 {
  /**
   * 1-indexed line number in the source file where the step was detected.
   */
  line: number;
  /**
   * 0-indexed character offset from the start of the source file where the step begins.
   */
  startIndex: number;
  /**
   * 0-indexed character offset from the start of the source file where the step ends (exclusive).
   */
  endIndex: number;
}
export interface DragAndDrop {
  dragAndDrop: DragAndDrop1;
  [k: string]: unknown;
}
/**
 * Drag and drop an element from source to target.
 */
export interface DragAndDrop1 {
  /**
   * The element to drag.
   */
  source: ElementSimple | ElementDetailed;
  /**
   * The target location to drop the element.
   */
  target: ElementSimple1 | ElementDetailed1;
  /**
   * Duration of the drag operation in milliseconds.
   */
  duration?: number;
  [k: string]: unknown;
}
export interface Common15 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep15;
  variables?: VariablesStep15;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  if?: Condition31;
  /**
   * Assertions for this step. As authored input, a custom condition expression (or array of expressions, combined with logical AND). In a test result, the runner replaces this with the array of articulated assertion records it evaluated (implicit then custom).
   */
  assertions?: Condition32 | Assertion15[];
  /**
   * Routing entries evaluated when this step passes. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onPass?: Routing64[];
  /**
   * Routing entries evaluated when this step fails. The first entry whose `if` matches applies; the default when none is set stops the test. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onFail?: Routing65[];
  /**
   * Routing entries evaluated when this step produces a warning. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onWarning?: Routing66[];
  /**
   * Routing entries evaluated when this step is skipped (reached but not run — unsafe-blocked or guard-`if` false). The first entry whose `if` matches applies. `continue` and `stop` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed. (`retry` is a no-op here — a step that never ran cannot be re-run.)
   */
  onSkip?: Routing67[];
  location?: SourceLocation15;
  /**
   * Path, relative to the run's artifact directory (the report's `runDir`), of the screenshot captured automatically after this step. Always a non-empty, forward-slash, relative path. Present only in test results, when `autoScreenshot` is enabled and the capture succeeded. This is system-populated metadata and should not be set manually.
   */
  autoScreenshot?: string;
  /**
   * Total number of times this step ran (the initial attempt plus retries) when a routing `retry` action re-ran it. Present only in test results, and only when the step was retried at least once (so the value is always >= 2). This is system-populated metadata and should not be set manually.
   */
  attempts?: number;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep15 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep15`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep15 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep15`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * An articulated assertion record produced by the runner for a step result. Each record names a single verification check, whether it passed, and the values it compared. The step's result is the roll-up of its assertion results (FAIL > WARNING > all-SKIPPED > PASS). System-populated; appears in test results, not in authored specs.
 */
export interface Assertion15 {
  /**
   * Human-readable articulation of the check, e.g. `exitCode in [0]`.
   */
  statement: string;
  /**
   * Who defined the assertion: `implicit` (runner-defined) or `custom` (user-defined).
   */
  source: "implicit" | "custom";
  /**
   * Outcome of evaluating the assertion.
   */
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  /**
   * The value (or values) the assertion expected. Optional.
   */
  expected?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * The value actually observed. Optional.
   */
  actual?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * Human-readable explanation of the outcome. Optional.
   */
  description?: string;
}
/**
 * Source location where this step was detected in the original file. This is system-populated metadata and should not be set manually.
 */
export interface SourceLocation15 {
  /**
   * 1-indexed line number in the source file where the step was detected.
   */
  line: number;
  /**
   * 0-indexed character offset from the start of the source file where the step begins.
   */
  startIndex: number;
  /**
   * 0-indexed character offset from the start of the source file where the step ends (exclusive).
   */
  endIndex: number;
}
export interface LoadCookie {
  loadCookie: LoadCookie1;
  [k: string]: unknown;
}
export interface Common16 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep16;
  variables?: VariablesStep16;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  if?: Condition33;
  /**
   * Assertions for this step. As authored input, a custom condition expression (or array of expressions, combined with logical AND). In a test result, the runner replaces this with the array of articulated assertion records it evaluated (implicit then custom).
   */
  assertions?: Condition34 | Assertion16[];
  /**
   * Routing entries evaluated when this step passes. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onPass?: Routing68[];
  /**
   * Routing entries evaluated when this step fails. The first entry whose `if` matches applies; the default when none is set stops the test. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onFail?: Routing69[];
  /**
   * Routing entries evaluated when this step produces a warning. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onWarning?: Routing70[];
  /**
   * Routing entries evaluated when this step is skipped (reached but not run — unsafe-blocked or guard-`if` false). The first entry whose `if` matches applies. `continue` and `stop` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed. (`retry` is a no-op here — a step that never ran cannot be re-run.)
   */
  onSkip?: Routing71[];
  location?: SourceLocation16;
  /**
   * Path, relative to the run's artifact directory (the report's `runDir`), of the screenshot captured automatically after this step. Always a non-empty, forward-slash, relative path. Present only in test results, when `autoScreenshot` is enabled and the capture succeeded. This is system-populated metadata and should not be set manually.
   */
  autoScreenshot?: string;
  /**
   * Total number of times this step ran (the initial attempt plus retries) when a routing `retry` action re-ran it. Present only in test results, and only when the step was retried at least once (so the value is always >= 2). This is system-populated metadata and should not be set manually.
   */
  attempts?: number;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep16 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep16`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep16 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep16`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * An articulated assertion record produced by the runner for a step result. Each record names a single verification check, whether it passed, and the values it compared. The step's result is the roll-up of its assertion results (FAIL > WARNING > all-SKIPPED > PASS). System-populated; appears in test results, not in authored specs.
 */
export interface Assertion16 {
  /**
   * Human-readable articulation of the check, e.g. `exitCode in [0]`.
   */
  statement: string;
  /**
   * Who defined the assertion: `implicit` (runner-defined) or `custom` (user-defined).
   */
  source: "implicit" | "custom";
  /**
   * Outcome of evaluating the assertion.
   */
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  /**
   * The value (or values) the assertion expected. Optional.
   */
  expected?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * The value actually observed. Optional.
   */
  actual?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * Human-readable explanation of the outcome. Optional.
   */
  description?: string;
}
/**
 * Source location where this step was detected in the original file. This is system-populated metadata and should not be set manually.
 */
export interface SourceLocation16 {
  /**
   * 1-indexed line number in the source file where the step was detected.
   */
  line: number;
  /**
   * 0-indexed character offset from the start of the source file where the step begins.
   */
  startIndex: number;
  /**
   * 0-indexed character offset from the start of the source file where the step ends (exclusive).
   */
  endIndex: number;
}
export interface Wait {
  wait: Wait1;
  [k: string]: unknown;
}
export interface ResolvedContext {
  /**
   * Platform to run the test on. This is a resolved version of the `platforms` property.
   */
  platform?: string;
  browser?: Browser2;
  openApi?: (OpenApi1 & OpenAPIDescriptionTest1)[];
  /**
   * Steps to perform as part of the test. Performed in the sequence defined. If one or more actions fail, the test fails. By default, if a step fails, the test stops and the remaining steps are not executed.
   *
   * @minItems 1
   */
  steps?: [Step1, ...Step1[]];
  [k: string]: unknown;
}
/**
 * Browser configuration.
 */
export interface Browser2 {
  /**
   * Name of the browser.
   */
  name: "chrome" | "firefox" | "safari" | "webkit";
  /**
   * If `true`, runs the browser in headless mode.
   */
  headless?: boolean;
  window?: BrowserWindow2;
  viewport?: BrowserViewport2;
}
/**
 * Browser dimensions.
 */
export interface BrowserWindow2 {
  /**
   * Width of the browser window in pixels.
   */
  width?: number;
  /**
   * Height of the browser window in pixels.
   */
  height?: number;
}
/**
 * Viewport dimensions.
 */
export interface BrowserViewport2 {
  /**
   * Width of the viewport in pixels.
   */
  width?: number;
  /**
   * Height of the viewport in pixels.
   */
  height?: number;
}
export interface OpenAPIDescriptionTest1 {
  [k: string]: unknown;
}
export interface Common17 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep17;
  variables?: VariablesStep17;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  if?: Condition35;
  /**
   * Assertions for this step. As authored input, a custom condition expression (or array of expressions, combined with logical AND). In a test result, the runner replaces this with the array of articulated assertion records it evaluated (implicit then custom).
   */
  assertions?: Condition36 | Assertion17[];
  /**
   * Routing entries evaluated when this step passes. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onPass?: Routing72[];
  /**
   * Routing entries evaluated when this step fails. The first entry whose `if` matches applies; the default when none is set stops the test. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onFail?: Routing73[];
  /**
   * Routing entries evaluated when this step produces a warning. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onWarning?: Routing74[];
  /**
   * Routing entries evaluated when this step is skipped (reached but not run — unsafe-blocked or guard-`if` false). The first entry whose `if` matches applies. `continue` and `stop` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed. (`retry` is a no-op here — a step that never ran cannot be re-run.)
   */
  onSkip?: Routing75[];
  location?: SourceLocation17;
  /**
   * Path, relative to the run's artifact directory (the report's `runDir`), of the screenshot captured automatically after this step. Always a non-empty, forward-slash, relative path. Present only in test results, when `autoScreenshot` is enabled and the capture succeeded. This is system-populated metadata and should not be set manually.
   */
  autoScreenshot?: string;
  /**
   * Total number of times this step ran (the initial attempt plus retries) when a routing `retry` action re-ran it. Present only in test results, and only when the step was retried at least once (so the value is always >= 2). This is system-populated metadata and should not be set manually.
   */
  attempts?: number;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep17 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep17`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep17 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep17`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * An articulated assertion record produced by the runner for a step result. Each record names a single verification check, whether it passed, and the values it compared. The step's result is the roll-up of its assertion results (FAIL > WARNING > all-SKIPPED > PASS). System-populated; appears in test results, not in authored specs.
 */
export interface Assertion17 {
  /**
   * Human-readable articulation of the check, e.g. `exitCode in [0]`.
   */
  statement: string;
  /**
   * Who defined the assertion: `implicit` (runner-defined) or `custom` (user-defined).
   */
  source: "implicit" | "custom";
  /**
   * Outcome of evaluating the assertion.
   */
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  /**
   * The value (or values) the assertion expected. Optional.
   */
  expected?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * The value actually observed. Optional.
   */
  actual?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * Human-readable explanation of the outcome. Optional.
   */
  description?: string;
}
/**
 * Source location where this step was detected in the original file. This is system-populated metadata and should not be set manually.
 */
export interface SourceLocation17 {
  /**
   * 1-indexed line number in the source file where the step was detected.
   */
  line: number;
  /**
   * 0-indexed character offset from the start of the source file where the step begins.
   */
  startIndex: number;
  /**
   * 0-indexed character offset from the start of the source file where the step ends (exclusive).
   */
  endIndex: number;
}
export interface CheckLink2 {
  checkLink: CheckLink3;
  [k: string]: unknown;
}
/**
 * Check if an HTTP or HTTPS URL returns an acceptable status code from a GET request.
 */
export interface CheckLinkDetailed3 {
  /**
   * URL to check. Can be a full URL or a path. If a path is provided, `origin` must be specified.
   */
  url: string;
  /**
   * Protocol and domain to navigate to. Prepended to `url`.
   */
  origin?: string;
  /**
   * Query parameters to append to the resolved URL. Merged on top of `originParams` from config; step keys win on collision. If `url` already contains a colliding query key, the value here replaces it. Values support environment variable substitution via `$VAR` syntax. WARNING: values are embedded in the request URL and appear in test results, logs, and reports.
   */
  params?: {
    [k: string]: string;
  };
  /**
   * Accepted status codes. If the specified URL returns a code other than what is specified here, the action fails.
   */
  statusCodes?: number | number[];
  /**
   * Additional HTTP headers to include in the request. Merged on top of Doc Detective's default browser-mimicking headers. Useful for sites behind bot protection or WAFs that allowlist specific headers (for example, a Cloudflare Access service token or a `Cookie` with a `cf_clearance` value).
   */
  headers?: RequestHeadersObject1 | RequestHeadersString1;
}
/**
 * Headers to include in the HTTP request, in key/value format. Values must be strings.
 */
export interface RequestHeadersObject1 {
  [k: string]: string;
}
export interface Common18 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep18;
  variables?: VariablesStep18;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  if?: Condition37;
  /**
   * Assertions for this step. As authored input, a custom condition expression (or array of expressions, combined with logical AND). In a test result, the runner replaces this with the array of articulated assertion records it evaluated (implicit then custom).
   */
  assertions?: Condition38 | Assertion18[];
  /**
   * Routing entries evaluated when this step passes. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onPass?: Routing76[];
  /**
   * Routing entries evaluated when this step fails. The first entry whose `if` matches applies; the default when none is set stops the test. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onFail?: Routing77[];
  /**
   * Routing entries evaluated when this step produces a warning. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onWarning?: Routing78[];
  /**
   * Routing entries evaluated when this step is skipped (reached but not run — unsafe-blocked or guard-`if` false). The first entry whose `if` matches applies. `continue` and `stop` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed. (`retry` is a no-op here — a step that never ran cannot be re-run.)
   */
  onSkip?: Routing79[];
  location?: SourceLocation18;
  /**
   * Path, relative to the run's artifact directory (the report's `runDir`), of the screenshot captured automatically after this step. Always a non-empty, forward-slash, relative path. Present only in test results, when `autoScreenshot` is enabled and the capture succeeded. This is system-populated metadata and should not be set manually.
   */
  autoScreenshot?: string;
  /**
   * Total number of times this step ran (the initial attempt plus retries) when a routing `retry` action re-ran it. Present only in test results, and only when the step was retried at least once (so the value is always >= 2). This is system-populated metadata and should not be set manually.
   */
  attempts?: number;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep18 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep18`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep18 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep18`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * An articulated assertion record produced by the runner for a step result. Each record names a single verification check, whether it passed, and the values it compared. The step's result is the roll-up of its assertion results (FAIL > WARNING > all-SKIPPED > PASS). System-populated; appears in test results, not in authored specs.
 */
export interface Assertion18 {
  /**
   * Human-readable articulation of the check, e.g. `exitCode in [0]`.
   */
  statement: string;
  /**
   * Who defined the assertion: `implicit` (runner-defined) or `custom` (user-defined).
   */
  source: "implicit" | "custom";
  /**
   * Outcome of evaluating the assertion.
   */
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  /**
   * The value (or values) the assertion expected. Optional.
   */
  expected?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * The value actually observed. Optional.
   */
  actual?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * Human-readable explanation of the outcome. Optional.
   */
  description?: string;
}
/**
 * Source location where this step was detected in the original file. This is system-populated metadata and should not be set manually.
 */
export interface SourceLocation18 {
  /**
   * 1-indexed line number in the source file where the step was detected.
   */
  line: number;
  /**
   * 0-indexed character offset from the start of the source file where the step begins.
   */
  startIndex: number;
  /**
   * 0-indexed character offset from the start of the source file where the step ends (exclusive).
   */
  endIndex: number;
}
export interface Click2 {
  click: Click3;
  [k: string]: unknown;
}
export interface Common19 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep19;
  variables?: VariablesStep19;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  if?: Condition39;
  /**
   * Assertions for this step. As authored input, a custom condition expression (or array of expressions, combined with logical AND). In a test result, the runner replaces this with the array of articulated assertion records it evaluated (implicit then custom).
   */
  assertions?: Condition40 | Assertion19[];
  /**
   * Routing entries evaluated when this step passes. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onPass?: Routing80[];
  /**
   * Routing entries evaluated when this step fails. The first entry whose `if` matches applies; the default when none is set stops the test. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onFail?: Routing81[];
  /**
   * Routing entries evaluated when this step produces a warning. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onWarning?: Routing82[];
  /**
   * Routing entries evaluated when this step is skipped (reached but not run — unsafe-blocked or guard-`if` false). The first entry whose `if` matches applies. `continue` and `stop` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed. (`retry` is a no-op here — a step that never ran cannot be re-run.)
   */
  onSkip?: Routing83[];
  location?: SourceLocation19;
  /**
   * Path, relative to the run's artifact directory (the report's `runDir`), of the screenshot captured automatically after this step. Always a non-empty, forward-slash, relative path. Present only in test results, when `autoScreenshot` is enabled and the capture succeeded. This is system-populated metadata and should not be set manually.
   */
  autoScreenshot?: string;
  /**
   * Total number of times this step ran (the initial attempt plus retries) when a routing `retry` action re-ran it. Present only in test results, and only when the step was retried at least once (so the value is always >= 2). This is system-populated metadata and should not be set manually.
   */
  attempts?: number;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep19 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep19`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep19 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep19`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * An articulated assertion record produced by the runner for a step result. Each record names a single verification check, whether it passed, and the values it compared. The step's result is the roll-up of its assertion results (FAIL > WARNING > all-SKIPPED > PASS). System-populated; appears in test results, not in authored specs.
 */
export interface Assertion19 {
  /**
   * Human-readable articulation of the check, e.g. `exitCode in [0]`.
   */
  statement: string;
  /**
   * Who defined the assertion: `implicit` (runner-defined) or `custom` (user-defined).
   */
  source: "implicit" | "custom";
  /**
   * Outcome of evaluating the assertion.
   */
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  /**
   * The value (or values) the assertion expected. Optional.
   */
  expected?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * The value actually observed. Optional.
   */
  actual?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * Human-readable explanation of the outcome. Optional.
   */
  description?: string;
}
/**
 * Source location where this step was detected in the original file. This is system-populated metadata and should not be set manually.
 */
export interface SourceLocation19 {
  /**
   * 1-indexed line number in the source file where the step was detected.
   */
  line: number;
  /**
   * 0-indexed character offset from the start of the source file where the step begins.
   */
  startIndex: number;
  /**
   * 0-indexed character offset from the start of the source file where the step ends (exclusive).
   */
  endIndex: number;
}
export interface Find2 {
  find: Find3;
  [k: string]: unknown;
}
export interface Common20 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep20;
  variables?: VariablesStep20;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  if?: Condition41;
  /**
   * Assertions for this step. As authored input, a custom condition expression (or array of expressions, combined with logical AND). In a test result, the runner replaces this with the array of articulated assertion records it evaluated (implicit then custom).
   */
  assertions?: Condition42 | Assertion20[];
  /**
   * Routing entries evaluated when this step passes. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onPass?: Routing84[];
  /**
   * Routing entries evaluated when this step fails. The first entry whose `if` matches applies; the default when none is set stops the test. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onFail?: Routing85[];
  /**
   * Routing entries evaluated when this step produces a warning. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onWarning?: Routing86[];
  /**
   * Routing entries evaluated when this step is skipped (reached but not run — unsafe-blocked or guard-`if` false). The first entry whose `if` matches applies. `continue` and `stop` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed. (`retry` is a no-op here — a step that never ran cannot be re-run.)
   */
  onSkip?: Routing87[];
  location?: SourceLocation20;
  /**
   * Path, relative to the run's artifact directory (the report's `runDir`), of the screenshot captured automatically after this step. Always a non-empty, forward-slash, relative path. Present only in test results, when `autoScreenshot` is enabled and the capture succeeded. This is system-populated metadata and should not be set manually.
   */
  autoScreenshot?: string;
  /**
   * Total number of times this step ran (the initial attempt plus retries) when a routing `retry` action re-ran it. Present only in test results, and only when the step was retried at least once (so the value is always >= 2). This is system-populated metadata and should not be set manually.
   */
  attempts?: number;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep20 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep20`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep20 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep20`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * An articulated assertion record produced by the runner for a step result. Each record names a single verification check, whether it passed, and the values it compared. The step's result is the roll-up of its assertion results (FAIL > WARNING > all-SKIPPED > PASS). System-populated; appears in test results, not in authored specs.
 */
export interface Assertion20 {
  /**
   * Human-readable articulation of the check, e.g. `exitCode in [0]`.
   */
  statement: string;
  /**
   * Who defined the assertion: `implicit` (runner-defined) or `custom` (user-defined).
   */
  source: "implicit" | "custom";
  /**
   * Outcome of evaluating the assertion.
   */
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  /**
   * The value (or values) the assertion expected. Optional.
   */
  expected?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * The value actually observed. Optional.
   */
  actual?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * Human-readable explanation of the outcome. Optional.
   */
  description?: string;
}
/**
 * Source location where this step was detected in the original file. This is system-populated metadata and should not be set manually.
 */
export interface SourceLocation20 {
  /**
   * 1-indexed line number in the source file where the step was detected.
   */
  line: number;
  /**
   * 0-indexed character offset from the start of the source file where the step begins.
   */
  startIndex: number;
  /**
   * 0-indexed character offset from the start of the source file where the step ends (exclusive).
   */
  endIndex: number;
}
export interface GoTo2 {
  goTo: GoTo3;
  [k: string]: unknown;
}
/**
 * Navigate to an HTTP or HTTPS URL.
 */
export interface GoToURLDetailed1 {
  /**
   * URL to navigate to. Can be a full URL or a path. If a path is provided and `origin` is specified, prepends `origin` to `url`. If a path is provided but `origin` isn't specified, attempts to navigate relative to the current URL, if any.
   */
  url: string;
  /**
   * Protocol and domain to navigate to. Prepended to `url`.
   */
  origin?: string;
  /**
   * Query parameters to append to the resolved URL. Merged on top of `originParams` from config; step keys win on collision. If `url` already contains a colliding query key, the value here replaces it. Values support environment variable substitution via `$VAR` syntax. WARNING: values are embedded in the request URL and appear in test results, logs, and reports.
   */
  params?: {
    [k: string]: string;
  };
  /**
   * Maximum time in milliseconds to wait for the page to be ready. If exceeded, the goTo action fails.
   */
  timeout?: number;
  /**
   * Configuration for waiting conditions after navigation.
   */
  waitUntil?: {
    /**
     * Wait for network activity to be idle (no new requests) for this duration in milliseconds. Set to `null` to skip this check.
     */
    networkIdleTime?: number | null;
    /**
     * Wait for DOM mutations to stop for this duration in milliseconds. Set to `null` to skip this check.
     */
    domIdleTime?: number | null;
    /**
     * Wait for a specific element to be present in the DOM. At least one of selector or elementText must be specified.
     */
    find?:
      | {
          [k: string]: unknown;
        }
      | {
          [k: string]: unknown;
        }
      | {
          [k: string]: unknown;
        }
      | {
          [k: string]: unknown;
        }
      | {
          [k: string]: unknown;
        }
      | {
          [k: string]: unknown;
        }
      | {
          [k: string]: unknown;
        };
  };
}
export interface Common21 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep21;
  variables?: VariablesStep21;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  if?: Condition43;
  /**
   * Assertions for this step. As authored input, a custom condition expression (or array of expressions, combined with logical AND). In a test result, the runner replaces this with the array of articulated assertion records it evaluated (implicit then custom).
   */
  assertions?: Condition44 | Assertion21[];
  /**
   * Routing entries evaluated when this step passes. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onPass?: Routing88[];
  /**
   * Routing entries evaluated when this step fails. The first entry whose `if` matches applies; the default when none is set stops the test. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onFail?: Routing89[];
  /**
   * Routing entries evaluated when this step produces a warning. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onWarning?: Routing90[];
  /**
   * Routing entries evaluated when this step is skipped (reached but not run — unsafe-blocked or guard-`if` false). The first entry whose `if` matches applies. `continue` and `stop` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed. (`retry` is a no-op here — a step that never ran cannot be re-run.)
   */
  onSkip?: Routing91[];
  location?: SourceLocation21;
  /**
   * Path, relative to the run's artifact directory (the report's `runDir`), of the screenshot captured automatically after this step. Always a non-empty, forward-slash, relative path. Present only in test results, when `autoScreenshot` is enabled and the capture succeeded. This is system-populated metadata and should not be set manually.
   */
  autoScreenshot?: string;
  /**
   * Total number of times this step ran (the initial attempt plus retries) when a routing `retry` action re-ran it. Present only in test results, and only when the step was retried at least once (so the value is always >= 2). This is system-populated metadata and should not be set manually.
   */
  attempts?: number;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep21 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep21`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep21 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep21`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * An articulated assertion record produced by the runner for a step result. Each record names a single verification check, whether it passed, and the values it compared. The step's result is the roll-up of its assertion results (FAIL > WARNING > all-SKIPPED > PASS). System-populated; appears in test results, not in authored specs.
 */
export interface Assertion21 {
  /**
   * Human-readable articulation of the check, e.g. `exitCode in [0]`.
   */
  statement: string;
  /**
   * Who defined the assertion: `implicit` (runner-defined) or `custom` (user-defined).
   */
  source: "implicit" | "custom";
  /**
   * Outcome of evaluating the assertion.
   */
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  /**
   * The value (or values) the assertion expected. Optional.
   */
  expected?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * The value actually observed. Optional.
   */
  actual?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * Human-readable explanation of the outcome. Optional.
   */
  description?: string;
}
/**
 * Source location where this step was detected in the original file. This is system-populated metadata and should not be set manually.
 */
export interface SourceLocation21 {
  /**
   * 1-indexed line number in the source file where the step was detected.
   */
  line: number;
  /**
   * 0-indexed character offset from the start of the source file where the step begins.
   */
  startIndex: number;
  /**
   * 0-indexed character offset from the start of the source file where the step ends (exclusive).
   */
  endIndex: number;
}
export interface HttpRequest2 {
  httpRequest: HttpRequest3;
  [k: string]: unknown;
}
export interface Common22 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep22;
  variables?: VariablesStep22;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  if?: Condition45;
  /**
   * Assertions for this step. As authored input, a custom condition expression (or array of expressions, combined with logical AND). In a test result, the runner replaces this with the array of articulated assertion records it evaluated (implicit then custom).
   */
  assertions?: Condition46 | Assertion22[];
  /**
   * Routing entries evaluated when this step passes. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onPass?: Routing92[];
  /**
   * Routing entries evaluated when this step fails. The first entry whose `if` matches applies; the default when none is set stops the test. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onFail?: Routing93[];
  /**
   * Routing entries evaluated when this step produces a warning. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onWarning?: Routing94[];
  /**
   * Routing entries evaluated when this step is skipped (reached but not run — unsafe-blocked or guard-`if` false). The first entry whose `if` matches applies. `continue` and `stop` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed. (`retry` is a no-op here — a step that never ran cannot be re-run.)
   */
  onSkip?: Routing95[];
  location?: SourceLocation22;
  /**
   * Path, relative to the run's artifact directory (the report's `runDir`), of the screenshot captured automatically after this step. Always a non-empty, forward-slash, relative path. Present only in test results, when `autoScreenshot` is enabled and the capture succeeded. This is system-populated metadata and should not be set manually.
   */
  autoScreenshot?: string;
  /**
   * Total number of times this step ran (the initial attempt plus retries) when a routing `retry` action re-ran it. Present only in test results, and only when the step was retried at least once (so the value is always >= 2). This is system-populated metadata and should not be set manually.
   */
  attempts?: number;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep22 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep22`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep22 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep22`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * An articulated assertion record produced by the runner for a step result. Each record names a single verification check, whether it passed, and the values it compared. The step's result is the roll-up of its assertion results (FAIL > WARNING > all-SKIPPED > PASS). System-populated; appears in test results, not in authored specs.
 */
export interface Assertion22 {
  /**
   * Human-readable articulation of the check, e.g. `exitCode in [0]`.
   */
  statement: string;
  /**
   * Who defined the assertion: `implicit` (runner-defined) or `custom` (user-defined).
   */
  source: "implicit" | "custom";
  /**
   * Outcome of evaluating the assertion.
   */
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  /**
   * The value (or values) the assertion expected. Optional.
   */
  expected?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * The value actually observed. Optional.
   */
  actual?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * Human-readable explanation of the outcome. Optional.
   */
  description?: string;
}
/**
 * Source location where this step was detected in the original file. This is system-populated metadata and should not be set manually.
 */
export interface SourceLocation22 {
  /**
   * 1-indexed line number in the source file where the step was detected.
   */
  line: number;
  /**
   * 0-indexed character offset from the start of the source file where the step begins.
   */
  startIndex: number;
  /**
   * 0-indexed character offset from the start of the source file where the step ends (exclusive).
   */
  endIndex: number;
}
export interface RunShell2 {
  runShell: RunShell3;
  [k: string]: unknown;
}
export interface RunShellCommandDetailed1 {
  /**
   * Command to perform in the machine's default shell.
   */
  command: string;
  /**
   * Arguments for the command.
   */
  args?: string[];
  /**
   * Working directory for the command.
   */
  workingDirectory?: string;
  /**
   * Expected exit codes of the command. If the command's actual exit code isn't in this list, the step fails.
   */
  exitCodes?: number[];
  /**
   * Content expected in the command's stdout or stderr. If the expected content can't be found in the command's stdout or stderr, the step fails. Supports strings and regular expressions. To use a regular expression, the string must start and end with a forward slash, like in `/^hello-world.* /`.
   */
  stdio?: string;
  /**
   * File path to save the command's output, relative to `directory`.
   */
  path?: string;
  /**
   * Directory to save the command's output. If the directory doesn't exist, creates the directory. If not specified, the directory is your media directory.
   */
  directory?: string;
  /**
   * Allowed variation as a fraction (0 to 1) of text different between the current output and previously saved output. For example, 0.1 means 10%. If the difference between the current output and the previous output is greater than `maxVariation`, the step fails. If output doesn't exist at `path`, this value is ignored.
   */
  maxVariation?: number;
  /**
   * If `true`, overwrites the existing output at `path` if it exists.
   * If `aboveVariation`, overwrites the existing output at `path` if the difference between the new output and the existing output is greater than `maxVariation`.
   */
  overwrite?: "true" | "false" | "aboveVariation";
  /**
   * Max time in milliseconds the command is allowed to run. If the command runs longer than this, the step fails.
   */
  timeout?: number;
}
export interface Common23 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep23;
  variables?: VariablesStep23;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  if?: Condition47;
  /**
   * Assertions for this step. As authored input, a custom condition expression (or array of expressions, combined with logical AND). In a test result, the runner replaces this with the array of articulated assertion records it evaluated (implicit then custom).
   */
  assertions?: Condition48 | Assertion23[];
  /**
   * Routing entries evaluated when this step passes. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onPass?: Routing96[];
  /**
   * Routing entries evaluated when this step fails. The first entry whose `if` matches applies; the default when none is set stops the test. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onFail?: Routing97[];
  /**
   * Routing entries evaluated when this step produces a warning. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onWarning?: Routing98[];
  /**
   * Routing entries evaluated when this step is skipped (reached but not run — unsafe-blocked or guard-`if` false). The first entry whose `if` matches applies. `continue` and `stop` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed. (`retry` is a no-op here — a step that never ran cannot be re-run.)
   */
  onSkip?: Routing99[];
  location?: SourceLocation23;
  /**
   * Path, relative to the run's artifact directory (the report's `runDir`), of the screenshot captured automatically after this step. Always a non-empty, forward-slash, relative path. Present only in test results, when `autoScreenshot` is enabled and the capture succeeded. This is system-populated metadata and should not be set manually.
   */
  autoScreenshot?: string;
  /**
   * Total number of times this step ran (the initial attempt plus retries) when a routing `retry` action re-ran it. Present only in test results, and only when the step was retried at least once (so the value is always >= 2). This is system-populated metadata and should not be set manually.
   */
  attempts?: number;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep23 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep23`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep23 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep23`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * An articulated assertion record produced by the runner for a step result. Each record names a single verification check, whether it passed, and the values it compared. The step's result is the roll-up of its assertion results (FAIL > WARNING > all-SKIPPED > PASS). System-populated; appears in test results, not in authored specs.
 */
export interface Assertion23 {
  /**
   * Human-readable articulation of the check, e.g. `exitCode in [0]`.
   */
  statement: string;
  /**
   * Who defined the assertion: `implicit` (runner-defined) or `custom` (user-defined).
   */
  source: "implicit" | "custom";
  /**
   * Outcome of evaluating the assertion.
   */
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  /**
   * The value (or values) the assertion expected. Optional.
   */
  expected?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * The value actually observed. Optional.
   */
  actual?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * Human-readable explanation of the outcome. Optional.
   */
  description?: string;
}
/**
 * Source location where this step was detected in the original file. This is system-populated metadata and should not be set manually.
 */
export interface SourceLocation23 {
  /**
   * 1-indexed line number in the source file where the step was detected.
   */
  line: number;
  /**
   * 0-indexed character offset from the start of the source file where the step begins.
   */
  startIndex: number;
  /**
   * 0-indexed character offset from the start of the source file where the step ends (exclusive).
   */
  endIndex: number;
}
export interface RunCode2 {
  runCode: RunCode3;
  [k: string]: unknown;
}
export interface RunCodeDetailed1 {
  /**
   * Language of the code to run.
   */
  language: "python" | "bash" | "javascript";
  /**
   * Code to run.
   */
  code: string;
  /**
   * Arguments for the command.
   */
  args?: string[];
  /**
   * Working directory for the command.
   */
  workingDirectory?: string;
  /**
   * Expected exit codes of the command. If the command's actual exit code isn't in this list, the step fails.
   */
  exitCodes?: number[];
  /**
   * Content expected in the command's output. If the expected content can't be found in the command's output (either stdout or stderr), the step fails. Supports strings and regular expressions. To use a regular expression, the string must start and end with a forward slash, like in `/^hello-world.* /`.
   */
  stdio?: string;
  /**
   * File path to save the command's output, relative to `directory`.
   */
  path?: string;
  /**
   * Directory to save the command's output. If the directory doesn't exist, creates the directory. If not specified, the directory is your media directory.
   */
  directory?: string;
  /**
   * Allowed variation as a fraction (0 to 1) of text different between the current output and previously saved output. For example, 0.1 means 10%. If the difference between the current output and the previous output is greater than `maxVariation`, the step fails. If output doesn't exist at `path`, this value is ignored.
   */
  maxVariation?: number;
  /**
   * If `true`, overwrites the existing output at `path` if it exists.
   * If `aboveVariation`, overwrites the existing output at `path` if the difference between the new output and the existing output is greater than `maxVariation`.
   */
  overwrite?: "true" | "false" | "aboveVariation";
  /**
   * Max time in milliseconds the command is allowed to run. If the command runs longer than this, the step fails.
   */
  timeout?: number;
  [k: string]: unknown;
}
export interface Common24 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep24;
  variables?: VariablesStep24;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  if?: Condition49;
  /**
   * Assertions for this step. As authored input, a custom condition expression (or array of expressions, combined with logical AND). In a test result, the runner replaces this with the array of articulated assertion records it evaluated (implicit then custom).
   */
  assertions?: Condition50 | Assertion24[];
  /**
   * Routing entries evaluated when this step passes. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onPass?: Routing100[];
  /**
   * Routing entries evaluated when this step fails. The first entry whose `if` matches applies; the default when none is set stops the test. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onFail?: Routing101[];
  /**
   * Routing entries evaluated when this step produces a warning. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onWarning?: Routing102[];
  /**
   * Routing entries evaluated when this step is skipped (reached but not run — unsafe-blocked or guard-`if` false). The first entry whose `if` matches applies. `continue` and `stop` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed. (`retry` is a no-op here — a step that never ran cannot be re-run.)
   */
  onSkip?: Routing103[];
  location?: SourceLocation24;
  /**
   * Path, relative to the run's artifact directory (the report's `runDir`), of the screenshot captured automatically after this step. Always a non-empty, forward-slash, relative path. Present only in test results, when `autoScreenshot` is enabled and the capture succeeded. This is system-populated metadata and should not be set manually.
   */
  autoScreenshot?: string;
  /**
   * Total number of times this step ran (the initial attempt plus retries) when a routing `retry` action re-ran it. Present only in test results, and only when the step was retried at least once (so the value is always >= 2). This is system-populated metadata and should not be set manually.
   */
  attempts?: number;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep24 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep24`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep24 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep24`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * An articulated assertion record produced by the runner for a step result. Each record names a single verification check, whether it passed, and the values it compared. The step's result is the roll-up of its assertion results (FAIL > WARNING > all-SKIPPED > PASS). System-populated; appears in test results, not in authored specs.
 */
export interface Assertion24 {
  /**
   * Human-readable articulation of the check, e.g. `exitCode in [0]`.
   */
  statement: string;
  /**
   * Who defined the assertion: `implicit` (runner-defined) or `custom` (user-defined).
   */
  source: "implicit" | "custom";
  /**
   * Outcome of evaluating the assertion.
   */
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  /**
   * The value (or values) the assertion expected. Optional.
   */
  expected?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * The value actually observed. Optional.
   */
  actual?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * Human-readable explanation of the outcome. Optional.
   */
  description?: string;
}
/**
 * Source location where this step was detected in the original file. This is system-populated metadata and should not be set manually.
 */
export interface SourceLocation24 {
  /**
   * 1-indexed line number in the source file where the step was detected.
   */
  line: number;
  /**
   * 0-indexed character offset from the start of the source file where the step begins.
   */
  startIndex: number;
  /**
   * 0-indexed character offset from the start of the source file where the step ends (exclusive).
   */
  endIndex: number;
}
export interface RunBrowserScript2 {
  runBrowserScript: RunBrowserScript3;
  [k: string]: unknown;
}
export interface RunBrowserScriptDetailed1 {
  /**
   * JavaScript to evaluate in the browser page context. Supports `return` to capture a value into `outputs.result`. The script reads arguments supplied in `args` through the `arguments` object (`arguments[0]`, `arguments[1]`, and so on).
   */
  script: string;
  /**
   * Arguments passed positionally to the script and exposed through the `arguments` object. Each item may be any JSON-serializable value (string, number, boolean, null, object, or array), matching what `executeScript` accepts.
   */
  args?: unknown[];
  /**
   * Content expected in the script's serialized return value. Doc Detective serializes non-string return values to JSON before matching. If the serialized return value doesn't contain the expected content, the step fails. Supports strings and regular expressions. To use a regular expression, the string must start and end with a forward slash, like in `/^hello-world.* /`.
   */
  output?: string;
  /**
   * File path to save the script's serialized return value, relative to `directory`.
   */
  path?: string;
  /**
   * Directory to save the script's return value. If the directory doesn't exist, creates the directory. If not specified, the directory is your media directory.
   */
  directory?: string;
  /**
   * Allowed variation as a fraction (0 to 1) of text different between the current return value and previously saved value. For example, 0.1 means 10%. If the difference between the current value and the previous value is greater than `maxVariation`, the step returns a warning. If no output exists at `path`, Doc Detective ignores this value.
   */
  maxVariation?: number;
  /**
   * If `true`, overwrites the existing output at `path` if it exists.
   * If `aboveVariation`, overwrites the existing output at `path` if the difference between the new output and the existing output is greater than `maxVariation`.
   */
  overwrite?: "true" | "false" | "aboveVariation";
  /**
   * Maximum time in milliseconds the script may run. If the script runs longer than this, the step fails.
   */
  timeout?: number;
}
export interface Common25 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep25;
  variables?: VariablesStep25;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  if?: Condition51;
  /**
   * Assertions for this step. As authored input, a custom condition expression (or array of expressions, combined with logical AND). In a test result, the runner replaces this with the array of articulated assertion records it evaluated (implicit then custom).
   */
  assertions?: Condition52 | Assertion25[];
  /**
   * Routing entries evaluated when this step passes. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onPass?: Routing104[];
  /**
   * Routing entries evaluated when this step fails. The first entry whose `if` matches applies; the default when none is set stops the test. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onFail?: Routing105[];
  /**
   * Routing entries evaluated when this step produces a warning. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onWarning?: Routing106[];
  /**
   * Routing entries evaluated when this step is skipped (reached but not run — unsafe-blocked or guard-`if` false). The first entry whose `if` matches applies. `continue` and `stop` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed. (`retry` is a no-op here — a step that never ran cannot be re-run.)
   */
  onSkip?: Routing107[];
  location?: SourceLocation25;
  /**
   * Path, relative to the run's artifact directory (the report's `runDir`), of the screenshot captured automatically after this step. Always a non-empty, forward-slash, relative path. Present only in test results, when `autoScreenshot` is enabled and the capture succeeded. This is system-populated metadata and should not be set manually.
   */
  autoScreenshot?: string;
  /**
   * Total number of times this step ran (the initial attempt plus retries) when a routing `retry` action re-ran it. Present only in test results, and only when the step was retried at least once (so the value is always >= 2). This is system-populated metadata and should not be set manually.
   */
  attempts?: number;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep25 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep25`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep25 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep25`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * An articulated assertion record produced by the runner for a step result. Each record names a single verification check, whether it passed, and the values it compared. The step's result is the roll-up of its assertion results (FAIL > WARNING > all-SKIPPED > PASS). System-populated; appears in test results, not in authored specs.
 */
export interface Assertion25 {
  /**
   * Human-readable articulation of the check, e.g. `exitCode in [0]`.
   */
  statement: string;
  /**
   * Who defined the assertion: `implicit` (runner-defined) or `custom` (user-defined).
   */
  source: "implicit" | "custom";
  /**
   * Outcome of evaluating the assertion.
   */
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  /**
   * The value (or values) the assertion expected. Optional.
   */
  expected?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * The value actually observed. Optional.
   */
  actual?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * Human-readable explanation of the outcome. Optional.
   */
  description?: string;
}
/**
 * Source location where this step was detected in the original file. This is system-populated metadata and should not be set manually.
 */
export interface SourceLocation25 {
  /**
   * 1-indexed line number in the source file where the step was detected.
   */
  line: number;
  /**
   * 0-indexed character offset from the start of the source file where the step begins.
   */
  startIndex: number;
  /**
   * 0-indexed character offset from the start of the source file where the step ends (exclusive).
   */
  endIndex: number;
}
export interface Type1 {
  type: TypeKeys1;
  [k: string]: unknown;
}
export interface TypeKeysDetailed1 {
  keys: TypeKeysSimple3;
  /**
   * Delay in milliseconds between each key press during a recording
   */
  inputDelay?: number;
  /**
   * Selector for the element to type into. If not specified, the typing occurs in the active element.
   */
  selector?: string;
  /**
   * Display text of the element to type into. If combined with other element finding fields, the element must match all specified criteria.
   */
  elementText?: string;
  /**
   * ID attribute of the element to find. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementId?: string;
  /**
   * data-testid attribute of the element to find. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementTestId?: string;
  /**
   * Class or array of classes that the element must have. Each class supports exact match or regex pattern using /pattern/ syntax. Element must have all specified classes.
   */
  elementClass?: string | string[];
  /**
   * Object of attribute key-value pairs that the element must have. Values can be strings (supporting /pattern/ regex), numbers, or booleans. Boolean true matches attribute presence, false matches absence.
   */
  elementAttribute?: {
    [k: string]: string | number | boolean;
  };
  /**
   * Computed accessible name of the element per ARIA specification. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementAria?: string;
}
export interface Common26 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep26;
  variables?: VariablesStep26;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  if?: Condition53;
  /**
   * Assertions for this step. As authored input, a custom condition expression (or array of expressions, combined with logical AND). In a test result, the runner replaces this with the array of articulated assertion records it evaluated (implicit then custom).
   */
  assertions?: Condition54 | Assertion26[];
  /**
   * Routing entries evaluated when this step passes. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onPass?: Routing108[];
  /**
   * Routing entries evaluated when this step fails. The first entry whose `if` matches applies; the default when none is set stops the test. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onFail?: Routing109[];
  /**
   * Routing entries evaluated when this step produces a warning. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onWarning?: Routing110[];
  /**
   * Routing entries evaluated when this step is skipped (reached but not run — unsafe-blocked or guard-`if` false). The first entry whose `if` matches applies. `continue` and `stop` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed. (`retry` is a no-op here — a step that never ran cannot be re-run.)
   */
  onSkip?: Routing111[];
  location?: SourceLocation26;
  /**
   * Path, relative to the run's artifact directory (the report's `runDir`), of the screenshot captured automatically after this step. Always a non-empty, forward-slash, relative path. Present only in test results, when `autoScreenshot` is enabled and the capture succeeded. This is system-populated metadata and should not be set manually.
   */
  autoScreenshot?: string;
  /**
   * Total number of times this step ran (the initial attempt plus retries) when a routing `retry` action re-ran it. Present only in test results, and only when the step was retried at least once (so the value is always >= 2). This is system-populated metadata and should not be set manually.
   */
  attempts?: number;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep26 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep26`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep26 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep26`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * An articulated assertion record produced by the runner for a step result. Each record names a single verification check, whether it passed, and the values it compared. The step's result is the roll-up of its assertion results (FAIL > WARNING > all-SKIPPED > PASS). System-populated; appears in test results, not in authored specs.
 */
export interface Assertion26 {
  /**
   * Human-readable articulation of the check, e.g. `exitCode in [0]`.
   */
  statement: string;
  /**
   * Who defined the assertion: `implicit` (runner-defined) or `custom` (user-defined).
   */
  source: "implicit" | "custom";
  /**
   * Outcome of evaluating the assertion.
   */
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  /**
   * The value (or values) the assertion expected. Optional.
   */
  expected?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * The value actually observed. Optional.
   */
  actual?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * Human-readable explanation of the outcome. Optional.
   */
  description?: string;
}
/**
 * Source location where this step was detected in the original file. This is system-populated metadata and should not be set manually.
 */
export interface SourceLocation26 {
  /**
   * 1-indexed line number in the source file where the step was detected.
   */
  line: number;
  /**
   * 0-indexed character offset from the start of the source file where the step begins.
   */
  startIndex: number;
  /**
   * 0-indexed character offset from the start of the source file where the step ends (exclusive).
   */
  endIndex: number;
}
export interface Screenshot2 {
  screenshot: Screenshot3;
  [k: string]: unknown;
}
export interface CaptureScreenshotDetailed1 {
  path?: ScreenshotSimple3;
  /**
   * Directory of the PNG file. If the directory doesn't exist, creates the directory.
   */
  directory?: string;
  /**
   * Allowed variation in percentage of pixels between the new screenshot and the existing screenshot at `path`. If the difference between the new screenshot and the existing screenshot is greater than `maxVariation`, the step fails. If a screenshot doesn't exist at `path`, this value is ignored.
   */
  maxVariation?: number;
  /**
   * If `true`, overwrites the existing screenshot at `path` if it exists.
   * If `aboveVariation`, overwrites the existing screenshot at `path` if the difference between the new screenshot and the existing screenshot is greater than `maxVariation`.
   */
  overwrite?: "true" | "false" | "aboveVariation";
  crop?: CropByElementSimple1 | CropByElementDetailed1;
  sourceIntegration?: SourceIntegration1;
}
/**
 * Information about the source integration for this screenshot, enabling upload of changed files back to the source CMS. Set automatically during test resolution for files from integrations.
 */
export interface SourceIntegration1 {
  /**
   * The type of integration. Currently supported: 'heretto'. Additional types may be added in the future.
   */
  type: "heretto";
  /**
   * The name of the integration configuration in the config file. Used to look up authentication credentials.
   */
  integrationName: string;
  /**
   * The unique identifier (UUID) of the file in the source CMS. If not provided, the file will be looked up by path.
   */
  fileId?: string;
  /**
   * The path of the file in the source CMS. Used for lookup if fileId is not available.
   */
  filePath?: string;
  /**
   * The local path to the file that references this source. Used for resolving relative paths.
   */
  contentPath?: string;
}
export interface Common27 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep27;
  variables?: VariablesStep27;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  if?: Condition55;
  /**
   * Assertions for this step. As authored input, a custom condition expression (or array of expressions, combined with logical AND). In a test result, the runner replaces this with the array of articulated assertion records it evaluated (implicit then custom).
   */
  assertions?: Condition56 | Assertion27[];
  /**
   * Routing entries evaluated when this step passes. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onPass?: Routing112[];
  /**
   * Routing entries evaluated when this step fails. The first entry whose `if` matches applies; the default when none is set stops the test. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onFail?: Routing113[];
  /**
   * Routing entries evaluated when this step produces a warning. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onWarning?: Routing114[];
  /**
   * Routing entries evaluated when this step is skipped (reached but not run — unsafe-blocked or guard-`if` false). The first entry whose `if` matches applies. `continue` and `stop` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed. (`retry` is a no-op here — a step that never ran cannot be re-run.)
   */
  onSkip?: Routing115[];
  location?: SourceLocation27;
  /**
   * Path, relative to the run's artifact directory (the report's `runDir`), of the screenshot captured automatically after this step. Always a non-empty, forward-slash, relative path. Present only in test results, when `autoScreenshot` is enabled and the capture succeeded. This is system-populated metadata and should not be set manually.
   */
  autoScreenshot?: string;
  /**
   * Total number of times this step ran (the initial attempt plus retries) when a routing `retry` action re-ran it. Present only in test results, and only when the step was retried at least once (so the value is always >= 2). This is system-populated metadata and should not be set manually.
   */
  attempts?: number;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep27 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep27`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep27 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep27`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * An articulated assertion record produced by the runner for a step result. Each record names a single verification check, whether it passed, and the values it compared. The step's result is the roll-up of its assertion results (FAIL > WARNING > all-SKIPPED > PASS). System-populated; appears in test results, not in authored specs.
 */
export interface Assertion27 {
  /**
   * Human-readable articulation of the check, e.g. `exitCode in [0]`.
   */
  statement: string;
  /**
   * Who defined the assertion: `implicit` (runner-defined) or `custom` (user-defined).
   */
  source: "implicit" | "custom";
  /**
   * Outcome of evaluating the assertion.
   */
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  /**
   * The value (or values) the assertion expected. Optional.
   */
  expected?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * The value actually observed. Optional.
   */
  actual?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * Human-readable explanation of the outcome. Optional.
   */
  description?: string;
}
/**
 * Source location where this step was detected in the original file. This is system-populated metadata and should not be set manually.
 */
export interface SourceLocation27 {
  /**
   * 1-indexed line number in the source file where the step was detected.
   */
  line: number;
  /**
   * 0-indexed character offset from the start of the source file where the step begins.
   */
  startIndex: number;
  /**
   * 0-indexed character offset from the start of the source file where the step ends (exclusive).
   */
  endIndex: number;
}
export interface SaveCookie2 {
  saveCookie: SaveCookie3;
  [k: string]: unknown;
}
export interface Common28 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep28;
  variables?: VariablesStep28;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  if?: Condition57;
  /**
   * Assertions for this step. As authored input, a custom condition expression (or array of expressions, combined with logical AND). In a test result, the runner replaces this with the array of articulated assertion records it evaluated (implicit then custom).
   */
  assertions?: Condition58 | Assertion28[];
  /**
   * Routing entries evaluated when this step passes. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onPass?: Routing116[];
  /**
   * Routing entries evaluated when this step fails. The first entry whose `if` matches applies; the default when none is set stops the test. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onFail?: Routing117[];
  /**
   * Routing entries evaluated when this step produces a warning. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onWarning?: Routing118[];
  /**
   * Routing entries evaluated when this step is skipped (reached but not run — unsafe-blocked or guard-`if` false). The first entry whose `if` matches applies. `continue` and `stop` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed. (`retry` is a no-op here — a step that never ran cannot be re-run.)
   */
  onSkip?: Routing119[];
  location?: SourceLocation28;
  /**
   * Path, relative to the run's artifact directory (the report's `runDir`), of the screenshot captured automatically after this step. Always a non-empty, forward-slash, relative path. Present only in test results, when `autoScreenshot` is enabled and the capture succeeded. This is system-populated metadata and should not be set manually.
   */
  autoScreenshot?: string;
  /**
   * Total number of times this step ran (the initial attempt plus retries) when a routing `retry` action re-ran it. Present only in test results, and only when the step was retried at least once (so the value is always >= 2). This is system-populated metadata and should not be set manually.
   */
  attempts?: number;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep28 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep28`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep28 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep28`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * An articulated assertion record produced by the runner for a step result. Each record names a single verification check, whether it passed, and the values it compared. The step's result is the roll-up of its assertion results (FAIL > WARNING > all-SKIPPED > PASS). System-populated; appears in test results, not in authored specs.
 */
export interface Assertion28 {
  /**
   * Human-readable articulation of the check, e.g. `exitCode in [0]`.
   */
  statement: string;
  /**
   * Who defined the assertion: `implicit` (runner-defined) or `custom` (user-defined).
   */
  source: "implicit" | "custom";
  /**
   * Outcome of evaluating the assertion.
   */
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  /**
   * The value (or values) the assertion expected. Optional.
   */
  expected?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * The value actually observed. Optional.
   */
  actual?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * Human-readable explanation of the outcome. Optional.
   */
  description?: string;
}
/**
 * Source location where this step was detected in the original file. This is system-populated metadata and should not be set manually.
 */
export interface SourceLocation28 {
  /**
   * 1-indexed line number in the source file where the step was detected.
   */
  line: number;
  /**
   * 0-indexed character offset from the start of the source file where the step begins.
   */
  startIndex: number;
  /**
   * 0-indexed character offset from the start of the source file where the step ends (exclusive).
   */
  endIndex: number;
}
export interface Record2 {
  record: Record3;
  [k: string]: unknown;
}
export interface RecordDetailed1 {
  /**
   * File path of the recording. Supports the `.mp4`, `.webm`, and `.gif` extensions. If not specified, the file name is the ID of the step, and the extension is `.mp4`.
   */
  path?: string;
  /**
   * Directory of the file. If the directory doesn't exist, creates the directory.
   */
  directory?: string;
  /**
   * If `true`, overwrites the existing recording at `path` if it exists.
   */
  overwrite?: "true" | "false";
  /**
   * Identifier for this recording. A later `stopRecord` step can target it by name (`stopRecord: "<name>"`), which is how you stop a specific recording when several overlap. Names must be unique among recordings that are active at the same time. If omitted, the recording is anonymous and is stopped LIFO by an untargeted `stopRecord`.
   */
  name?: string;
  engine?: RecordingEngine1;
  [k: string]: unknown;
}
export interface RecordingEngineDetailed1 {
  /**
   * Recording engine. `browser` records the Chrome viewport (concurrency-safe); `ffmpeg` records the screen and supports any application.
   */
  name: "browser" | "ffmpeg";
  /**
   * What the `ffmpeg` engine captures. `display` records the full screen, `window` the active window, `viewport` the browser content area. Ignored by the `browser` engine, which always captures its tab. `window` and `viewport` are best-effort (captured full-screen, then cropped).
   */
  target?: "display" | "window" | "viewport";
  /**
   * Capture frame rate for the `ffmpeg` engine.
   */
  fps?: number;
}
export interface Common29 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep29;
  variables?: VariablesStep29;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  if?: Condition59;
  /**
   * Assertions for this step. As authored input, a custom condition expression (or array of expressions, combined with logical AND). In a test result, the runner replaces this with the array of articulated assertion records it evaluated (implicit then custom).
   */
  assertions?: Condition60 | Assertion29[];
  /**
   * Routing entries evaluated when this step passes. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onPass?: Routing120[];
  /**
   * Routing entries evaluated when this step fails. The first entry whose `if` matches applies; the default when none is set stops the test. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onFail?: Routing121[];
  /**
   * Routing entries evaluated when this step produces a warning. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onWarning?: Routing122[];
  /**
   * Routing entries evaluated when this step is skipped (reached but not run — unsafe-blocked or guard-`if` false). The first entry whose `if` matches applies. `continue` and `stop` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed. (`retry` is a no-op here — a step that never ran cannot be re-run.)
   */
  onSkip?: Routing123[];
  location?: SourceLocation29;
  /**
   * Path, relative to the run's artifact directory (the report's `runDir`), of the screenshot captured automatically after this step. Always a non-empty, forward-slash, relative path. Present only in test results, when `autoScreenshot` is enabled and the capture succeeded. This is system-populated metadata and should not be set manually.
   */
  autoScreenshot?: string;
  /**
   * Total number of times this step ran (the initial attempt plus retries) when a routing `retry` action re-ran it. Present only in test results, and only when the step was retried at least once (so the value is always >= 2). This is system-populated metadata and should not be set manually.
   */
  attempts?: number;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep29 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep29`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep29 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep29`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * An articulated assertion record produced by the runner for a step result. Each record names a single verification check, whether it passed, and the values it compared. The step's result is the roll-up of its assertion results (FAIL > WARNING > all-SKIPPED > PASS). System-populated; appears in test results, not in authored specs.
 */
export interface Assertion29 {
  /**
   * Human-readable articulation of the check, e.g. `exitCode in [0]`.
   */
  statement: string;
  /**
   * Who defined the assertion: `implicit` (runner-defined) or `custom` (user-defined).
   */
  source: "implicit" | "custom";
  /**
   * Outcome of evaluating the assertion.
   */
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  /**
   * The value (or values) the assertion expected. Optional.
   */
  expected?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * The value actually observed. Optional.
   */
  actual?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * Human-readable explanation of the outcome. Optional.
   */
  description?: string;
}
/**
 * Source location where this step was detected in the original file. This is system-populated metadata and should not be set manually.
 */
export interface SourceLocation29 {
  /**
   * 1-indexed line number in the source file where the step was detected.
   */
  line: number;
  /**
   * 0-indexed character offset from the start of the source file where the step begins.
   */
  startIndex: number;
  /**
   * 0-indexed character offset from the start of the source file where the step ends (exclusive).
   */
  endIndex: number;
}
export interface StopRecord2 {
  stopRecord: StopRecord3;
  [k: string]: unknown;
}
export interface StopRecordDetailed1 {
  /**
   * Name of the recording to stop. Matches the `name` given to a `record` step.
   */
  name: string;
}
export interface Common30 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep30;
  variables?: VariablesStep30;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  if?: Condition61;
  /**
   * Assertions for this step. As authored input, a custom condition expression (or array of expressions, combined with logical AND). In a test result, the runner replaces this with the array of articulated assertion records it evaluated (implicit then custom).
   */
  assertions?: Condition62 | Assertion30[];
  /**
   * Routing entries evaluated when this step passes. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onPass?: Routing124[];
  /**
   * Routing entries evaluated when this step fails. The first entry whose `if` matches applies; the default when none is set stops the test. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onFail?: Routing125[];
  /**
   * Routing entries evaluated when this step produces a warning. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onWarning?: Routing126[];
  /**
   * Routing entries evaluated when this step is skipped (reached but not run — unsafe-blocked or guard-`if` false). The first entry whose `if` matches applies. `continue` and `stop` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed. (`retry` is a no-op here — a step that never ran cannot be re-run.)
   */
  onSkip?: Routing127[];
  location?: SourceLocation30;
  /**
   * Path, relative to the run's artifact directory (the report's `runDir`), of the screenshot captured automatically after this step. Always a non-empty, forward-slash, relative path. Present only in test results, when `autoScreenshot` is enabled and the capture succeeded. This is system-populated metadata and should not be set manually.
   */
  autoScreenshot?: string;
  /**
   * Total number of times this step ran (the initial attempt plus retries) when a routing `retry` action re-ran it. Present only in test results, and only when the step was retried at least once (so the value is always >= 2). This is system-populated metadata and should not be set manually.
   */
  attempts?: number;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep30 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep30`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep30 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep30`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * An articulated assertion record produced by the runner for a step result. Each record names a single verification check, whether it passed, and the values it compared. The step's result is the roll-up of its assertion results (FAIL > WARNING > all-SKIPPED > PASS). System-populated; appears in test results, not in authored specs.
 */
export interface Assertion30 {
  /**
   * Human-readable articulation of the check, e.g. `exitCode in [0]`.
   */
  statement: string;
  /**
   * Who defined the assertion: `implicit` (runner-defined) or `custom` (user-defined).
   */
  source: "implicit" | "custom";
  /**
   * Outcome of evaluating the assertion.
   */
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  /**
   * The value (or values) the assertion expected. Optional.
   */
  expected?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * The value actually observed. Optional.
   */
  actual?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * Human-readable explanation of the outcome. Optional.
   */
  description?: string;
}
/**
 * Source location where this step was detected in the original file. This is system-populated metadata and should not be set manually.
 */
export interface SourceLocation30 {
  /**
   * 1-indexed line number in the source file where the step was detected.
   */
  line: number;
  /**
   * 0-indexed character offset from the start of the source file where the step begins.
   */
  startIndex: number;
  /**
   * 0-indexed character offset from the start of the source file where the step ends (exclusive).
   */
  endIndex: number;
}
export interface LoadVariables2 {
  loadVariables: LoadVariables3;
  [k: string]: unknown;
}
export interface Common31 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep31;
  variables?: VariablesStep31;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  if?: Condition63;
  /**
   * Assertions for this step. As authored input, a custom condition expression (or array of expressions, combined with logical AND). In a test result, the runner replaces this with the array of articulated assertion records it evaluated (implicit then custom).
   */
  assertions?: Condition64 | Assertion31[];
  /**
   * Routing entries evaluated when this step passes. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onPass?: Routing128[];
  /**
   * Routing entries evaluated when this step fails. The first entry whose `if` matches applies; the default when none is set stops the test. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onFail?: Routing129[];
  /**
   * Routing entries evaluated when this step produces a warning. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onWarning?: Routing130[];
  /**
   * Routing entries evaluated when this step is skipped (reached but not run — unsafe-blocked or guard-`if` false). The first entry whose `if` matches applies. `continue` and `stop` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed. (`retry` is a no-op here — a step that never ran cannot be re-run.)
   */
  onSkip?: Routing131[];
  location?: SourceLocation31;
  /**
   * Path, relative to the run's artifact directory (the report's `runDir`), of the screenshot captured automatically after this step. Always a non-empty, forward-slash, relative path. Present only in test results, when `autoScreenshot` is enabled and the capture succeeded. This is system-populated metadata and should not be set manually.
   */
  autoScreenshot?: string;
  /**
   * Total number of times this step ran (the initial attempt plus retries) when a routing `retry` action re-ran it. Present only in test results, and only when the step was retried at least once (so the value is always >= 2). This is system-populated metadata and should not be set manually.
   */
  attempts?: number;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep31 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep31`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep31 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep31`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * An articulated assertion record produced by the runner for a step result. Each record names a single verification check, whether it passed, and the values it compared. The step's result is the roll-up of its assertion results (FAIL > WARNING > all-SKIPPED > PASS). System-populated; appears in test results, not in authored specs.
 */
export interface Assertion31 {
  /**
   * Human-readable articulation of the check, e.g. `exitCode in [0]`.
   */
  statement: string;
  /**
   * Who defined the assertion: `implicit` (runner-defined) or `custom` (user-defined).
   */
  source: "implicit" | "custom";
  /**
   * Outcome of evaluating the assertion.
   */
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  /**
   * The value (or values) the assertion expected. Optional.
   */
  expected?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * The value actually observed. Optional.
   */
  actual?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * Human-readable explanation of the outcome. Optional.
   */
  description?: string;
}
/**
 * Source location where this step was detected in the original file. This is system-populated metadata and should not be set manually.
 */
export interface SourceLocation31 {
  /**
   * 1-indexed line number in the source file where the step was detected.
   */
  line: number;
  /**
   * 0-indexed character offset from the start of the source file where the step begins.
   */
  startIndex: number;
  /**
   * 0-indexed character offset from the start of the source file where the step ends (exclusive).
   */
  endIndex: number;
}
export interface DragAndDrop2 {
  dragAndDrop: DragAndDrop3;
  [k: string]: unknown;
}
/**
 * Drag and drop an element from source to target.
 */
export interface DragAndDrop3 {
  /**
   * The element to drag.
   */
  source: ElementSimple2 | ElementDetailed2;
  /**
   * The target location to drop the element.
   */
  target: ElementSimple3 | ElementDetailed3;
  /**
   * Duration of the drag operation in milliseconds.
   */
  duration?: number;
  [k: string]: unknown;
}
export interface Common32 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep32;
  variables?: VariablesStep32;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  if?: Condition65;
  /**
   * Assertions for this step. As authored input, a custom condition expression (or array of expressions, combined with logical AND). In a test result, the runner replaces this with the array of articulated assertion records it evaluated (implicit then custom).
   */
  assertions?: Condition66 | Assertion32[];
  /**
   * Routing entries evaluated when this step passes. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onPass?: Routing132[];
  /**
   * Routing entries evaluated when this step fails. The first entry whose `if` matches applies; the default when none is set stops the test. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onFail?: Routing133[];
  /**
   * Routing entries evaluated when this step produces a warning. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onWarning?: Routing134[];
  /**
   * Routing entries evaluated when this step is skipped (reached but not run — unsafe-blocked or guard-`if` false). The first entry whose `if` matches applies. `continue` and `stop` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed. (`retry` is a no-op here — a step that never ran cannot be re-run.)
   */
  onSkip?: Routing135[];
  location?: SourceLocation32;
  /**
   * Path, relative to the run's artifact directory (the report's `runDir`), of the screenshot captured automatically after this step. Always a non-empty, forward-slash, relative path. Present only in test results, when `autoScreenshot` is enabled and the capture succeeded. This is system-populated metadata and should not be set manually.
   */
  autoScreenshot?: string;
  /**
   * Total number of times this step ran (the initial attempt plus retries) when a routing `retry` action re-ran it. Present only in test results, and only when the step was retried at least once (so the value is always >= 2). This is system-populated metadata and should not be set manually.
   */
  attempts?: number;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep32 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep32`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep32 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep32`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * An articulated assertion record produced by the runner for a step result. Each record names a single verification check, whether it passed, and the values it compared. The step's result is the roll-up of its assertion results (FAIL > WARNING > all-SKIPPED > PASS). System-populated; appears in test results, not in authored specs.
 */
export interface Assertion32 {
  /**
   * Human-readable articulation of the check, e.g. `exitCode in [0]`.
   */
  statement: string;
  /**
   * Who defined the assertion: `implicit` (runner-defined) or `custom` (user-defined).
   */
  source: "implicit" | "custom";
  /**
   * Outcome of evaluating the assertion.
   */
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  /**
   * The value (or values) the assertion expected. Optional.
   */
  expected?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * The value actually observed. Optional.
   */
  actual?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * Human-readable explanation of the outcome. Optional.
   */
  description?: string;
}
/**
 * Source location where this step was detected in the original file. This is system-populated metadata and should not be set manually.
 */
export interface SourceLocation32 {
  /**
   * 1-indexed line number in the source file where the step was detected.
   */
  line: number;
  /**
   * 0-indexed character offset from the start of the source file where the step begins.
   */
  startIndex: number;
  /**
   * 0-indexed character offset from the start of the source file where the step ends (exclusive).
   */
  endIndex: number;
}
export interface LoadCookie2 {
  loadCookie: LoadCookie3;
  [k: string]: unknown;
}
export interface Common33 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep33;
  variables?: VariablesStep33;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  if?: Condition67;
  /**
   * Assertions for this step. As authored input, a custom condition expression (or array of expressions, combined with logical AND). In a test result, the runner replaces this with the array of articulated assertion records it evaluated (implicit then custom).
   */
  assertions?: Condition68 | Assertion33[];
  /**
   * Routing entries evaluated when this step passes. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onPass?: Routing136[];
  /**
   * Routing entries evaluated when this step fails. The first entry whose `if` matches applies; the default when none is set stops the test. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onFail?: Routing137[];
  /**
   * Routing entries evaluated when this step produces a warning. The first entry whose `if` matches applies. `continue`, `stop`, and `retry` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed.
   */
  onWarning?: Routing138[];
  /**
   * Routing entries evaluated when this step is skipped (reached but not run — unsafe-blocked or guard-`if` false). The first entry whose `if` matches applies. `continue` and `stop` are honored at runtime; `goToStep` and `goToTest` are validated but not yet executed. (`retry` is a no-op here — a step that never ran cannot be re-run.)
   */
  onSkip?: Routing139[];
  location?: SourceLocation33;
  /**
   * Path, relative to the run's artifact directory (the report's `runDir`), of the screenshot captured automatically after this step. Always a non-empty, forward-slash, relative path. Present only in test results, when `autoScreenshot` is enabled and the capture succeeded. This is system-populated metadata and should not be set manually.
   */
  autoScreenshot?: string;
  /**
   * Total number of times this step ran (the initial attempt plus retries) when a routing `retry` action re-ran it. Present only in test results, and only when the step was retried at least once (so the value is always >= 2). This is system-populated metadata and should not be set manually.
   */
  attempts?: number;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep33 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep33`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep33 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep33`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * An articulated assertion record produced by the runner for a step result. Each record names a single verification check, whether it passed, and the values it compared. The step's result is the roll-up of its assertion results (FAIL > WARNING > all-SKIPPED > PASS). System-populated; appears in test results, not in authored specs.
 */
export interface Assertion33 {
  /**
   * Human-readable articulation of the check, e.g. `exitCode in [0]`.
   */
  statement: string;
  /**
   * Who defined the assertion: `implicit` (runner-defined) or `custom` (user-defined).
   */
  source: "implicit" | "custom";
  /**
   * Outcome of evaluating the assertion.
   */
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  /**
   * The value (or values) the assertion expected. Optional.
   */
  expected?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * The value actually observed. Optional.
   */
  actual?:
    | unknown[]
    | boolean
    | number
    | null
    | number
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * Human-readable explanation of the outcome. Optional.
   */
  description?: string;
}
/**
 * Source location where this step was detected in the original file. This is system-populated metadata and should not be set manually.
 */
export interface SourceLocation33 {
  /**
   * 1-indexed line number in the source file where the step was detected.
   */
  line: number;
  /**
   * 0-indexed character offset from the start of the source file where the step begins.
   */
  startIndex: number;
  /**
   * 0-indexed character offset from the start of the source file where the step ends (exclusive).
   */
  endIndex: number;
}
export interface Wait2 {
  wait: Wait3;
  [k: string]: unknown;
}
