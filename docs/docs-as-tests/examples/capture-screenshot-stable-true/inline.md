<!-- test {"testId":"capture-screenshot-stable-true","detectSteps":false} -->

# Wait for a page to settle before the screenshot

1. Open the page at `http://localhost:8092/screenshot-late-reveal.html`.
   <!-- step {"goTo":{"url":"http://localhost:8092/screenshot-late-reveal.html","waitUntil":{"networkIdleTime":0,"domIdleTime":0}}} -->
2. A loading bar fills, then the page shows its content.
   <!-- step {"screenshot":{"path":"stable-true.png","directory":".dd-output","overwrite":"true","stable":true}} -->

<!-- test end -->
