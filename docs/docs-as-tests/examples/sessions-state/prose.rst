Reuse a signed-in browser state
===============================

Run these steps in Firefox and in Chrome.

#. Sign in at `the sign-in page <http://localhost:8092/cookies/set/sessions_state/signed-in>`__. The server sets the ``sessions_state`` cookie.

#. Save the browser state to ``sessions-state.json`` in the output folder, and to ``sessions-state.json`` in a ``tmp`` folder next to this file.

#. Go to `the sign-out page <http://localhost:8092/cookies/set/sessions_state/signed-out>`__, which replaces the cookie.

#. Load the browser state from ``sessions-state.json`` in the output folder.

#. Go to `the cookie report <http://localhost:8092/cookies>`__, and check that it shows **sessions_state=signed-in**.

#. Go to `the sign-out page <http://localhost:8092/cookies/set/sessions_state/signed-out>`__ again, and load the browser state from ``tmp/sessions-state.json``.

#. Go to `the cookie report <http://localhost:8092/cookies>`__ again, and check that it shows **sessions_state=signed-in**.
