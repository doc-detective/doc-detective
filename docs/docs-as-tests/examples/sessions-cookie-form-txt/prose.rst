Keep a cookie in a file
=======================

#. Delete any ``sessions_ptxt.txt`` that an earlier run left in the output folder.

#. Sign in at `the sign-in page <http://localhost:8092/cookies/set/sessions_ptxt/signed-in>`__. The server sets the ``sessions_ptxt`` cookie.

#. Save the ``sessions_ptxt`` cookie to ``sessions_ptxt.txt``.

#. Sign out at `the sign-out page <http://localhost:8092/cookies/set/sessions_ptxt/signed-out>`__, which replaces the cookie.

#. Load the cookie from ``sessions_ptxt.txt``.

#. Open `the cookie report <http://localhost:8092/cookies>`__, and check that it shows **sessions_ptxt=signed-in**.
