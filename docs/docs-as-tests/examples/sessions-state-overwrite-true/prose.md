# Replace a saved browser state

1. Sign in at [the sign-in page](http://localhost:8092/cookies/set/sessions_pstateo/signed-in). The server sets the `sessions_pstateo` cookie.
2. Save the browser state to `sessions-pstateo.json`, replacing any earlier file.
3. Sign out at [the sign-out page](http://localhost:8092/cookies/set/sessions_pstateo/signed-out), which replaces the cookie.
4. Load the browser state from `sessions-pstateo.json`.
5. Open [the cookie report](http://localhost:8092/cookies), and check that it shows **sessions_pstateo=signed-in**.
