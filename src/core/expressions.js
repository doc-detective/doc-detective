const { log } = require("./utils");
// const { JSONPath } = require("jsonpath-plus");
// const xpath = require("xpath");
// const { DOMParser } = require("xmldom");
const jq = require("jq-web");

/**
 * Resolves runtime expressions that may contain meta values and operators.
 * Can handle both standalone expressions and strings with embedded expressions.
 * @param {string} expression - The expression to resolve.
 * @param {object} context - Context object containing meta values.
 * @returns {*} - The resolved value of the expression.
 */
async function resolveExpression({ expression, context }) {
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
  } catch (error) {
    log(
      `Error resolving expression '${expression}': ${error.message}`,
      "error"
    );
    return expression;
  }
}

/**
 * Replaces all meta values in an expression with their actual values from context.
 * @param {string} expression - The expression containing meta values.
 * @param {object} context - Context object containing meta values.
 * @returns {*} - The expression with meta values replaced.
 */
function replaceMetaValues(expression, context) {
  // Regular expression to match meta values with optional JSON pointer
  const metaValueRegex = /\$\$([\w\.\[\]]+(?:#\/[\w\/\[\]]+)*)/g;

  let result = expression;
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
          replaceValue = `"${metaValue.replace(/"/g, '\\"')}"`;
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
 * Gets a meta value from the context based on its path and scope.
 * @param {string} path - The path to the meta value.
 * @param {object} context - Context object containing meta values.
 * @returns {*} - The value of the meta value, or undefined if not found.
 */
function getMetaValue(path, context) {
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
    } catch (error) {
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
function resolvePathTemplateVariables(path, context) {
  const templateRegex = /\{\{(\w+)\}\}/g;
  return path.replace(templateRegex, (match, varName) => {
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
async function resolveEmbeddedExpressions(str, context) {
  if (typeof str !== "string") {
    return str;
  }
  const expressionRegex = /\{\{([^{}]+)\}\}/g;

  const parts = [];
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
    } catch (error) {
      log(
        `Error evaluating embedded expression '${m[1]}': ${error.message}`,
        "error"
      );
      parts.push(m[0]); // Return the original expression if evaluation fails
    }
    lastIdx = m.index + m[0].length;
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
function getNestedProperty(obj, path) {
  if (!obj || !path) return undefined;

  const parts = path.split(".");
  let current = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    
    // Check if this part uses array notation like "data[0]"
    const arrayMatch = part.match(/^([\w$]+)(?:\[(\d+)\])$/);
    if (arrayMatch) {
      const [, propName, indexStr] = arrayMatch;
      const index = parseInt(indexStr, 10);
      
      // First access the array property
      current = current[propName];
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
function containsOperators(expression) {
  // TODO: Add back common operators (!)
  const operatorRegex = /jq\(|extract\(/;
  return operatorRegex.test(expression);
}

/**
 * Evaluates an expression containing operators.
 * @param {string} expression - The expression to evaluate.
 * @param {object} context - Context object that might be needed for evaluation.
 * @returns {*} - The result of the evaluation.
 */
async function evaluateExpression(expression, context) {
  try {
    // Handle special operators that aren't valid JS syntax
    expression = preprocessExpression(expression);

    // Create a safe evaluation context
    const evalContext = {
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
      extract: (str, regex) => {
        try {
          const re = new RegExp(regex);
          const match = str.match(re);
          if (match && match.length > 1) {
            return match[1]; // First capture group
          } else {
            return match ? match[0] : null; // Full match or null if no match
          }
        } catch (e) {
          log(`Regex extraction error: ${e.message}`, "error");
          return null;
        }
      },
      jq: (json, query) => {
        try {
          return jq.then((jq) => jq.json(json, query));
        } catch (e) {
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
  } catch (error) {
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
function preprocessExpression(expression) {
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
    (match, left, right) => {
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
    (match, left, right) => {
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
    (match, operator, word) => {
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
    (match, word, operator) => {
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

  // Debug the expression after preprocessing
  console.log(`Preprocessed expression: ${expression}`);

  return expression;
}

/**
 * Evaluates an assertion based on the given expression and context.
 * @param {string} assertion - The assertion expression.
 * @param {object} context - Context object containing meta values.
 * @returns {boolean} - Whether the assertion passes.
 */
async function evaluateAssertion(assertion, context) {
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
  } catch (error) {
    log(`Error evaluating assertion '${assertion}': ${error.message}`, "error");
    return false;
  }
}

module.exports = {
  resolveExpression,
  evaluateAssertion,
  getMetaValue,
  replaceMetaValues,
};

// Run the main function to test the code
if (require.main === module) {
  (async () => {
    try {
      const context = {
        steps: {
          extractUserData: {
            outputs: {
              userName: "John", // Changed from "John Doe" to "John" to match the test
              email: "john.doe@example.com",
            },
          },
        },
        statusCode: 200,
        response: {
          body: {
            users: [
              {
                id: 1,
                name: "John",
              },
              {
                id: 2,
                name: "Doe",
              },
            ],
            message: "Success with ID: 12345",
            success: false,
          },
        },
        foobar: 100,
      };

      // Test basic matching
      //   let expression = "$$steps.extractUserData.outputs.userName matches John";
      //   console.log(`Original expression: ${expression}`);
      //   let resolvedValue = await resolveExpression(expression, context);
      //   console.log(`Resolved value: ${resolvedValue}`);

      // Test extraction with no capture groups (returns array of full matches)
      //   expression = "extract($$response.body.message, 'Success')";
      //   console.log(`\nExtraction with no capture groups: ${expression}`);
      //   resolvedValue = await resolveExpression(expression, context);
      //   console.log(`Resolved value:`, resolvedValue);

      // Test extraction with capture groups
      //   expression = "extract($$response.body.message, 'ID: (\\d+)')";
      //   console.log(`\nExtraction with capture groups: ${expression}`);
      //   resolvedValue = await resolveExpression(expression, context);
      //   console.log(`Resolved value:`, resolvedValue);

      //   // Test extraction with multiple matches
      expression = "extract($$response.body.users[0].name, '(\\w+)')";
      console.log(`\nExtraction with multiple matches: ${expression}`);
      resolvedValue = await resolveExpression({expression: expression, context: context});
      console.log(`Resolved value:`, resolvedValue);
    } catch (error) {
      console.error(`Error running test: ${error.message}`);
    }
  })();
}
