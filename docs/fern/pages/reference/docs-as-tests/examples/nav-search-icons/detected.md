<!-- test {"testId":"nav-search-icons","detectSteps":true} -->

# Search from the toolbar

1. Go to [the toolbar page](http://localhost:8092/find-image.html).
   <!-- step {"goTo":"http://localhost:8092/find-image.html"} -->
2. Click the magnifying-glass icon next to the search box.
   <!-- step {"click":{"elementImage":"search.svg"}} -->
3. Type "doc detective" and press Enter.
4. Check that the status bar shows **doc detective**.
5. Type "-docs" at the end of the search box.
6. Check that the status bar shows **doc detective-docs**.
7. Right-click the save icon and hold the button for half a second.
   <!-- step {"find":{"elementImage":{"path":"save.svg","threshold":0.95},"click":{"button":"right","duration":500}}} -->
8. Check that the status bar records the right-click.

<!-- test end -->
