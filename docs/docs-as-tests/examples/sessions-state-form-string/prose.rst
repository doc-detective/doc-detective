Keep the browser state in a file
================================

#. Delete any ``sessions-pstate.json`` that an earlier run left in the output folder.

#. Sign in at `the sign-in page <http://localhost:8092/cookies/set/sessions_pstate/signed-in>`__. The server sets the ``sessions_pstate`` cookie.

#. Save the browser state to ``sessions-pstate.json``.

#. Sign out at `the sign-out page <http://localhost:8092/cookies/set/sessions_pstate/signed-out>`__, which replaces the cookie.

#. Load the browser state from ``sessions-pstate.json``.

#. Open `the cookie report <http://localhost:8092/cookies>`__, and check that it shows **sessions_pstate=signed-in**.
