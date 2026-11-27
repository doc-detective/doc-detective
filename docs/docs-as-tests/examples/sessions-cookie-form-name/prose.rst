Keep a cookie in an environment variable
========================================

#. Sign in at `the sign-in page <http://localhost:8092/cookies/set/sessions_pname/signed-in>`__. The server sets the ``sessions_pname`` cookie.

#. Save the ``sessions_pname`` cookie to the ``sessions_pname`` environment variable.

#. Sign out at `the sign-out page <http://localhost:8092/cookies/set/sessions_pname/signed-out>`__, which replaces the cookie.

#. Load the cookie from the ``sessions_pname`` environment variable.

#. Open `the cookie report <http://localhost:8092/cookies>`__, and check that it shows **sessions_pname=signed-in**.
