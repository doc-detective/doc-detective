import { log } from "./utils.js";
// const { JSONPath } = require("jsonpath-plus");
// const xpath = require("xpath");
// const { DOMParser } = require("xmldom");
import jq from "jq-web";

/**
 * Shared pattern source for a $$ meta-value token (the part after "$$"),
 * with an optional trailing JSON pointer (#/...). Used by BOTH replaceMetaValues
 * and hasUnresolvedMetaReference so the two regexes can never drift.
 *
 * The token character class is [\w.\[\]\-~] = [A-Za-z0-9_.\[\]\-~]. The `-` and
 * `~` are included so DEFAULT stepIds resolve: a default stepId is the
 * UUID/`testId~sHASH` form, which is hyphenated and may contain "~". With the
 * old `\w`-only class, a token like `$$steps.my-test~s3f2a-1.outputs.exitCode`
 * matched only up to the first `-`, breaking resolution. The `-` is placed at
 * the END of the class so it is a literal, not a range.
 *
 * Edge note: because `-` is now a valid token char, a spaced subtraction like
 * `$$x - 1` is unaffected (the space separates `-` from the token, so only
 * `$$x` is captured). But `$$x-1` (no spaces) would now capture `x-1` as the
 * token. This is acceptable: conditions use spaced comparison/word operators,
 * so a token-adjacent `-` is intended to be part of the id, not subtraction.
 */
const META_TOKEN_SOURCE = "\\$\\$([\\w.\\[\\]\\-~]+(?:#\\/[\\w\\/\\[\\]]+)*)";

/**
 * Resolves runtime expressions that may contain meta values and operators.
 * Can handle both standalone expressions and strings with embedded expressions.
 * @param {string} expression - The expression to resolve.
 * @param {object} context - Context object containing meta values.
 * @returns {*} - The resolved value of the expression.
 */
async function resolveExpression({ expression, context, allowOperators = false }: { expression: any; context: any; allowOperators?: boolean }): Promise<any> {
  try {
    return await resolveExpressionOrThrow({ expression, context, allowOperators });
  } catch (error: any) {
    // Back-compat swallow for the STANDALONE path (step.variables and any direct
    // caller): a malformed/failing expression degrades to its literal input text
    // rather than crashing the step. Logged at "warning" (an intentional swallow,
    // not a surfaced failure). The embedded {{...}} loop does NOT rely on this —
    // it calls resolveExpressionOrThrow directly so it can preserve the author's
    // original {{...}} on failure instead of leaking the internal sub-expression
    // (#423/#424). See adrs/01014-expression-error-contract.md.
    log(
      `Could not resolve expression '${expression}': ${error.message}`,
      "warning"
    );
    return expression;
  }
}

/**
 * Core resolver: the real work behind resolveExpression, WITHOUT the back-compat
 * error swallow. Genuine evaluation errors (jq rejection, `new Function` throw)
 * propagate to the caller so structured callers can react to failure. The public
 * resolveExpression wraps this and swallows for back-compat; resolveEmbeddedExpressions
 * calls it directly so it can preserve the original {{...}} on failure.
 * @param {string} expression - The expression to resolve.
 * @param {object} context - Context object containing meta values.
 * @returns {*} - The resolved value of the expression.
 */
async function resolveExpressionOrThrow({ expression, context, allowOperators = false }: { expression: any; context: any; allowOperators?: boolean }): Promise<any> {
  if (typeof expression !== "string") {
    return expression;
  }

  // First check if this is a string with embedded expressions {{...}}
  if (expression.includes("{{") && expression.includes("}}")) {
    return await resolveEmbeddedExpressions(expression, context);
  }

  // For standalone expressions, replace all meta values
  let resolvedExpression = replaceMetaValues(expression, context, allowOperators);

  // Check if the expression is a single meta value with no operators
  if (
    resolvedExpression !== expression &&
    !containsOperators(resolvedExpression, allowOperators)
  ) {
    return resolvedExpression;
  }

  // Evaluate the expression if it contains operators
  if (containsOperators(resolvedExpression, allowOperators)) {
    let evaluatedExpression = await evaluateExpression(
      resolvedExpression,
      context
    );
    // If the evaluated expression is an object, convert it to a string
    if (typeof evaluatedExpression === "object") {
      evaluatedExpression = JSON.stringify(evaluatedExpression);
    }
    return evaluatedExpression;
  }

  return resolvedExpression;
}

