<!-- test {"testId":"sessions-goto-new-object","detectSteps":true,"runOn":[{"browsers":{"name":"firefox","headless":true},"browserFallback":"off"}]} -->

# Open a named window with a named tab

1. Start at [the multi-tab page](http://localhost:8092/multi-tab.html).
   <!-- step {"goTo":"http://localhost:8092/multi-tab.html"} -->
2. Load [the report page](http://localhost:8092/multi-tab-child.html?page=report) in a new tab named `report`.
   <!-- step {"goTo":{"url":"http://localhost:8092/multi-tab-child.html?page=report","newTab":{"name":"report"}}} -->
3. Load [the settings page](http://localhost:8092/multi-tab-child.html?page=settings) in a new window named `settings`, with its first tab named `general`.
   <!-- step {"goTo":{"url":"http://localhost:8092/multi-tab-child.html?page=settings","newWindow":{"name":"settings","tab":"general"}}} -->
4. Check that the `general` tab of the `settings` window reads "PAGE settings".
   <!-- step {"find":{"elementText":"PAGE settings","surface":{"browser":"firefox","window":{"name":"settings"},"tab":{"name":"general"}}}} -->

<!-- test end -->
