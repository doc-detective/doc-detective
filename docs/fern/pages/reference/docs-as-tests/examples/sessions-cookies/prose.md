# Keep a session cookie

1. Sign in at [the sign-in page](http://localhost:8092/cookies/set/sessions_demo/signed-in). The server sets the `sessions_demo` cookie.
2. Save the `sessions_demo` cookie four ways: to the `sessions_demo` and `SESSIONS_DEMO_COOKIE` environment variables, to `sessions_demo.txt` in the output folder, and to `sessions_demo.txt` in a `tmp` folder next to this file, keeping only the `localhost` cookie.
3. Go to [the sign-out page](http://localhost:8092/cookies/set/sessions_demo/signed-out), which replaces the cookie.
4. Load the cookie from `sessions_demo.txt` in the output folder.
5. Go to [the cookie report](http://localhost:8092/cookies), and check that it shows **sessions_demo=signed-in**.
6. Go to [the sign-out page](http://localhost:8092/cookies/set/sessions_demo/signed-out) again, and load the cookie from the `SESSIONS_DEMO_COOKIE` environment variable.
7. Go to [the cookie report](http://localhost:8092/cookies) again, and check that it shows **sessions_demo=signed-in**.
8. Go to [the sign-out page](http://localhost:8092/cookies/set/sessions_demo/signed-out) once more, and load the `localhost` cookie from `tmp/sessions_demo.txt`.
9. Go to [the cookie report](http://localhost:8092/cookies) a last time, and check that it shows **sessions_demo=signed-in**.
