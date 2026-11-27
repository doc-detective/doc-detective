Keep the cookie for one domain
==============================

#. Sign in at `the sign-in page <http://localhost:8092/cookies/set/sessions_pdomain/signed-in>`__. The server sets the ``sessions_pdomain`` cookie.

#. Save the ``localhost`` cookie named ``sessions_pdomain`` to ``sessions_pdomain.txt``.

#. Sign out at `the sign-out page <http://localhost:8092/cookies/set/sessions_pdomain/signed-out>`__, which replaces the cookie.

#. Load the ``localhost`` cookie from ``sessions_pdomain.txt``.

#. Open `the cookie report <http://localhost:8092/cookies>`__, and check that it shows **sessions_pdomain=signed-in**.
