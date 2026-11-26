<!-- test {"testId":"nav-find-elements","detectSteps":false} -->

# Find elements by their attributes

1. Go to [the element test page](http://localhost:8092/enhanced-elements.html).
   <!-- step {"goTo":"http://localhost:8092/enhanced-elements.html"} -->
2. Find the **Submit by ID** button near the top of the page.
   <!-- step {"find":{"elementId":"submit-button","elementText":"Submit by ID","elementAria":"Submit form button","moveTo":true}} -->
3. Click the username field and type "kittens".
   <!-- step {"find":{"selector":"input","elementTestId":"username-field","click":true,"type":{"keys":["kittens"]},"timeout":10000}} -->
4. Check that the **Submit Order** button is enabled.
   <!-- step {"find":{"selector":"button","elementText":"/^Submit Ord/","elementTestId":"checkout-button","elementClass":["btn","/^btn-prim/"],"elementAttribute":{"data-enabled":"true","disabled":false}}} -->
5. Click **Save**.
   <!-- step {"click":"Save"} -->
6. Confirm that the page shows **Operation successful**.
   <!-- step {"find":"Operation successful"} -->

<!-- test end -->
