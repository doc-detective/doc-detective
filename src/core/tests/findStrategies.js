exports.findElementBySelectorAndText = findElementBySelectorAndText;
exports.findElementByShorthand = findElementByShorthand;
exports.findElementByCriteria = findElementByCriteria;

// Set element outputs
exports.setElementOutputs = setElementOutputs;

async function setElementOutputs({ element }) {
  // Set element in outputs
  const outputs = { element: {}, rawElement: element };

  const [
    text,
    html,
    tag,
    value,
    location,
    size,
    clickable,
    enabled,
    selected,
    displayed,
    displayedInViewport,
  ] = await Promise.allSettled([
    element.getText(),
    element.getHTML(),
    element.getTagName(),
    element.getValue(),
    element.getLocation(),
    element.getSize(),
    element.isClickable(),
    element.isEnabled(),
    element.isSelected(),
    element.isDisplayed(),
    element.isDisplayed({ withinViewport: true }),
  ]).then((results) =>
    results.map((r) => (r.status === "fulfilled" ? r.value : null))
  );

  Object.assign(outputs.element, {
    text,
    html,
    tag,
    value,
    location,
    size,
    clickable,
    enabled,
    selected,
    displayed,
    displayedInViewport,
  });

  return outputs;
}

async function findElementByRegex({ pattern, timeout, driver }) {
  await driver.pause(timeout);
  // Find an element based on a regex pattern in text
  const elements = await driver.$$("//*[normalize-space(text())]");
  for (const element of elements) {
    const text = await element.getText();
    if (text.match(pattern)) {
      return { element, foundBy: "regex" };
    }
  }
  return { element: null, foundBy: null };
}

async function findElementByAriaRegex({ pattern, timeout, driver }) {
  await driver.pause(timeout);
  // Find an element based on a regex pattern in accessible name
  // WebDriverIO's aria selector uses accessible name
  const elements = await driver.$$("//*");
  for (const element of elements) {
    try {
      // Try to get accessible name - this is an approximation
      // WebDriverIO's aria selector is better but we need to check all elements
      const ariaLabel = await element.getAttribute("aria-label");
      if (ariaLabel && ariaLabel.match(pattern)) {
        return { element, foundBy: "elementAria" };
      }
      // Also check text content as fallback
      const text = await element.getText();
      if (text && text.match(pattern)) {
        return { element, foundBy: "elementAria" };
      }
    } catch {
      continue;
    }
  }
  return { element: null, foundBy: null };
}

async function findElementByIdRegex({ pattern, timeout, driver }) {
  await driver.pause(timeout);
  // Find an element based on a regex pattern in id attribute
  const elements = await driver.$$("//*[@id]");
  for (const element of elements) {
    const id = await element.getAttribute("id");
    if (id && id.match(pattern)) {
      return { element, foundBy: "elementId" };
    }
  }
  return { element: null, foundBy: null };
}

async function findElementByTestIdRegex({ pattern, timeout, driver }) {
  await driver.pause(timeout);
  // Find an element based on a regex pattern in data-testid attribute
  const elements = await driver.$$("//*[@data-testid]");
  for (const element of elements) {
    const testId = await element.getAttribute("data-testid");
    if (testId && testId.match(pattern)) {
      return { element, foundBy: "elementTestId" };
    }
  }
  return { element: null, foundBy: null };
}

