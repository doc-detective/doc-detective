Replace a saved browser state
=============================

#. Sign in at `the sign-in page <http://localhost:8092/cookies/set/sessions_pstateo/signed-in>`__. The server sets the ``sessions_pstateo`` cookie.

#. Save the browser state to ``sessions-pstateo.json``, replacing any earlier file.

#. Sign out at `the sign-out page <http://localhost:8092/cookies/set/sessions_pstateo/signed-out>`__, which replaces the cookie.

#. Load the browser state from ``sessions-pstateo.json``.

#. Open `the cookie report <http://localhost:8092/cookies>`__, and check that it shows **sessions_pstateo=signed-in**.
