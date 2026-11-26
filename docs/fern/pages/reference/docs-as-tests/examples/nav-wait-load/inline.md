<!-- test {"testId":"nav-wait-load","detectSteps":false} -->

# Wait for a slow page

1. Go to [the wait delay page](http://localhost:8092/wait-delay.html).
   <!-- step {"goTo":{"url":"/wait-delay.html","origin":"http://localhost:8092","timeout":30000,"waitUntil":{"networkIdleTime":500,"domIdleTime":500,"find":{"selector":"#auto-message","elementText":"Loaded after 2 seconds"}}}} -->
2. Wait until the page shows **Loaded after 2 seconds**.
   <!-- step {"find":{"selector":"#auto-message","elementText":"/^Loaded after \\d+ seconds$/","timeout":5000}} -->
3. Click **Trigger delayed action**.
   <!-- step {"click":"Trigger delayed action"} -->
4. Wait half a second for the action to finish.
   <!-- step {"wait":500} -->
5. Check that the page shows **Action complete!**.
   <!-- step {"find":"Action complete!"} -->
6. Confirm that [the server's status endpoint](http://localhost:8092/status/200) responds.
   <!-- step {"checkLink":{"url":"http://localhost:8092/status/200","statusCodes":[200,204],"headers":{"Accept":"application/json"},"timeout":5000}} -->

<!-- test end -->
