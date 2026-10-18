/**
 * Compatibility corpus: edge cases where structure-aware parsing could
 * disagree with the legacy raw-text regexes. `expected.json` holds the specs
 * that the last pre-selector release (doc-detective-common on main before
 * ADR 01139) detected for each case. Regenerate it ONLY from a legacy build:
 *
 *   node generate-expected.mjs <path-to-legacy-common-dist>
 */
const step = (s) => `{"runShell": {"command": "echo ${s}"}}`;

export const cases = [
  // Markdown statements
  ["md-lazy-definition", "md", `Go to the page.\n[comment]: # (step ${step("lazy")})\n`],
  ["md-midline-definition", "md", `Text [comment]: # (step ${step("mid")}) more\n`],
  ["md-definition-quotes", "md", `[comment]: # 'step ${step("single")}'\n\n[comment]: # "step {\\"runShell\\": {\\"command\\": \\"echo double\\"}}"\n`],
  ["md-test-start-definition", "md", `[comment]: # (test start {"testId": "ts"})\n[comment]: # (step ${step("a")})\n[comment]: # (test end)\n`],
  ["md-expression-inline", "md", `Inline {/* step ${step("expr")} */} comment.\n`],
  ["md-expression-flow", "md", `{/* step ${step("flow")} */}\n`],
  ["md-expression-tight", "md", `{/*step ${step("tight")}*/}\n`],
  ["md-fenced-code-comment", "md", "```md\n<!-- step " + step("fence") + " -->\n```\n"],
  ["md-inline-code-comment", "md", "Use `<!-- step " + step("code") + " -->` here.\n"],
  ["md-indented-code-comment", "md", "Para.\n\n    <!-- step " + step("indent") + " -->\n"],
  ["md-testing-prose", "md", `<!-- testing notes: verify -->\n<!-- step ${step("after")} -->\n`],
  ["md-test-no-space", "md", `<!-- test{"testId":"x"} -->\n<!-- step ${step("a")} -->\n<!-- test end -->\n`],
  ["md-ignore-block", "md", `<!-- step ${step("1")} -->\n<!-- test ignore start -->\n<!-- step ${step("2")} -->\n<!-- test ignore end -->\n<!-- step ${step("3")} -->\n`],
  // Markdown markup
  ["md-screenshot", "md", `![x](a.png){: .screenshot}\n`],
  ["md-no-screenshot", "md", `![x](a.png){: .no-screenshot}\n`],
  ["md-screenshot-prefix", "md", `![x](a.png){: .screenshots}\n`],
  ["md-bold-in-fence", "md", "```text\nClick **Save** now.\n```\n"],
  ["md-link-in-fence", "md", "```md\nGo to [the site](https://example.com).\n```\n"],
  ["md-type-quoted-email", "md", `Enter "admin@example.com" in the field.\n`],
  ["md-type-capitalized", "md", `Type "hello" in the box.\n`],
  ["md-click-and-find", "md", `Click **Save**, then look for **Done**.\n`],
  ["md-go-to-link", "md", `Go to [Example](https://example.com).\n`],
  ["md-image-link", "md", `See ![logo](https://example.com/logo.png).\n`],
  ["md-run-code", "md", "```bash\necho hi\n```\n\n```python testIgnore\nprint('x')\n```\n"],
  ["md-http-request", "md", "```http\nGET https://example.com/api HTTP/1.1\nAccept: application/json\n```\n"],
  // MDX (handled by the markdown definition)
  ["mdx-html-comment", "mdx", `<!-- step ${step("html")} -->\n`],
  ["mdx-expression", "mdx", `{/* step ${step("expr")} */}\n`],
  ["mdx-definition", "mdx", `[comment]: # (step ${step("def")})\n`],
  ["mdx-mixed", "mdx", `import X from "./x";\n\n<!-- test {"testId":"m"} -->\n\n{/* step ${step("e")} */}\n\n<X>\n  Click **Save** now.\n</X>\n\n<!-- test end -->\n`],
  ["mdx-invalid-jsx", "mdx", `a < b and <!-- step ${step("bad")} -->\n`],
  ["mdx-ial", "mdx", "![x](a.png){: .screenshot}\n\n```python\nprint(\"{:.2f}\".format(1))\n```\n"],
  // HTML
  ["html-comment", "html", `<p>Hi</p>\n<!-- step ${step("html")} -->\n`],
  ["html-pre-comment", "html", `<pre><!-- step ${step("pre")} --></pre>\n`],
  ["html-script-comment", "html", `<script>var a = "<!-- step ${step("script")} -->";</script>\n`],
  ["html-testing-prose", "html", `<!-- testing --><!-- step ${step("x")} -->\n`],
  ["html-test-block", "html", `<!-- test {"testId": "h"} -->\n<!-- step ${step("a")} -->\n<!-- test end -->\n`],
  // AsciiDoc
  ["adoc-comment", "adoc", `// (step ${step("adoc")})\n`],
  ["adoc-listing", "adoc", `----\n// (step ${step("listing")})\n----\n`],
  ["adoc-midline", "adoc", `Text // (step ${step("mid")})\n`],
  ["adoc-indented", "adoc", `  // (step ${step("indent")})\n`],
  ["adoc-multiline", "adoc", `// (step {"runShell":\n// {"command": "echo ml"}})\n`],
  ["adoc-test-block", "adoc", `// (test {"testId": "a"})\n// (step ${step("a")})\n// (test end)\n`],
  // DITA
  ["dita-fragment", "dita", `<!-- step ${step("frag")} -->`],
  ["dita-data-step", "dita", `<topic id="t"><body><p><data name="step">{"wait": 7}</data></p></body></topic>`],
  ["dita-data-notes", "dita", `<topic id="t"><body><data name="doc-detective-notes" value='step ${step("n")}'/></body></topic>`],
  ["dita-data-statement", "dita", `<topic id="t"><body><data name="doc-detective" value='step ${step("d")}'/></body></topic>`],
  ["dita-entity", "dita", `<!DOCTYPE topic [<!ENTITY prod "Foo">]>\n<topic id="t"><title>&prod; &reg;</title><body><!-- step ${step("ent")} --></body></topic>`],
  ["dita-uicontrol", "dita", `<topic id="t"><body><p>Click <uicontrol>Save</uicontrol>. Type <userinput>abc</userinput> into the <uicontrol>Name</uicontrol>.</p></body></topic>`],
  ["dita-xref", "dita", `<topic id="t"><body><p>Go to <xref href="https://example.com" scope="external">site</xref>.</p></body></topic>`],
];
