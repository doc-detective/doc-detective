<!-- test {"testId":"sessions-runon-devicescalefactor","detectSteps":false,"runOn":[{"platforms":["linux","mac","windows"],"browsers":{"name":"chrome","headless":true,"deviceScaleFactor":2}}]} -->

# Check the page on a 2x display

1. Start at [the multi-tab page](http://localhost:8092/multi-tab.html).
   <!-- step {"goTo":"http://localhost:8092/multi-tab.html"} -->
2. Check that the device pixel ratio is `2`.
   <!-- step {"runBrowserScript":{"script":"return String(devicePixelRatio);","output":"2"}} -->

<!-- test end -->
