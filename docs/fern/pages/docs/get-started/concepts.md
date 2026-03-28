---
title: Concepts
---

Learn the key concepts that form the foundation of Doc Detective.

## Test specification

A [test specification](/reference/schemas/specification) is a group of tests to run in one or more contexts. Conceptually parallel to a document.

## Test

A [test](/docs/tests) is a sequence of steps to perform. Conceptually parallel to a procedure.

## Step

A step is a portion of a test that includes a single action. Conceptually parallel to a step in a procedure.

## Action

An action performs a task in a step. Doc Detective supports a variety of actions:

| Name                                                        | Description                                                                                                                                               |
| :---------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [checkLink](/docs/actions/check-link)         | Check if a URL returns an acceptable status code from a GET request.                                                                                      |
| [find](/docs/actions/find)                   | Locate and interact with an element on the page.                                                                                                          |
| [click](/docs/actions/click)                 | Click an element.                                                                                                                                         |
| [dragAndDrop](/docs/actions/drag-and-drop)   | Drag an element to a target location.                                                                                                                     |
| [goTo](/docs/actions/go-to)                   | Navigate to a specified URL.                                                                                                                              |
| [httpRequest](/docs/actions/http-request)     | Perform a generic HTTP request, for example to an API.                                                                                                    |
| [runShell](/docs/actions/run-shell)           | Perform a native shell command.                                                                                                                           |
| [screenshot](/docs/actions/screenshot)       | Take a screenshot in PNG format.                                                                                                                          |
| [loadVariables](/docs/actions/load-variables) | Load environment variables from a `.env` file.                                                                                                            |
| [saveCookie](/docs/actions/save-cookie)       | Save a specific browser cookie to a file or environment variable for later reuse.                                                                         |
| [loadCookie](/docs/actions/load-cookie)       | Load a specific cookie from a file or environment variable into the browser.                                                                              |
| [record](/docs/actions/record)               | Capture a video of the test run.                                                                                                                              |
| [runCode](/docs/actions/run-code)             | Execute code snippets in JavaScript, Python, or Bash.                                                                                                         |
| [stopRecord](/docs/actions/stop-record)       | Stop capturing a video of the test run.                                                                                                                       |
| [type](/docs/actions/type)                   | Type keys. To type special keys, begin and end the string with `$` and use the special key’s enum. For example, to type the Escape key, enter `$ESCAPE$`. |
| [wait](/docs/actions/wait)                   | Pause before performing the next action.                                                                                                                  |

## Context

A [context](/reference/schemas/context) consists of an application and platforms that support the tests.

## Next steps

- [Create your first test](/docs/get-started/create-your-first-test)
