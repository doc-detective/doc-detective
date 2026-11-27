Keep a session cookie
=====================

#. Sign in at `the sign-in page <http://localhost:8092/cookies/set/sessions_demo/signed-in>`__. The server sets the ``sessions_demo`` cookie.

#. Save the ``sessions_demo`` cookie four ways. Save it to the ``sessions_demo`` and ``SESSIONS_DEMO_COOKIE`` environment variables, and to ``sessions_demo.txt`` in the output folder. Save it to ``sessions_demo.txt`` in a ``tmp`` folder next to this file, keeping only the ``localhost`` cookie.

#. Go to `the sign-out page <http://localhost:8092/cookies/set/sessions_demo/signed-out>`__, which replaces the cookie.

#. Load the cookie from ``sessions_demo.txt`` in the output folder.

#. Go to `the cookie report <http://localhost:8092/cookies>`__, and check that it shows **sessions_demo=signed-in**.

#. Go to `the sign-out page <http://localhost:8092/cookies/set/sessions_demo/signed-out>`__ again, and load the cookie from the ``SESSIONS_DEMO_COOKIE`` environment variable.

#. Go to `the cookie report <http://localhost:8092/cookies>`__ again, and check that it shows **sessions_demo=signed-in**.

#. Go to `the sign-out page <http://localhost:8092/cookies/set/sessions_demo/signed-out>`__ once more, and load the ``localhost`` cookie from ``tmp/sessions_demo.txt``.

#. Go to `the cookie report <http://localhost:8092/cookies>`__ a last time, and check that it shows **sessions_demo=signed-in**.
