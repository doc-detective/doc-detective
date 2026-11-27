<!-- test {"testId":"sessions-cookie-variable","detectSteps":true} -->

# Keep a cookie in a named variable

1. Sign in at [the sign-in page](http://localhost:8092/cookies/set/sessions_pvar/signed-in). The server sets the `sessions_pvar` cookie.
   <!-- step {"goTo":"http://localhost:8092/cookies/set/sessions_pvar/signed-in"} -->
2. Save the `sessions_pvar` cookie to the `SESSIONS_PVAR` environment variable.
   <!-- step {"saveCookie":{"name":"sessions_pvar","variable":"SESSIONS_PVAR"}} -->
3. Sign out at [the sign-out page](http://localhost:8092/cookies/set/sessions_pvar/signed-out), which replaces the cookie.
   <!-- step {"goTo":"http://localhost:8092/cookies/set/sessions_pvar/signed-out"} -->
4. Load the cookie from `SESSIONS_PVAR`.
   <!-- step {"loadCookie":{"name":"sessions_pvar","variable":"SESSIONS_PVAR"}} -->
5. Open [the cookie report](http://localhost:8092/cookies), and check that it shows **sessions_pvar=signed-in**.

<!-- test end -->
