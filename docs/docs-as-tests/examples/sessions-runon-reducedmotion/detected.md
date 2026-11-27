<!-- test {"testId":"sessions-runon-reducedmotion","detectSteps":true,"runOn":[{"platforms":["linux","mac","windows"],"browsers":{"name":"chrome","headless":true,"reducedMotion":"reduce"}}]} -->

# Check the page with reduced motion

1. Start at [the multi-tab page](http://localhost:8092/multi-tab.html).
   <!-- step {"goTo":"http://localhost:8092/multi-tab.html"} -->
2. Check that the page prefers reduced motion.
   <!-- step {"runBrowserScript":{"script":"return String(matchMedia(\"(prefers-reduced-motion: reduce)\").matches);","output":"true"}} -->

<!-- test end -->