/**
 * Replaces all meta values in an expression with their actual values from context.
 * @param {string} expression - The expression containing meta values.
 * @param {object} context - Context object containing meta values.
 * @returns {*} - The expression with meta values replaced.
 */
function replaceMetaValues(expression: string, context: any, allowOperators: boolean = false): any {
  // Regular expression to match meta values with optional JSON pointer.
  // Shares META_TOKEN_SOURCE with hasUnresolvedMetaReference so they can't drift.
  const metaValueRegex = new RegExp(META_TOKEN_SOURCE, "g");

  let result: any = expression;
  let match;
  const hasOperators = containsOperators(expression, allowOperators);

  while ((match = metaValueRegex.exec(expression)) !== null) {
    const metaValuePath = match[1];
    const metaValue = getMetaValue(metaValuePath, context);

    // Replace the meta value in the expression
    if (metaValue !== undefined) {
      let replaceValue;

      if (typeof metaValue === "object") {
        replaceValue = JSON.stringify(metaValue);
      } else if (typeof metaValue === "string" && hasOperators) {
        // Inline ONLY a bare JS literal (a number, or the boolean/null keywords) so
        // numeric/boolean comparison semantics are preserved; quote+escape EVERY other
        // string. Any other string inlined raw (e.g. "O'Reilly", "a@b", "hello world")
        // is mis-parsed by the downstream literal masking and operator rewrites, or is an
        // undefined identifier, so `new Function` throws and the assertion fails closed.
        if (
          !(
            /^-?\d+(?:\.\d+)?$/.test(metaValue) ||
            metaValue === "true" ||
            metaValue === "false" ||
            metaValue === "null"
          )
        ) {
          // Build a JS string literal for `new Function`. Escape backslashes
          // FIRST, then double-quotes, then literal line terminators. Without
          // the \n/\r escapes a multi-line step-output value produces an
          // UNTERMINATED string literal (a SyntaxError), so the evaluator throws
          // and the condition silently fails closed with a confusing error.
          replaceValue = `"${metaValue
            .replace(/\\/g, "\\\\")
            .replace(/"/g, '\\"')
            .replace(/\n/g, "\\n")
            .replace(/\r/g, "\\r")
            .replace(/\u2028/g, "\\u2028")
            .replace(/\u2029/g, "\\u2029")}"`;
        } else {
          replaceValue = metaValue;
        }
      } else {
        replaceValue = metaValue.toString();
      }

      // Use a function replacer so "$" sequences in the resolved value (e.g. a
      // string containing "$$foo" or "$&") are inserted literally rather than
      // being interpreted as String.replace special replacement patterns.
      const literalReplacement = replaceValue;
      result = result.replace(match[0], () => literalReplacement);
    }
  }

  return result;
}

/**
 * Condition-path helper (Defect B): detects whether an assertion references a
 * meta value ($$token) that does NOT resolve in the given context. This is the
 * fail-closed signal for evaluateAssertion. It detects UNRESOLVED references at
 * resolution time (by re-running the same getMetaValue lookups the resolver
 * uses) instead of scanning the RESOLVED output for /\$\$\w/ — the latter
 * false-positives when a resolved value legitimately contains literal "$$word".
 * This helper lives only on the condition path; the default resolveExpression
 * path (interpolation/variables) still passes unresolved tokens through as
 * literals and must NOT be forced false.
 * @param {string} expression - The raw assertion expression.
 * @param {object} context - Context object containing meta values.
 * @returns {boolean} - True iff some referenced $$token resolved to undefined.
 */
function hasUnresolvedMetaReference(expression: string, context: any): boolean {
  if (typeof expression !== "string") return false;
  // Mask quoted string literals first so a $$token written INSIDE a literal
  // (e.g. `$$a == "$$foo"`) is not mistaken for a real meta reference — those
  // are intentional literals, not lookups. Only $$tokens in the JS skeleton are
  // genuine references whose undefined resolution should fail the condition.
  const skeleton = expression.replace(
    /"[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*'/g,
    " "
  );
  const metaValueRegex = new RegExp(META_TOKEN_SOURCE, "g");
  let match;
  while ((match = metaValueRegex.exec(skeleton)) !== null) {
    if (getMetaValue(match[1]!, context) === undefined) {
      return true;
    }
  }
  return false;
}

