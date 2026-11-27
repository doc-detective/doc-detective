<!-- test {"testId":"sessions-cookie-domain","detectSteps":true} -->

# Keep the cookie for one domain

1. Sign in at [the sign-in page](http://localhost:8092/cookies/set/sessions_pdomain/signed-in). The server sets the `sessions_pdomain` cookie.
   <!-- step {"goTo":"http://localhost:8092/cookies/set/sessions_pdomain/signed-in"} -->
2. Save the `localhost` cookie named `sessions_pdomain` to `sessions_pdomain.txt`.
   <!-- step {"saveCookie":{"name":"sessions_pdomain","path":"sessions_pdomain.txt","domain":"localhost","overwrite":true}} -->
3. Sign out at [the sign-out page](http://localhost:8092/cookies/set/sessions_pdomain/signed-out), which replaces the cookie.
   <!-- step {"goTo":"http://localhost:8092/cookies/set/sessions_pdomain/signed-out"} -->
4. Load the `localhost` cookie from `sessions_pdomain.txt`.
   <!-- step {"loadCookie":{"name":"sessions_pdomain","path":"sessions_pdomain.txt","domain":"localhost"}} -->
5. Open [the cookie report](http://localhost:8092/cookies), and check that it shows **sessions_pdomain=signed-in**.

<!-- test end -->
