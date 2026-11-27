<!-- test {"testId":"sessions-select-tab-title","detectSteps":false,"runOn":[{"browsers":{"name":"firefox","headless":true},"browserFallback":"off"}]} -->

# Check a page in another tab or window

1. Start at [the multi-tab page](http://localhost:8092/multi-tab.html).
   <!-- step {"goTo":"http://localhost:8092/multi-tab.html"} -->
2. Load [the second page](http://localhost:8092/multi-tab-child.html?page=second) in a new tab named `second`.
   <!-- step {"goTo":{"url":"http://localhost:8092/multi-tab-child.html?page=second","newTab":"second"}} -->
3. Check that the selected page reads "MULTI-TAB HOME".
   <!-- step {"find":{"elementText":"MULTI-TAB HOME","surface":{"browser":"firefox","tab":{"title":"Multi-tab home"}}}} -->

<!-- test end -->
