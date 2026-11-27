# Inline statement forms

Each test below writes its statements in one form. A statement Doc Detective can't parse is reported, so `doc-detective validate` on this folder lists none.

<!-- test {"testId": "statement-form-json", "description": "JSON."} -->

<!-- step {"runShell": "node -e \"process.exit(0)\""} -->

<!-- test end -->

<!-- test {testId: statement-form-yaml-flow, description: "YAML with more than one key, inside braces."} -->

<!-- step runShell: {command: node, args: ["-v"]} -->

<!-- test end -->

<!-- test testId: statement-form-yaml-one-key -->

<!-- step runShell: node -e "process.exit(0)" -->

<!-- test end -->

<!-- test testId="statement-form-attributes" description="Key=value attributes." -->

<!-- step runShell="node -v" -->

<!-- test end -->
