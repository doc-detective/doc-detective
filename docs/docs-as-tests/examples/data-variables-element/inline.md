<!-- test {"testId":"data-variables-element","detectSteps":false} -->

# Send the text a page shows

1. Open `http://localhost:8092/type-echo.html`.
   <!-- step {"goTo":"http://localhost:8092/type-echo.html"} -->
2. Type `Wren` in the field.
   <!-- step {"type":{"keys":"Wren","selector":"#type-input"}} -->
3. Check that the page shows `Wren` below the field.
   <!-- step {"find":{"selector":"#echo","elementText":"Wren"},"variables":{"ECHOED":"$$element.text"}} -->
4. Send the text in a `POST` request to `http://localhost:8093/api/names`. The API returns it.
   <!-- step {"httpRequest":{"url":"http://localhost:8093/api/names","method":"post","request":{"body":{"name":"$ECHOED"}},"response":{"body":{"name":"Wren"}}}} -->

<!-- test end -->
