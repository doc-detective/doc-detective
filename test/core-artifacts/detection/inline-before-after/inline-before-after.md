# Inline `before` and `after`

An inline test statement can name setup and cleanup files, like a test in a spec file. The setup file sets a cookie in this test's browser session, so the `find` step passes only if the setup steps ran first.

<!-- test {"testId": "inline-before-after", "description": "An inline test statement's `before` and `after` files run as part of the test.", "before": "_set-cookie.spec.json", "after": "_cleanup.spec.json"} -->

<!-- step {"goTo": "http://localhost:8092/cookies"} -->

<!-- step {"find": "inline-before=abc123"} -->

<!-- test end -->

The same test in YAML flow-mapping form:

<!-- test {testId: inline-before-after-yaml, before: _set-cookie.spec.json, after: _cleanup.spec.json} -->

<!-- step {"goTo": "http://localhost:8092/cookies"} -->

<!-- step {"find": "inline-before=abc123"} -->

<!-- test end -->
