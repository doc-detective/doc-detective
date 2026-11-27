<!-- test {"testId":"data-context-retries-2","contexts":[{"retries":2}],"detectSteps":false} -->

# Echo a name on a page

1. Open `http://localhost:8092/type-echo.html`.
   <!-- step {"goTo":"http://localhost:8092/type-echo.html"} -->
2. Type `Wren` in the field.
   <!-- step {"type":{"keys":"Wren","selector":"#type-input"}} -->
3. Check that the page shows `Wren`.
   <!-- step {"find":{"selector":"#echo","elementText":"Wren"}} -->

<!-- test end -->
