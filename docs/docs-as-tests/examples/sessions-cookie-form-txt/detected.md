<!-- test {"testId":"sessions-cookie-form-txt","detectSteps":true} -->

# Keep a cookie in a file

1. Delete any `sessions_ptxt.txt` that an earlier run left in the output folder.
   <!-- step {"runShell":"node -e \"require('fs').rmSync('docs/docs-as-tests/examples/.dd-output/sessions_ptxt.txt', { force: true })\""} -->
2. Sign in at [the sign-in page](http://localhost:8092/cookies/set/sessions_ptxt/signed-in). The server sets the `sessions_ptxt` cookie.
   <!-- step {"goTo":"http://localhost:8092/cookies/set/sessions_ptxt/signed-in"} -->
3. Save the `sessions_ptxt` cookie to `sessions_ptxt.txt`.
   <!-- step {"saveCookie":"sessions_ptxt.txt"} -->
4. Sign out at [the sign-out page](http://localhost:8092/cookies/set/sessions_ptxt/signed-out), which replaces the cookie.
   <!-- step {"goTo":"http://localhost:8092/cookies/set/sessions_ptxt/signed-out"} -->
5. Load the cookie from `sessions_ptxt.txt`.
   <!-- step {"loadCookie":"sessions_ptxt.txt"} -->
6. Open [the cookie report](http://localhost:8092/cookies), and check that it shows **sessions_ptxt=signed-in**.

<!-- test end -->
