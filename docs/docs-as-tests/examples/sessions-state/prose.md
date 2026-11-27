# Reuse a signed-in browser state

Run these steps in Firefox and in Chrome.

1. Sign in at [the sign-in page](http://localhost:8092/cookies/set/sessions_state/signed-in). The server sets the `sessions_state` cookie.
2. Save the browser state to `sessions-state.json` in the output folder, and to `sessions-state.json` in a `tmp` folder next to this file.
3. Go to [the sign-out page](http://localhost:8092/cookies/set/sessions_state/signed-out), which replaces the cookie.
4. Load the browser state from `sessions-state.json` in the output folder.
5. Go to [the cookie report](http://localhost:8092/cookies), and check that it shows **sessions_state=signed-in**.
6. Go to [the sign-out page](http://localhost:8092/cookies/set/sessions_state/signed-out) again, and load the browser state from `tmp/sessions-state.json`.
7. Go to [the cookie report](http://localhost:8092/cookies) again, and check that it shows **sessions_state=signed-in**.