/**
 * Gets a meta value from the context based on its path and scope.
 * @param {string} path - The path to the meta value.
 * @param {object} context - Context object containing meta values.
 * @returns {*} - The value of the meta value, or undefined if not found.
 */
function getMetaValue(path: string, context: any): any {
  if (!context) {
    return undefined;
  }

  // Handle JSON pointer notation (#/path/to/property)
  const [basePath, jsonPointer] = path.split("#");

  // Replace template variables in the path (e.g., {{id}})
  const resolvedPath = resolvePathTemplateVariables(basePath, context);

  // Get the base value based on path
  let value = getNestedProperty(context, resolvedPath);

  // Apply JSON pointer if present
  if (jsonPointer && value) {
    try {
      const jsonPath = jsonPointer.split("/").filter(Boolean);
      for (const key of jsonPath) {
        value = value[key];
        if (value === undefined) break;
      }
    } catch (error: any) {
      log(
        `Error applying JSON pointer ${jsonPointer} to value: ${error.message}`,
        "error"
      );
    }
  }

  return value;
}

/**
 * Replaces simple template variables (e.g., {{id}}) in a path with their values from context.
 * This is specifically for meta value paths, not for general expression evaluation.
 * @param {string} path - The path containing template variables.
 * @param {object} context - Context object containing variable values.
 * @returns {string} - The path with template variables replaced.
 */
function resolvePathTemplateVariables(path: string, context: any): string {
  const templateRegex = /\{\{(\w+)\}\}/g;
  return path.replace(templateRegex, (match: string, varName: string) => {
    // Resolve path variable values
    if (context && context.id && varName === "id") {
      return context.id;
    }
    // Add other variable resolutions as needed
    return match; // Return the original if not found
  });
}

/**
 * Resolves embedded expressions within a string using {{expression}} syntax.
 * This handles full expression evaluation between {{ and }} delimiters.
 * @param {string} str - The string containing embedded expressions.
 * @param {object} context - Context object containing values for evaluation.
 * @returns {string} - The string with embedded expressions replaced with their evaluated values.
 */
async function resolveEmbeddedExpressions(str: any, context: any): Promise<any> {
  /* c8 ignore next 3 - defensive: the only caller (resolveExpressionOrThrow) already guards typeof !== "string" before reaching here */
  if (typeof str !== "string") {
    return str;
  }
  const expressionRegex = /\{\{([^{}]+)\}\}/g;

  const parts: string[] = [];
  let lastIdx = 0;
  for (const m of str.matchAll(expressionRegex)) {
    parts.push(str.slice(lastIdx, m.index));
    try {
      // Resolve any meta values within the expression. Use the THROWING worker
      // (not the swallowing public resolveExpression) so a genuine failure lands
      // in the catch below and preserves the author's original {{...}}, rather
      // than leaking the half-resolved internal sub-expression (#423/#424).
      const resolvedExpression = await resolveExpressionOrThrow({
        expression: m[1].trim(),
        context: context,
      });

      // Convert the result to string for embedding
      if (resolvedExpression === undefined || resolvedExpression === null) {
        parts.push("");
        /* c8 ignore next 2 - defensive: resolveExpressionOrThrow already JSON.stringifies any object result, so an object never reaches here */
      } else if (typeof resolvedExpression === "object") {
        parts.push(JSON.stringify(resolvedExpression));
      } else {
        parts.push(String(resolvedExpression));
      }
    } catch (error: any) {
      log(
        `Could not evaluate embedded expression '${m[1]}'; preserving it verbatim: ${error.message}`,
        "warning"
      );
      parts.push(m[0]); // Preserve the original {{...}} when evaluation fails.
    }
    lastIdx = m.index! + m[0].length;
  }
  parts.push(str.slice(lastIdx));
  return parts.join("");
}

/**
 * Gets a nested property from an object by its path.
 * @param {object} obj - The object to get the property from.
 * @param {string} path - The path to the property (e.g., 'a.b.c' or 'a.b[0].c').
 * @returns {*} - The value of the property, or undefined if not found.
 */
