<!-- test {"testId":"sessions-origin","detectSteps":true,"runOn":[{"platforms":["linux","mac"],"browsers":"chrome","requires":{"env":["SESSIONS_ORIGIN"]}}]} -->

# Test pages on your own site

These steps use paths, not full URLs. The run's config sets the site's origin.

1. Go to `/cookies/set/sessions_origin/visited`.
   <!-- step {"goTo":"/cookies/set/sessions_origin/visited"} -->
2. Go to `/cookies`, and check that the page shows `sessions_origin=visited`.
   <!-- step {"goTo":"/cookies"} -->
   <!-- step {"find":"sessions_origin=visited"} -->
3. Go to `/api/echo`, and check that the response echoes the `from` parameter that the config adds: `"from":"docs"`.
   <!-- step {"goTo":"/api/echo"} -->
   <!-- step {"find":"/\"from\":\"docs\"/"} -->

<!-- test end -->
