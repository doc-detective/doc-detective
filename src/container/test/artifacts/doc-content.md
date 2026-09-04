# Doc Detective container-test overview

<!-- test
testId: doc-detective-docs
detectSteps: false
-->

The container tests serve the same `test/server/public/` fixtures
the main test suite uses. It serves them from a sidecar container on a
shared docker network. The test container reaches it by docker DNS name
(`dd-test-server`).

<!-- step checkLink: "http://dd-test-server:8092" -->

- The server's root (`index.html`) has common HTML elements we can
  navigate to and interact with.
- The `#text-elements` section contains a **Text Elements** heading.

  <!-- step checkLink: "http://dd-test-server:8092/enhanced-elements.html" -->

<!-- step goTo: "http://dd-test-server:8092" -->
<!-- step find: Text Elements -->

![Fixture screenshot.](reference.png){ .screenshot }
<!-- step screenshot: reference.png -->
