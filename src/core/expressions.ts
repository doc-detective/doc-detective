import { log } from "./utils.js";
// const { JSONPath } = require("jsonpath-plus");
// const xpath = require("xpath");
// const { DOMParser } = require("xmldom");
import jq from "jq-web";

/**
 * Resolve a runtime expression that may contain meta value references ($$...), embedded `{{ ... }}` segments, or operator expressions.
 *
 * Resolves embedded `{{ ... }}` expressions, replaces meta-value placeholders from `context`, and evaluates expressions containing operators; on evaluation producing an object the result is returned as a JSON string. If the input is not a string it is returned unchanged. On error the original expression is returned.
 *
 * @param expression - The expression to resolve; may be a non-string value, a string with embedded `{{ ... }}` segments, or a standalone expression containing meta references or operators.
 * @param context - Object providing meta values and helpers used during resolution and evaluation.
 * @returns The resolved value. If the input was non-string it is returned unchanged; if evaluation produces an object it is returned as a JSON string; otherwise the resolved string (or the original expression on error).
 */
async function resolveExpression({ expression, context }: { expression: any; context: any }): Promise<any> {
  if (typeof expression !== "string") {
    return expression;
  }

  try {
    // First check if this is a string with embedded expressions {{...}}
    if (expression.includes("{{") && expression.includes("}}")) {
      return await resolveEmbeddedExpressions(expression, context);
    }

    // For standalone expressions, replace all meta values
    let resolvedExpression = replaceMetaValues(expression, context);

    // Check if the expression is a single meta value with no operators
    if (
      resolvedExpression !== expression &&
      !containsOperators(resolvedExpression)
    ) {
      return resolvedExpression;
    }

    // Evaluate the expression if it contains operators
    if (containsOperators(resolvedExpression)) {
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
  } catch (error: any) {
    log(
      `Error resolving expression '${expression}': ${error.message}`,
      "error"
    );
    return expression;
  }
}

/**
 * Replace all `$$path` meta references in `expression` with their values from `context`.
 *
 * Objects are inserted as JSON strings. When the expression contains operators, string
 * values that include spaces or special characters are wrapped in quotes and escaped.
 *
 * @param expression - The input expression containing `$$` meta references (e.g. `$$data.item# /0/name`).
 * @param context - Context object used to resolve meta paths.
 * @returns The expression with meta references substituted by their resolved values.
 */
function replaceMetaValues(expression: string, context: any): any {
  // Regular expression to match meta values with optional JSON pointer
  const metaValueRegex = /\$\$([\w\.\[\]]+(?:#\/[\w\/\[\]]+)*)/g;

  let result: any = expression;
  let match;
  const hasOperators = containsOperators(expression);

  while ((match = metaValueRegex.exec(expression)) !== null) {
    const metaValuePath = match[1];
    const metaValue = getMetaValue(metaValuePath, context);

    // Replace the meta value in the expression
    if (metaValue !== undefined) {
      let replaceValue;

      if (typeof metaValue === "object") {
        replaceValue = JSON.stringify(metaValue);
      } else if (typeof metaValue === "string" && hasOperators) {
        // If the meta value is a string and we're in an expression with operators,
        // only quote it if it contains spaces or special characters
        if (/[\s\(\)\[\]\{\}\,\;\:\.\+\-\*\/\|\&\!\?\<\>\=]/.test(metaValue)) {
          replaceValue = `"${metaValue.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
        } else {
          replaceValue = metaValue;
        }
      } else {
        replaceValue = metaValue.toString();
      }

      result = result.replace(match[0], replaceValue);
    }
  }

  return result;
}

/**
 * Retrieve a meta value from the provided context by path, supporting template variables (e.g., `{{id}}`) and an optional JSON Pointer suffix after `#`.
 *
 * @param path - Dot-separated base path into `context`. May include `{{...}}` template variables and an optional `#/<json/pointer>` segment to traverse into the resolved value.
 * @param context - Object that holds meta values.
 * @returns The value found at the resolved location, or `undefined` if not present.
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
 * Replaces simple template variables (e.g., {{id}}) in a meta path with values from the provided context.
 *
 * Currently only `{{id}}` is resolved to `context.id`; unknown templates are left unchanged.
 *
 * @param path - The path containing `{{...}}` template variables.
 * @param context - Object providing template values (uses `context.id` for `{{id}}`).
 * @returns The path with resolved template variables; unresolved templates are unchanged.
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
 * Evaluate and replace all {{...}} expressions found within a string.
 *
 * Embedded expressions are resolved using the provided context. Non-string
 * results are converted to strings; objects are JSON-stringified. If
 * evaluating an embedded expression fails, the original `{{...}}` segment is
 * left intact.
 *
 * @param str - The string containing one or more `{{ expression }}` segments
 * @param context - Context used when resolving each embedded expression
 * @returns The input string with each evaluated `{{...}}` segment replaced by its stringified result
 */
async function resolveEmbeddedExpressions(str: any, context: any): Promise<any> {
  if (typeof str !== "string") {
    return str;
  }
  const expressionRegex = /\{\{([^{}]+)\}\}/g;

  const parts: string[] = [];
  let lastIdx = 0;
  for (const m of str.matchAll(expressionRegex)) {
    parts.push(str.slice(lastIdx, m.index));
    try {
      // Resolve any meta values within the expression
      const resolvedExpression = await resolveExpression({
        expression: m[1].trim(),
        context: context,
      });

      // Convert the result to string for embedding
      if (resolvedExpression === undefined || resolvedExpression === null) {
        parts.push("");
      } else if (typeof resolvedExpression === "object") {
        parts.push(JSON.stringify(resolvedExpression));
      } else {
        parts.push(String(resolvedExpression));
      }
    } catch (error: any) {
      log(
        `Error evaluating embedded expression '${m[1]}': ${error.message}`,
        "error"
      );
      parts.push(m[0]); // Return the original expression if evaluation fails
    }
    lastIdx = m.index! + m[0].length;
  }
  parts.push(str.slice(lastIdx));
  return parts.join("");
}

/**
 * Retrieve a nested property from an object using dot-and-bracket path notation.
 *
 * @param obj - The object to read from.
 * @param path - Property path using dot notation and optional array indices (e.g., `a.b.c` or `a.b[0].c`).
 * @returns The value at the specified path, or `undefined` if any segment does not exist.
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
 * Determine whether an expression includes supported operator invocations.
 *
 * @returns `true` if the expression contains `jq(` or `extract(`, `false` otherwise.
 */
function containsOperators(expression: string): boolean {
  // TODO: Add back common operators (!)
  const operatorRegex = /jq\(|extract\(/;
  return operatorRegex.test(expression);
}

/**
 * Evaluate an expression that may include custom operators.
 *
 * The expression is evaluated within a restricted context that exposes helper
 * functions (for example `extract` and `jq`) and the provided `context` values.
 * Operator-like syntax is preprocessed before evaluation. On errors the function
 * returns `undefined`.
 *
 * @param expression - The expression string to evaluate (may contain operators or references)
 * @param context - Values and identifiers available to the evaluation environment
 * @returns The computed result of the expression, or `undefined` if evaluation fails
 */
async function evaluateExpression(expression: string, context: any): Promise<any> {
  try {
    // Handle special operators that aren't valid JS syntax
    expression = preprocessExpression(expression);

    // Create a safe evaluation context
    const evalContext: Record<string, any> = {
      ...context,
      //   contains: (a, b) => {
      //     if (typeof a === "string") return a.includes(b);
      //     if (Array.isArray(a)) return a.includes(b);
      //     if (typeof a === "object" && a !== null) return b in a;
      //     return false;
      //   },
      //   oneOf: (value, options) => {
      //     if (!Array.isArray(options)) return false;
      //     return options.includes(value);
      //   },
      //   matches: (str, regex) => {
      //     if (typeof str !== "string") return false;
      //     return new RegExp(regex).test(str);
      //   },
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
      jq: (json: any, query: string) => {
        try {
          return jq.then((jq: any) => jq.json(json, query));
        } catch (e: any) {
          log(`jq error: ${e.message}`, "error");
          return null;
        }
      },
    };

    // Use Function constructor for safer evaluation
    const evaluator = new Function(
      ...Object.keys(evalContext),
      `return ${expression.replace(/\\/g, "\\\\").replace(/\./g, "\\.")};`
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
 * Normalizes custom operators and quoting in an expression for evaluation.
 *
 * Converts infix `extract` usages into function-call form and ensures unquoted
 * string-like identifiers are quoted so the expression can be evaluated safely.
 *
 * @param expression - The expression to normalize.
 * @returns The normalized expression suitable for the evaluator (e.g., `extract("a","b")` and quoted identifiers).
 */
function preprocessExpression(expression: string): string {
  // Replace "contains" operator
  //   expression = expression.replace(
  //     /(\S+)\s+contains\s+(\S+)/g,
  //     "contains($1, $2)"
  //   );

  //   // Replace "oneOf" operator
  //   expression = expression.replace(/(\S+)\s+oneOf\s+(\S+)/g, "oneOf($1, $2)");

  //   // Replace "matches" operator
  //   expression = expression.replace(
  //     /(\S+)\s+matches\s+(\S+)/g,
  //     (match, left, right) => {
  //       // If left side is not quoted and isn't a defined variable, add quotes
  //       if (!/^['"`]/.test(left) && !/^[\d\{\}\[\]\(\)]/.test(left) || typeof left === "string") {
  //         left = `"${left}"`;
  //       }
  //       // If right side is not quoted and looks like a string literal, add quotes
  //       if (!/^['"`]/.test(right)) {
  //         right = `"${right}"`;
  //       }
  //       return `matches(${left}, ${right})`;
  //     }
  //   );

  // Replace "extract" operator if used with infix notation
  expression = expression.replace(
    /(\S+)\s+extract\s+(\S+)/g,
    (match: string, left: string, right: string) => {
      // If left side is not quoted and isn't a defined variable, add quotes
      if (
        (!/^['"`]/.test(left) && !/^[\d\{\}\[\]\(\)]/.test(left)) ||
        typeof left === "string"
      ) {
        left = `"${left}"`;
      }
      // If right side is not quoted and looks like a string literal, add quotes
      if (!/^['"`]/.test(right)) {
        right = `"${right}"`;
      }
      return `extract(${left}, ${right})`;
    }
  );
  // Fix quoting around "extract" operator
  // If inputs are not quoted, add quotes
  expression = expression.replace(
    /extract\(([^,]+),\s*([^,]+)\)/g,
    (match: string, left: string, right: string) => {
      if (!/^['"`]/.test(left)) {
        left = `"${left}"`;
      }
      if (!/^['"`]/.test(right)) {
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

  // Now handle potential string literals without quotes (like variable names not in context)
  expression = expression.replace(
    /\b(\w+)\s*(==|!=|>|>=|<|<=)/g,
    (match: string, word: string, operator: string) => {
      // Skip meta values (already processed) and known variables in context
      if (
        word.startsWith("$$") ||
        ["true", "false", "null", "undefined", "NaN", "Infinity"].includes(word)
      ) {
        return match;
      }
      // Add quotes around identifiers that might be string literals
      return `"${word}" ${operator}`;
    }
  );

  return expression;
}

/**
 * Evaluates an assertion expression within the provided context and returns whether it passes.
 *
 * @param assertion - The assertion expression to resolve and evaluate; may be a string, boolean, or an expression containing operators or embedded templates.
 * @param context - Context object providing meta values and helpers used during expression resolution.
 * @returns `true` if the resolved assertion evaluates to true, `false` otherwise.
 */
async function evaluateAssertion(assertion: any, context: any): Promise<boolean> {
  try {
    const resolvedAssertion = await resolveExpression(
      {expression: assertion,
      context: context}
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