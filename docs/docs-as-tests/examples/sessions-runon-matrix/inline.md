<!-- test {"testId":"sessions-runon-matrix","detectSteps":false,"runOn":[{"platforms":["linux","mac","windows"],"browsers":{"name":"chrome","headless":true,"locale":"$$matrix.locale"},"matrix":{"locale":["en-US","de-DE"]}}]} -->

# Check the page in two languages

1. Start at [the multi-tab page](http://localhost:8092/multi-tab.html).
   <!-- step {"goTo":"http://localhost:8092/multi-tab.html"} -->
2. Check that the page's language is the locale under test, `en-US` or `de-DE`.
   <!-- step {"runBrowserScript":{"script":"return navigator.language;","output":"$$matrix.locale"}} -->

<!-- test end -->