async function findElementByShorthand({ string, timeout = 5000, driver }) {
  // Find an element based on a string that could be a selector, text, aria label, id, or test id
  // Uses parallel search with precedence: selector > elementText > elementAria > elementId > elementTestId

  // If regex, find element by regex across all attribute types
  if (string.startsWith("/") && string.endsWith("/")) {
    const pattern = new RegExp(string.slice(1, -1));

    // Perform parallel searches for regex pattern
    const searches = [
      {
        type: "selector",
        promise: findElementByRegex({ pattern, timeout, driver }),
      },
      {
        type: "elementText",
        promise: findElementByRegex({ pattern, timeout, driver }),
      },
      {
        type: "elementAria",
        promise: findElementByAriaRegex({ pattern, timeout, driver }),
      },
      {
        type: "elementId",
        promise: findElementByIdRegex({ pattern, timeout, driver }),
      },
      {
        type: "elementTestId",
        promise: findElementByTestIdRegex({ pattern, timeout, driver }),
      },
    ];

    const results = await Promise.allSettled(searches.map((s) => s.promise));

    // Apply precedence order
    for (let i = 0; i < searches.length; i++) {
      if (results[i].status === "fulfilled" && results[i].value.element) {
        return { element: results[i].value.element, foundBy: searches[i].type };
      }
    }

    return { element: null, foundBy: null };
  }

  // Perform parallel searches for exact match across all five attribute types
  const selectorPromise = driver
    .$(string)
    .then(async (el) => {
      await el.waitForExist({ timeout });
      return el;
    })
    .catch(() => null);

  const textPromise = driver
    .$(`//*[normalize-space(text())="${string}"]`)
    .then(async (el) => {
      await el.waitForExist({ timeout });
      return el;
    })
    .catch(() => null);

  const ariaPromise = driver
    .$(`aria/${string}`)
    .then(async (el) => {
      await el.waitForExist({ timeout });
      return el;
    })
    .catch(() => null);

  const idPromise = driver
    .$(`//*[@id="${string}"]`)
    .then(async (el) => {
      await el.waitForExist({ timeout });
      return el;
    })
    .catch(() => null);

  const testIdPromise = driver
    .$(`//*[@data-testid="${string}"]`)
    .then(async (el) => {
      await el.waitForExist({ timeout });
      return el;
    })
    .catch(() => null);

  // Wait for all promises to resolve
  const results = await Promise.allSettled([
    selectorPromise,
    textPromise,
    ariaPromise,
    idPromise,
    testIdPromise,
  ]);

  // Extract results
  const selectorResult =
    results[0].status === "fulfilled" ? results[0].value : null;
  const textResult =
    results[1].status === "fulfilled" ? results[1].value : null;
  const ariaResult =
    results[2].status === "fulfilled" ? results[2].value : null;
  const idResult = results[3].status === "fulfilled" ? results[3].value : null;
  const testIdResult =
    results[4].status === "fulfilled" ? results[4].value : null;

  // Apply precedence order: elementText > elementAria > elementId > elementTestId > selector
  if (textResult && textResult.elementId) {
    return { element: textResult, foundBy: "elementText" };
  }
  if (ariaResult && ariaResult.elementId) {
    return { element: ariaResult, foundBy: "elementAria" };
  }
  if (idResult && idResult.elementId) {
    return { element: idResult, foundBy: "elementId" };
  }
  if (testIdResult && testIdResult.elementId) {
    return { element: testIdResult, foundBy: "elementTestId" };
  }
  if (selectorResult && selectorResult.elementId) {
    return { element: selectorResult, foundBy: "selector" };
  }

  // No matching elements
  return { element: null, foundBy: null };
}

async function findElementBySelectorAndText({
  selector,
  text,
  timeout,
  driver,
}) {
  let element;
  let elements = [];
  if (!selector || !text) {
    return { element: null, foundBy: null }; // No selector or text
  }
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    const candidates = await driver.$$(selector);
    elements = [];
    for (const el of candidates) {
      const elementText = await el.getText();
      if (!elementText) {
        continue;
      }
      if (text.startsWith("/") && text.endsWith("/")) {
        const pattern = new RegExp(text.slice(1, -1));
        if (!pattern.test(elementText)) {
          continue;
        }
      } else if (elementText !== text) {
        continue;
      }
      elements.push(el);
    }
    if (elements.length > 0) {
      break;
    }
    // Wait 100ms before trying again
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (elements.length === 0) {
    return { element: null, foundBy: null }; // No matching elements
  }
  // If multiple elements match, return the first one
  element = elements[0];
  return { element, foundBy: "selector and text" };
}

// Helper function to check if a string is a regex pattern
function isRegexPattern(str) {
  return typeof str === "string" && str.startsWith("/") && str.endsWith("/");
}

// Helper function to match a value against a pattern (string or regex)
function matchesPattern(value, pattern) {
  if (isRegexPattern(pattern)) {
    const regex = new RegExp(pattern.slice(1, -1));
    return regex.test(String(value));
  }
  return String(value) === String(pattern);
}

