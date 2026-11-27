<!-- test {"testId":"sessions-goto-new-boolean","detectSteps":true} -->

# Open pages in a new tab and a new window

1. Start at [the multi-tab page](http://localhost:8092/multi-tab.html).
   <!-- step {"goTo":"http://localhost:8092/multi-tab.html"} -->
2. Load [the tab page](http://localhost:8092/multi-tab-child.html?page=tab) in a new tab.
   <!-- step {"goTo":{"url":"http://localhost:8092/multi-tab-child.html?page=tab","newTab":true}} -->
3. Check that the page reads "PAGE tab".
   <!-- step {"find":"PAGE tab"} -->
4. Load [the window page](http://localhost:8092/multi-tab-child.html?page=window) in a new window.
   <!-- step {"goTo":{"url":"http://localhost:8092/multi-tab-child.html?page=window","newWindow":true}} -->
5. Check that the page reads "PAGE window".
   <!-- step {"find":"PAGE window"} -->

<!-- test end -->
