<!-- test {"testId":"nav-click-button-middle","detectSteps":false} -->

# Middle-click a button

1. Go to [the click counter page](http://localhost:8092/find-click.html).
   <!-- step {"goTo":"http://localhost:8092/find-click.html"} -->
2. Middle-click **Count clicks**.
   <!-- step {"click":{"selector":"#counter","button":"middle"}} -->
3. Check that the button counted the click.
   <!-- step {"find":{"selector":"#counter","elementAttribute":{"data-middle":"1"}}} -->

<!-- test end -->
