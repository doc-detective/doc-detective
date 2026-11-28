<!-- test {"testId":"sessions-cookie-form-name","detectSteps":true} -->

# Keep a cookie in an environment variable

1. Sign in at [the sign-in page](http://localhost:8092/cookies/set/sessions_pname/signed-in). The server sets the `sessions_pname` cookie.
   <!-- step {"goTo":"http://localhost:8092/cookies/set/sessions_pname/signed-in"} -->
2. Save the `sessions_pname` cookie to the `sessions_pname` environment variable.
   <!-- step {"saveCookie":"sessions_pname"} -->
3. Sign out at [the sign-out page](http://localhost:8092/cookies/set/sessions_pname/signed-out), which replaces the cookie.
   <!-- step {"goTo":"http://localhost:8092/cookies/set/sessions_pname/signed-out"} -->
4. Load the cookie from the `sessions_pname` environment variable.
   <!-- step {"loadCookie":"sessions_pname"} -->
5. Open [the cookie report](http://localhost:8092/cookies), and check that it shows **sessions_pname=signed-in**.

<!-- test end -->
