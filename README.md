# doc-unit-test

Unit test documentation that references a UI with test or images. Primarily useful for process docs, `doc-unit-test` supports test definitions single-sourced in documentation or defined in separate test files to suit your infrastructure needs.

`doc-unit-test` ingests text files, parses them for test actions, then executes those actions in a headless Chromium browser. The results (PASS/FAIL and context) are output as an array so that other pieces of infrastructure can parse and manipulate them as needed.

`doc-unit-test` handles test parsing and web-based UI testing; it doesn't support results reporting or notifications. This script is a part of the testing infrastructure and needs to be complimented by other componenets.

`doc-unit-test` uses `puppeteer` to install, launch, and drive Chromium to perform tests. `puppeteer` removes the requirement to manually configure a local web browser and enables easy screenshoting and video recording.

## Open issues

*   Maintain consisntent test IDs
*   Support close test tags

## MVP features

*   **Done!** Iterate through files/folders to identify, parse, and execute tests
*   **Done!** Tests may be defined in their own files or single-sourced within documentation
*   Configurable test file types and test opening/closing markup
*   **Done!** Find a page element based on CSS
*   **Done!** Check if a found element matches expected text
*   **Done!** Click a page element
*   **Done!** Send key strokes to a page element
*   **Done!** Single-line test actions

## Post-MVP features

*   Multi-line test actions
*   Ingest array of tests as an argument
*   Test curl commands (Support substitution/setting env vars. Only check for `200 OK`.)
*   **Done!** Take screenshots
*   Compare in-test screenshots to previously captured screenshots (upgrade screenshot() to compare to existing image at path, if present)
*   Test if a referenced image (such as an icon) is present in captured screenshot
*   Move the cursor to a page element
*   Scroll the window
*   Record videos
*   Record videos only when encountering errors
*   Suggest tests by parsing document text
*   Automatically insert suggested tests based on document text