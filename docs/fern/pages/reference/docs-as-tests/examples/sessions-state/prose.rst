Reuse a signed-in browser state
===============================

Run these steps in Firefox and in Chrome.

#. Sign in at `the sign-in page <http://localhost:8092/cookies/set/sessions_state/signed-in>`__. The server sets the ``sessions_state`` cookie.

#. Save the browser state to ``sessions-state.json``.

#. Go to `the sign-out page <http://localhost:8092/cookies/set/sessions_state/signed-out>`__, which replaces the cookie.

#. Load the browser state from ``sessions-state.json``.

#. Go to `the cookie report <http://localhost:8092/cookies>`__, and check that it shows **sessions_state=signed-in**.
