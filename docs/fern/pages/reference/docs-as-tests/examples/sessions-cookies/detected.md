<!-- test {"testId":"sessions-cookies","detectSteps":true} -->

# Keep a session cookie

1. Sign in at [the sign-in page](http://localhost:8092/cookies/set/sessions_demo/signed-in). The server sets the `sessions_demo` cookie.
   <!-- step {"goTo":"http://localhost:8092/cookies/set/sessions_demo/signed-in"} -->
2. Save the `sessions_demo` cookie to an environment variable of the same name, and to the file `sessions_demo.txt`.
   <!-- step {"saveCookie":"sessions_demo"} -->
   <!-- step {"saveCookie":{"name":"sessions_demo","path":"sessions_demo.txt","overwrite":true}} -->
3. Go to [the sign-out page](http://localhost:8092/cookies/set/sessions_demo/signed-out), which replaces the cookie.
4. Load the cookie from `sessions_demo.txt`.
   <!-- step {"loadCookie":"sessions_demo.txt"} -->
5. Go to [the cookie report](http://localhost:8092/cookies), and check that it shows **sessions_demo=signed-in**.
6. Go to [the sign-out page](http://localhost:8092/cookies/set/sessions_demo/signed-out) again, and load the cookie from the `sessions_demo` environment variable.
   <!-- step {"loadCookie":{"name":"sessions_demo","variable":"sessions_demo"}} -->
7. Go to [the cookie report](http://localhost:8092/cookies) again, and check that it still shows **sessions_demo=signed-in**.

<!-- test end -->
