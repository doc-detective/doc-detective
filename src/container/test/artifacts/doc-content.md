# Doc Detective container-test overview

<!-- test
testId: doc-detective-docs
detectSteps: false
-->

The container test harness points Doc Detective at the same local
Express server that the main test suite uses (`test/server/` on the
host, reached from inside the container via `host.docker.internal:8092`).

<!-- step checkLink: "http://host.docker.internal:8092" -->

- The server's root (`index.html`) has common HTML elements we can
  navigate to and interact with.
- The `#text-elements` section contains a **Text Elements** heading.

  <!-- step checkLink: "http://host.docker.internal:8092/enhanced-elements.html" -->

<!-- step goTo: "http://host.docker.internal:8092" -->
<!-- step find: Text Elements -->

![Fixture screenshot.](reference.png){ .screenshot }
<!-- step screenshot: reference.png -->
