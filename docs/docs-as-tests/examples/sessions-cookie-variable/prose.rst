Keep a cookie in a named variable
=================================

#. Sign in at `the sign-in page <http://localhost:8092/cookies/set/sessions_pvar/signed-in>`__. The server sets the ``sessions_pvar`` cookie.

#. Save the ``sessions_pvar`` cookie to the ``SESSIONS_PVAR`` environment variable.

#. Sign out at `the sign-out page <http://localhost:8092/cookies/set/sessions_pvar/signed-out>`__, which replaces the cookie.

#. Load the cookie from ``SESSIONS_PVAR``.

#. Open `the cookie report <http://localhost:8092/cookies>`__, and check that it shows **sessions_pvar=signed-in**.
