<!-- test {"testId":"nav-type-inputdelay","detectSteps":false} -->

# Type slowly

1. Go to [the type echo page](http://localhost:8092/type-echo.html).
   <!-- step {"goTo":"http://localhost:8092/type-echo.html"} -->
2. Click **Type here:**.
   <!-- step {"click":"Type here:"} -->
3. Type `Hello`, one key at a time.
   <!-- step {"type":{"keys":"Hello","inputDelay":200}} -->
4. Check that the page shows **Hello** below the field.
   <!-- step {"find":"Hello"} -->

<!-- test end -->
