<!-- test {"testId":"capture-annotate-clear-ids","detectSteps":true} -->

# Remove one mark

1. Go to [the sample form](http://localhost:8092/enhanced-elements.html).
   <!-- step {"goTo":"http://localhost:8092/enhanced-elements.html"} -->
2. The username field is marked 1, with a hint beside it.
   <!-- step {"annotate":{"add":[{"id":"step","badge":"#username-input","label":"1"},{"id":"hint","callout":"#username-input","label":"Your account name","position":"right"}]}} -->
3. The hint goes away, and the mark stays.
   <!-- step {"annotate":{"clear":["hint"]}} -->
   <!-- step {"screenshot":{"path":"annotate-clear-ids.png","directory":".dd-output","overwrite":"true"}} -->

<!-- test end -->
