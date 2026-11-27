# Keep a cookie in a file

1. Delete any `sessions_ptxt.txt` that an earlier run left in the output folder.
2. Sign in at [the sign-in page](http://localhost:8092/cookies/set/sessions_ptxt/signed-in). The server sets the `sessions_ptxt` cookie.
3. Save the `sessions_ptxt` cookie to `sessions_ptxt.txt`.
4. Sign out at [the sign-out page](http://localhost:8092/cookies/set/sessions_ptxt/signed-out), which replaces the cookie.
5. Load the cookie from `sessions_ptxt.txt`.
6. Open [the cookie report](http://localhost:8092/cookies), and check that it shows **sessions_ptxt=signed-in**.
