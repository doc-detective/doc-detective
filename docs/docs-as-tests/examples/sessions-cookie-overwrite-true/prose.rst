Replace a saved cookie
======================

#. Sign in at `the sign-in page <http://localhost:8092/cookies/set/sessions_pover/first>`__. The server sets the ``sessions_pover`` cookie.

#. Save the ``sessions_pover`` cookie to ``sessions_pover.txt``, replacing any earlier file.

#. Sign in again at `the second sign-in page <http://localhost:8092/cookies/set/sessions_pover/second>`__, and save the cookie to the same file.

#. Sign out at `the sign-out page <http://localhost:8092/cookies/set/sessions_pover/signed-out>`__, which replaces the cookie.

#. Load the cookie from ``sessions_pover.txt``.

#. Open `the cookie report <http://localhost:8092/cookies>`__, and check that it shows **sessions_pover=second**.