function getNestedProperty(obj: any, path: string): any {
  if (!obj || !path) return undefined;

  const parts = path.split(".");
  let current = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;

    // Check if this part uses array notation like "data[0]"
    const arrayMatch = part.match(/^([\w$]+)(?:\[(\d+)\])$/);
    if (arrayMatch) {
      const [, propName, indexStr] = arrayMatch;
      const index = parseInt(indexStr!, 10);

      // First access the array property
      current = current[propName!];
      if (current === null || current === undefined) return undefined;

      // Then access the array index
      current = current[index];
    } else {
      current = current[part];
    }
  }

  return current;
}

/**
 * Checks if an expression contains operators.
 * @param {string} expression - The expression to check.
 * @returns {boolean} - Whether the expression contains operators.
 */
function containsOperators(expression: string, allowOperators: boolean = false): boolean {
  // Function-call operators are ALWAYS active (today's behavior). These are used
  // by the default resolveExpression path (variables, interpolation) and must
  // remain unchanged regardless of allowOperators.
  const functionOperatorRegex = /jq\(|extract\(/;
  if (functionOperatorRegex.test(expression)) {
    return true;
  }

  // Comparison and word operators are OPT-IN. They are only active on the
  // condition path (evaluateAssertion), so operator-like text inside an
  // ordinary variable value (e.g. "a > b", "x contains y", a file path
  // containing "contains") is never evaluated.
  if (!allowOperators) {
    return false;
  }

  // Comparison operators. Bounded so the multi-char operators (==, !=, >=, <=)
  // are matched as units and the bare < / > don't get confused with => / <=.
  // We require a non-operator char (or start) before, and a non-operator char
  // (or end) after, so that ">=" is not also seen as ">" + "=".
  const comparisonRegex = /(==|!=|>=|<=|>|<)/;
  if (comparisonRegex.test(expression)) {
    return true;
  }

  // Word operators. Whitespace/anchor-bounded so identifiers like "containsFoo",
  // "matchesRegex", or file paths are not matched — only the standalone words
  // surrounded by whitespace (or string boundaries) count.
  const wordOperatorRegex = /(^|\s)(contains|oneOf|matches)(\s|$)/;
  if (wordOperatorRegex.test(expression)) {
    return true;
  }

  return false;
}

/**
 * Evaluates an expression containing operators.
 * @param {string} expression - The expression to evaluate.
 * @param {object} context - Context object that might be needed for evaluation.
 * @returns {*} - The result of the evaluation.
 */
async function evaluateExpression(expression: string, context: any): Promise<any> {
  try {
    // Handle special operators that aren't valid JS syntax
    expression = preprocessExpression(expression);

    // Create a safe evaluation context
    const evalContext: Record<string, any> = {
      ...context,
      contains: (a: any, b: any) => {
        if (typeof a === "string") return a.includes(b);
        if (Array.isArray(a)) return a.includes(b);
        if (typeof a === "object" && a !== null) return b in a;
        return false;
      },
      oneOf: (value: any, options: any) => {
        if (!Array.isArray(options)) return false;
        return options.includes(value);
      },
      matches: (str: any, regex: any) => {
        if (typeof str !== "string") return false;
        return new RegExp(regex).test(str);
      },
      //   jsonpath: (obj, path) => {
      //     try {
      //       return JSONPath({ path, json: obj });
      //     } catch (e) {
      //       log(`JSONPath error: ${e.message}`, "error");
      //       return null;
      //     }
      //   },
      //   xpath: (xml, path) => {
      //     try {
      //       const doc = new DOMParser().parseFromString(xml);
      //       return xpath.select(path, doc);
      //     } catch (e) {
      //       log(`XPath error: ${e.message}`, "error");
      //       return null;
      //     }
      //   },
      extract: (str: string, regex: string) => {
        try {
          const re = new RegExp(regex);
          const match = str.match(re);
          if (match && match.length > 1) {
            return match[1]; // First capture group
          } else {
            return match ? match[0] : null; // Full match or null if no match
          }
        } catch (e: any) {
          log(`Regex extraction error: ${e.message}`, "error");
          return null;
        }
      },
      // jq-web resolves to the module, then jq.json(...) does the query. A bad
      // query REJECTS asynchronously, so a synchronous try/catch here could never
      // catch it (it was dead code, #425). Let the rejection propagate: the
      // awaiting resolveExpressionOrThrow surfaces it, so the embedded loop
      // preserves the original {{...}} and the condition path fails closed.
      jq: (json: any, query: string) => jq.then((j: any) => j.json(json, query)),
    };

    // Use Function constructor for safer evaluation. The expression's string
    // literals are already escaped at construction — masked user literals are
    // restored verbatim as valid JS source, and the `matches /regex/` pattern
    // escapes its own backslashes/quotes. A previous blunt global
    // `\\` -> `\\\\` doubling here corrupted intentional escapes (e.g. \" inside
    // a literal, or a regex containing a double-quote), so it has been removed.
    const evaluator = new Function(
      ...Object.keys(evalContext),
      `return ${expression};`
    );
    return evaluator(...Object.values(evalContext));
  } catch (error: any) {
    log(
      `Error evaluating expression '${expression}': ${error.message}`,
      "error"
    );
    return undefined;
  }
}

/**
 * Preprocesses an expression to handle special operators like 'contains', 'oneOf', and 'matches'.
 * Also handles unquoted string literals that should be treated as strings not variables.
 * @param {string} expression - The expression to preprocess.
 * @returns {string} - The preprocessed expression.
 */
function preprocessExpression(expression: string): string {
  // Quote-awareness (Defect A): the infix/comparison rewrites below scan RAW
  // text, so a quoted string literal containing spaces or operator
  // characters/words (e.g. "a > b", "x contains y") would get mangled. To
  // prevent that, MASK every quoted string literal ('...' or "...") with a
  // space/operator-free placeholder token BEFORE running the rewrites, then
  // RESTORE the literals at the very end (before the string is handed to
  // `new Function`). Masking runs first so operator detection/quoting never
  // scans inside string contents. The `matches /regex/` slash form is NOT a
  // quoted literal, so it is left untouched here and handled normally below.
  const maskedLiterals: string[] = [];
  expression = expression.replace(
    /"[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*'/g,
    (literal: string) => {
      const token = `__DDSTR${maskedLiterals.length}__`;
      maskedLiterals.push(literal);
      return token;
    }
  );

  // Restore a possibly-masked token back to its original literal. Placeholder
  // tokens are emitted verbatim by the rewrites (they look like a bare
  // identifier), so quoteIfLiteral must treat them as already-quoted.
  const isMaskToken = (token: string): boolean => /^__DDSTR\d+__$/.test(token);

  // Helper: quote a token as a JS string literal unless it is already a
  // quoted string, a number (incl. decimals), a boolean/null literal, an
  // array/object literal, a parenthesized/function expression, or a masked
  // string-literal placeholder (which restores to its own quoted literal).
  const quoteIfLiteral = (token: string): string => {
    if (isMaskToken(token)) return token; // masked literal, restored later
    if (/^['"`]/.test(token)) return token; // already quoted
    if (/^-?\d+(\.\d+)?$/.test(token)) return token; // numeric
    if (/^[\[\{\(]/.test(token)) return token; // array/object/expr literal
    if (["true", "false", "null", "undefined", "NaN", "Infinity"].includes(token))
      return token;
    return `"${token}"`;
  };

  // ReDoS hardening (CodeQL js/polynomial-redos). The infix-operator rewrites
  // below scan the WHOLE expression with a global `replace`. Their left operand
  // pattern (`LEFT`) and the bare RHS used an UNBOUNDED `\S+` (and the unrolled
  // quoted forms). On an adversarial operand — a long run of non-space chars
  // that ALMOST matches but lacks the trailing operator — the engine retries the
  // long scan at every start position, which is polynomial (O(n^2)) in the
  // operand length. Two structural mitigations, neither of which changes the
  // result for any realistic condition:
  //   1. Keyword guard: skip a rewrite entirely unless its operator word is
  //      actually present (whitespace/anchor-bounded). The common attack — long
  //      junk with no operator at all — then never runs the expensive regex.
  //   2. Bounded quantifiers: cap every unbounded run with an explicit upper
  //      bound (`OPERAND_MAX`). A bounded quantifier cannot backtrack
  //      super-linearly, so even a keyword-bearing adversarial input is linear.
  // Operands longer than the bound are simply left un-rewritten (treated as
  // ordinary identifiers); real condition operands are far shorter.
  const OPERAND_MAX = 1024;
  const hasWordOperator = (op: string): boolean =>
    new RegExp(`(^|\\s)${op}(\\s|$)`).test(expression);
  // A left operand for an infix word operator: a quoted string literal (which
  // may itself contain spaces) or a run of non-space characters — all bounded.
  // Note: string literals are masked to `__DDSTRn__` BEFORE this point, so the
  // quoted alternatives are effectively defensive; the bare run is what matches.
  const LEFT =
    `("[^"\\\\]{0,${OPERAND_MAX}}(?:\\\\.[^"\\\\]{0,${OPERAND_MAX}}){0,${OPERAND_MAX}}"` +
    `|'[^'\\\\]{0,${OPERAND_MAX}}(?:\\\\.[^'\\\\]{0,${OPERAND_MAX}}){0,${OPERAND_MAX}}'` +
    `|\\S{1,${OPERAND_MAX}})`;
  const RIGHT_BARE = `(\\S{1,${OPERAND_MAX}})`;

  // Replace "contains" operator (infix): <left> contains <right>
  if (hasWordOperator("contains")) {
    expression = expression.replace(
      new RegExp(`${LEFT}\\s+contains\\s+${RIGHT_BARE}`, "g"),
      (_m: string, left: string, right: string) =>
        `contains(${quoteIfLiteral(left)}, ${quoteIfLiteral(right)})`
    );
  }

  // Replace "oneOf" operator (infix): <value> oneOf <options>
  if (hasWordOperator("oneOf")) {
    expression = expression.replace(
      new RegExp(`${LEFT}\\s+oneOf\\s+(.+)$`),
      (_m: string, left: string, right: string) =>
        `oneOf(${quoteIfLiteral(left)}, ${right.trim()})`
    );
  }

  // Replace "matches" operator (infix): <str> matches <regex>.
  // The regex may be written as a /pattern/ literal (which may contain spaces)
  // or a bare/quoted string (no spaces). The RHS alternation tries the
  // slash-literal form first so a pattern like /hello world/ is captured whole.
  if (hasWordOperator("matches")) {
    expression = expression.replace(
      new RegExp(
        `${LEFT}\\s+matches\\s+(\\/[^\\/\\\\]{0,${OPERAND_MAX}}(?:\\\\.[^\\/\\\\]{0,${OPERAND_MAX}}){0,${OPERAND_MAX}}\\/[a-z]*|\\S{1,${OPERAND_MAX}})`,
        "g"
      ),
      (_m: string, left: string, right: string) => {
        // Strip /.../ regex-literal delimiters into a plain string pattern.
        const reLiteral = right.match(/^\/(.*)\/[a-z]*$/);
        // Build a JS string literal for the regex source. Escape backslashes
        // FIRST, then double-quotes, so a pattern like /\d/ or /a"b/ survives
        // intact into `new Function` (CodeQL: incomplete string escaping). For a
        // bare/quoted RHS, defer to quoteIfLiteral.
        const pattern = reLiteral
          ? `"${reLiteral[1]!.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
          : quoteIfLiteral(right);
        return `matches(${quoteIfLiteral(left)}, ${pattern})`;
      }
    );
  }

  // Replace "extract" operator if used with infix notation. A masked literal
  // placeholder (__DDSTRn__) is already a quoted literal once restored, so it
  // must NOT be re-wrapped in quotes here. ReDoS-hardened (CodeQL
  // js/polynomial-redos): guarded on the keyword's presence and the unbounded
  // `\S+` operands bounded with `OPERAND_MAX`, so an adversarial non-`extract`
  // operand can't drive O(n^2) backtracking across the global scan.
  if (/(^|\s)extract(\s|$)/.test(expression))
  expression = expression.replace(
    new RegExp(`(\\S{1,${OPERAND_MAX}})\\s+extract\\s+(\\S{1,${OPERAND_MAX}})`, "g"),
    (match: string, left: string, right: string) => {
      // If left side is not quoted and isn't a defined variable, add quotes
      if (
        !isMaskToken(left) &&
        ((!/^['"`]/.test(left) && !/^[\d\{\}\[\]\(\)]/.test(left)) ||
          typeof left === "string")
      ) {
        left = `"${left}"`;
      }
      // If right side is not quoted and looks like a string literal, add quotes
      if (!isMaskToken(right) && !/^['"`]/.test(right)) {
        right = `"${right}"`;
      }
      return `extract(${left}, ${right})`;
    }
  );
  // Fix quoting around "extract" operator
  // If inputs are not quoted, add quotes. Operand runs are bounded
  // (CodeQL js/polynomial-redos) so a long comma-free argument can't backtrack.
  expression = expression.replace(
    new RegExp(`extract\\(([^,]{1,${OPERAND_MAX}}),\\s*([^,]{1,${OPERAND_MAX}})\\)`, "g"),
    (match: string, left: string, right: string) => {
      if (!isMaskToken(left.trim()) && !/^['"`]/.test(left)) {
        left = `"${left}"`;
      }
      if (!isMaskToken(right.trim()) && !/^['"`]/.test(right)) {
        right = `"${right}"`;
      }
      return `extract(${left}, ${right})`;
    }
  );

  // Handle unquoted identifiers on both sides of comparisons
  // First handle unquoted identifiers on the right side of comparisons
  expression = expression.replace(
    /(==|!=|>|>=|<|<=)\s+([A-Za-z]\w*)(?!\s*[\(\.\[])/g,
    (match: string, operator: string, word: string) => {
      // Skip JavaScript keywords that might be valid in expressions
      const jsKeywords = [
        "true",
        "false",
        "null",
        "undefined",
        "NaN",
        "Infinity",
      ];
      if (!jsKeywords.includes(word)) {
        return `${operator} "${word}"`;
      }
      return match;
    }
  );

  // Now handle potential string literals without quotes on the LEFT side of a
  // comparison (like variable names not in context). Only match tokens that
  // START with a letter so pure-numeric operands — including decimals like
  // "0.6" where the dot is a word boundary — are never quoted and stay
  // numeric. Anchored to whitespace/start so we don't grab a digit run that
  // follows a decimal point.
  expression = expression.replace(
    /(^|\s)([A-Za-z]\w*)\s*(==|!=|>=|<=|>|<)/g,
    (match: string, pre: string, word: string, operator: string) => {
      // Skip meta values (already processed) and known variables in context
      if (
        word.startsWith("$$") ||
        ["true", "false", "null", "undefined", "NaN", "Infinity"].includes(word)
      ) {
        return match;
      }
      // Add quotes around identifiers that might be string literals
      return `${pre}"${word}" ${operator}`;
    }
  );

  // RESTORE masked string literals (Defect A). Done last, after every rewrite,
  // so the literal contents are reinserted verbatim into the JS skeleton and
  // never participated in operator detection/quoting. Out of scope: bare
  // bracket regex `matches [a-c]+` (use the slash form `/[a-c]+/`); `oneOf`
  // greedily consumes to end-of-string (must be the last operator).
  if (maskedLiterals.length > 0) {
    expression = expression.replace(
      /__DDSTR(\d+)__/g,
      (_m: string, idx: string) => maskedLiterals[Number(idx)]!
    );
  }

  return expression;
}

/**
 * Evaluates an assertion based on the given expression and context.
 * @param {string} assertion - The assertion expression.
 * @param {object} context - Context object containing meta values.
 * @returns {boolean} - Whether the assertion passes.
 */
async function evaluateAssertion(assertion: any, context: any): Promise<boolean> {
  try {
    // Fail-closed (Defect B): detect UNRESOLVED meta references at resolution
    // time, by re-running the same getMetaValue lookups against the raw
    // assertion. If any referenced $$token resolves to undefined, the condition
    // is false. We do NOT scan the RESOLVED string for /\$\$\w/ — that
    // false-positives when a resolved value legitimately contains literal
    // "$$word". The default resolveExpression path is unaffected: it still
    // passes unresolved tokens through as literals for interpolation/variables.
    if (
      typeof assertion === "string" &&
      hasUnresolvedMetaReference(assertion, context)
    ) {
      log(
        `Condition '${assertion}' has an unresolved meta value; treating as false.`,
        "debug"
      );
      return false;
    }

    const resolvedAssertion = await resolveExpression(
      {expression: assertion,
      context: context,
      allowOperators: true}
    );

    // If the resolved assertion is already a boolean, return it
    if (typeof resolvedAssertion === "boolean") {
      return resolvedAssertion;
    }

    // If it's a string that equals 'true' or 'false', convert to boolean
    if (resolvedAssertion === "true") return true;
    if (resolvedAssertion === "false") return false;

    // Otherwise evaluate it
    return !!resolvedAssertion;
  } catch (error: any) {
    log(`Error evaluating assertion '${assertion}': ${error.message}`, "error");
    return false;
  }
}

export { resolveExpression, evaluateAssertion, getMetaValue, replaceMetaValues };