// Helper function to check if element has all required classes
async function hasAllClasses(element, classes) {
  const classList = await element.getAttribute("class");
  if (!classList) return false;

  const elementClasses = classList.split(/\s+/).filter((c) => c.length > 0);

  for (const requiredClass of classes) {
    let found = false;
    if (isRegexPattern(requiredClass)) {
      const regex = new RegExp(requiredClass.slice(1, -1));
      found = elementClasses.some((c) => regex.test(c));
    } else {
      found = elementClasses.includes(requiredClass);
    }
    if (!found) return false;
  }

  return true;
}

// Helper function to check if element matches attribute criteria
async function matchesAttributes(element, attributes) {
  for (const [attrName, attrValue] of Object.entries(attributes)) {
    const elementAttrValue = await element.getAttribute(attrName);

    if (typeof attrValue === "boolean") {
      // Boolean: true means attribute exists (regardless of value), false means it doesn't
      // Special handling for disabled: disabled="false" as string still means disabled in HTML,
      // but we check actual element state for disabled attribute
      if (attrName === "disabled") {
        const isDisabled = await element
          .isEnabled()
          .then((enabled) => !enabled);
        if (isDisabled !== attrValue) return false;
      } else {
        const hasAttribute = elementAttrValue !== null;
        if (hasAttribute !== attrValue) return false;
      }
    } else if (typeof attrValue === "number") {
      // Number: exact match
      if (elementAttrValue === null || Number(elementAttrValue) !== attrValue) {
        return false;
      }
    } else {
      // String: exact match or regex
      if (elementAttrValue === null) return false;
      if (!matchesPattern(elementAttrValue, attrValue)) return false;
    }
  }

  return true;
}

