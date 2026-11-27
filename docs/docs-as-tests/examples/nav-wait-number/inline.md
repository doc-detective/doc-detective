<!-- test {"testId":"nav-wait-number","detectSteps":false} -->

# Pause for a set time

1. Go to [the wait delay page](http://localhost:8092/wait-delay.html).
   <!-- step {"goTo":"http://localhost:8092/wait-delay.html"} -->
2. Wait three seconds.
   <!-- step {"wait":3000} -->
3. Check that the page shows **Loaded after 2 seconds**.
   <!-- step {"find":{"selector":"#auto-message","elementText":"Loaded after 2 seconds","timeout":0}} -->

<!-- test end -->
