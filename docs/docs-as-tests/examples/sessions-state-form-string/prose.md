# Keep the browser state in a file

1. Delete any `sessions-pstate.json` that an earlier run left in the output folder.
2. Sign in at [the sign-in page](http://localhost:8092/cookies/set/sessions_pstate/signed-in). The server sets the `sessions_pstate` cookie.
3. Save the browser state to `sessions-pstate.json`.
4. Sign out at [the sign-out page](http://localhost:8092/cookies/set/sessions_pstate/signed-out), which replaces the cookie.
5. Load the browser state from `sessions-pstate.json`.
6. Open [the cookie report](http://localhost:8092/cookies), and check that it shows **sessions_pstate=signed-in**.