// Find element by multiple criteria with AND logic
async function findElementByCriteria({
  selector,
  elementText,
  elementId,
  elementTestId,
  elementClass,
  elementAttribute,
  elementAria,
  timeout = 5000,
  driver,
}) {
  // Validate at least one criterion is provided
  if (
    !selector &&
    !elementText &&
    !elementId &&
    !elementTestId &&
    !elementClass &&
    !elementAttribute &&
    !elementAria
  ) {
    return {
      element: null,
      foundBy: null,
      error: "At least one element finding criterion must be specified",
    };
  }

  const startTime = Date.now();
  const pollingInterval = 100; // Check every 100ms

  // Poll for elements until timeout
  while (Date.now() - startTime < timeout) {
    let candidates = [];

    try {
      // Build a combined XPath that includes all non-regex criteria to minimize candidates
      if (selector) {
        // Use CSS selector directly
        const rawCandidates = await driver.$$(selector);
        candidates = Array.isArray(rawCandidates)
          ? rawCandidates
          : Array.from(rawCandidates || []);
      } else {
        // Build XPath with all applicable conditions combined
        const xpathConditions = [];

        // Add ID condition (exact match or check for existence)
        if (elementId && !isRegexPattern(elementId)) {
          xpathConditions.push(`@id="${elementId}"`);
        } else if (elementId) {
          xpathConditions.push(`@id`); // Regex will be checked later
        }

        // Add test ID condition (exact match or check for existence)
        if (elementTestId && !isRegexPattern(elementTestId)) {
          xpathConditions.push(`@data-testid="${elementTestId}"`);
        } else if (elementTestId) {
          xpathConditions.push(`@data-testid`); // Regex will be checked later
        }

        // Add class condition (check for existence, specific matches checked later)
        if (elementClass) {
          xpathConditions.push(`@class`);
        }

        // Add attribute conditions
        if (elementAttribute) {
          for (const [attrName, attrValue] of Object.entries(
            elementAttribute
          )) {
            if (typeof attrValue === "boolean") {
              // Boolean: just check for attribute existence if true
              if (attrValue && attrName !== "disabled") {
                xpathConditions.push(`@${attrName}`);
              }
            } else if (typeof attrValue === "number") {
              // Number: exact match
              xpathConditions.push(`@${attrName}="${attrValue}"`);
            } else if (
              typeof attrValue === "string" &&
              !isRegexPattern(attrValue)
            ) {
              if (attrValue === "true") {
                // Special case for boolean true as string
                xpathConditions.push(`@${attrName}`);
              } else {
                // String: exact match
                xpathConditions.push(`@${attrName}="${attrValue}"`);
              }
            } else {
              // Regex: just check for attribute existence
              xpathConditions.push(`@${attrName}`);
            }
          }
        }

        // Add text condition (check for text content existence)
        if (elementText) {
          xpathConditions.push(`normalize-space(text())`);
        }

        // Build final XPath
        let xpath;
        if (xpathConditions.length > 0) {
          xpath = `//*[${xpathConditions.join(" and ")}]`;
        } else {
          // Fallback if only aria/regex criteria (can't be expressed in XPath easily)
          xpath = `//*`;
        }

        const rawCandidates = await driver.$$(xpath);
        candidates = Array.isArray(rawCandidates)
          ? rawCandidates
          : Array.from(rawCandidates || []);
      }

      // Skip if no candidates found
      if (candidates.length === 0) {
        await new Promise((resolve) => setTimeout(resolve, pollingInterval));
        continue;
      }

      // Filter candidates by all criteria - check elements sequentially to avoid hangs
      let matchedElement = null;
      let matchedCriteria = [];

      for (const element of candidates) {
        if (!elementText && !elementId && !elementTestId && !elementClass && !elementAttribute && !elementAria) {
          // No criteria to check, should happen if only selector was used
          matchedElement = element;
          matchedCriteria = ["selector"];
          break;
        }
        try {
          // Check if element is valid and exists in DOM
          const exists = await element.isExisting();
          if (!exists) continue;

          // Build array of check promises to run in parallel
          const checks = [];
          const checkTypes = [];

          if (elementText) {
            checks.push(element.getText());
            checkTypes.push({ type: "elementText", value: elementText });
          }

          if (elementAria) {
            checks.push(element.getComputedLabel());
            checkTypes.push({ type: "elementAria", value: elementAria });
          }

          if (elementId) {
            checks.push(element.getAttribute("id"));
            checkTypes.push({ type: "elementId", value: elementId });
          }

          if (elementTestId) {
            checks.push(element.getAttribute("data-testid"));
            checkTypes.push({ type: "elementTestId", value: elementTestId });
          }

          if (elementClass) {
            checks.push(hasAllClasses(element, elementClass));
            checkTypes.push({ type: "elementClass", value: elementClass });
          }

          if (elementAttribute) {
            checks.push(matchesAttributes(element, elementAttribute));
            checkTypes.push({
              type: "elementAttribute",
              value: elementAttribute,
            });
          }

          // If no checks were added, we can't match
          if (checks.length === 0) {
            continue;
          }

          // Execute all checks in parallel
          const checkResults = await Promise.allSettled(checks);

          // Track criteria matched for this element
          const elementCriteriaUsed = [];
          let allChecksPassed = true;

          // Validate all check results
          for (let i = 0; i < checkResults.length; i++) {
            const checkResult = checkResults[i];
            const checkType = checkTypes[i];

            if (checkResult.status === "rejected") {
              allChecksPassed = false;
              break;
            }

            const actualValue = checkResult.value;

            // Handle different check types
            if (
              checkType.type === "elementClass" ||
              checkType.type === "elementAttribute"
            ) {
              // These return boolean directly from helper functions
              if (!actualValue) {
                allChecksPassed = false;
                break;
              }
              elementCriteriaUsed.push(checkType.type);
            } else {
              // Text/aria/id/testId checks need pattern matching
              if (
                !actualValue ||
                !matchesPattern(actualValue, checkType.value)
              ) {
                allChecksPassed = false;
                break;
              }
              elementCriteriaUsed.push(checkType.type);
            }
          }

          // If all checks passed, we found our element
          if (allChecksPassed) {
            matchedElement = element;
            matchedCriteria = elementCriteriaUsed;
            break; // Found a match, stop searching
          }
        } catch {
          // Element might have become stale, skip it
          continue;
        }
      }

      // Check if we found a match
      if (matchedElement) {
        const allCriteria = selector
          ? ["selector", ...matchedCriteria]
          : matchedCriteria;
        return {
          element: matchedElement,
          foundBy: allCriteria,
          error: null,
        };
      }
    } catch (error) {
      console.error("Error finding elements:", error);
    }

    // No matching elements found, wait before retrying
    await new Promise((resolve) => setTimeout(resolve, pollingInterval));
  }

  // Timeout reached, return error
  return {
    element: null,
    foundBy: null,
    error: "Element not found within timeout",
  };
}
