<!-- test {"testId":"nav-goto-waituntil-combined","detectSteps":false} -->

# Wait for the network, the page, and an element

1. Go to [the late element page](http://localhost:8092/waitUntil-test-late-element.html).
   <!-- step {"goTo":{"url":"http://localhost:8092/waitUntil-test-late-element.html","timeout":10000,"waitUntil":{"networkIdleTime":500,"domIdleTime":1000,"find":{"selector":".status","elementText":"/.*operational.*/"}}}} -->
2. Check that the page shows **System operational**.
   <!-- step {"find":"System operational"} -->

<!-- test end -->
