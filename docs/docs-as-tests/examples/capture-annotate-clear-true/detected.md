<!-- test {"testId":"capture-annotate-clear-true","detectSteps":true} -->

# Remove every mark

1. Go to [the sample form](http://localhost:8092/enhanced-elements.html).
   <!-- step {"goTo":"http://localhost:8092/enhanced-elements.html"} -->
2. The username field is marked 1.
   <!-- step {"annotate":{"add":[{"id":"step","badge":"#username-input","label":"1"}]}} -->
3. All marks go away.
   <!-- step {"annotate":{"clear":true}} -->
   <!-- step {"screenshot":{"path":"annotate-clear-true.png","directory":".dd-output","overwrite":"true"}} -->

<!-- test end -->
