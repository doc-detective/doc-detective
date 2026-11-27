<!-- test {"testId":"data-substitution-selector","detectSteps":false} -->

# Type into a field named by a variable

1. Load the variables in `shop.env`.
   <!-- step {"loadVariables":"shop.env"} -->
2. Open `http://localhost:8092/type-echo.html`.
   <!-- step {"goTo":"http://localhost:8092/type-echo.html"} -->
3. Type `Wren` in the field.
   <!-- step {"type":{"keys":"Wren","selector":"$INPUT_SELECTOR"}} -->
4. Check that the page shows `Wren`.
   <!-- step {"find":{"selector":"$ECHO_SELECTOR","elementText":"Wren"}} -->

<!-- test end -->
