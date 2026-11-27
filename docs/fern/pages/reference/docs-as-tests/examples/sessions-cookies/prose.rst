Keep a session cookie
=====================

#. Sign in at `the sign-in page <http://localhost:8092/cookies/set/sessions_demo/signed-in>`__. The server sets the ``sessions_demo`` cookie.

#. Save the ``sessions_demo`` cookie to an environment variable of the same name, and to the file ``sessions_demo.txt``.

#. Go to `the sign-out page <http://localhost:8092/cookies/set/sessions_demo/signed-out>`__, which replaces the cookie.

#. Load the cookie from ``sessions_demo.txt``.

#. Go to `the cookie report <http://localhost:8092/cookies>`__, and check that it shows **sessions_demo=signed-in**.

#. Go to `the sign-out page <http://localhost:8092/cookies/set/sessions_demo/signed-out>`__ again, and load the cookie from the ``sessions_demo`` environment variable.

#. Go to `the cookie report <http://localhost:8092/cookies>`__ again, and check that it still shows **sessions_demo=signed-in**.
