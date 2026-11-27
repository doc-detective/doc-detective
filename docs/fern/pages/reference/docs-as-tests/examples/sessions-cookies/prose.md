# Keep a session cookie

1. Sign in at [the sign-in page](http://localhost:8092/cookies/set/sessions_demo/signed-in). The server sets the `sessions_demo` cookie.
2. Save the `sessions_demo` cookie to an environment variable of the same name, and to the file `sessions_demo.txt`.
3. Go to [the sign-out page](http://localhost:8092/cookies/set/sessions_demo/signed-out), which replaces the cookie.
4. Load the cookie from `sessions_demo.txt`.
5. Go to [the cookie report](http://localhost:8092/cookies), and check that it shows **sessions_demo=signed-in**.
6. Go to [the sign-out page](http://localhost:8092/cookies/set/sessions_demo/signed-out) again, and load the cookie from the `sessions_demo` environment variable.
7. Go to [the cookie report](http://localhost:8092/cookies) again, and check that it still shows **sessions_demo=signed-in**.
