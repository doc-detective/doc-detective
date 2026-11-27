<!-- test {"testId":"sessions-runon-timezone","detectSteps":true,"runOn":[{"platforms":["linux","mac","windows"],"browsers":{"name":"chrome","headless":true,"timezone":"Europe/Berlin"}}]} -->

# Check the page on Berlin time

1. Start at [the multi-tab page](http://localhost:8092/multi-tab.html).
   <!-- step {"goTo":"http://localhost:8092/multi-tab.html"} -->
2. Check that the page's time zone is `Europe/Berlin`.
   <!-- step {"runBrowserScript":{"script":"return Intl.DateTimeFormat().resolvedOptions().timeZone;","output":"Europe/Berlin"}} -->

<!-- test end -->
