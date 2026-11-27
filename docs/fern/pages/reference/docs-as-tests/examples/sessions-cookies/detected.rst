Keep a session cookie
=====================

.. test {"testId":"sessions-cookies","detectSteps":true}

#. Sign in at `the sign-in page <http://localhost:8092/cookies/set/sessions_demo/signed-in>`__. The server sets the ``sessions_demo`` cookie.

   .. step {"goTo":"http://localhost:8092/cookies/set/sessions_demo/signed-in"}

#. Save the ``sessions_demo`` cookie to an environment variable of the same name, and to the file ``sessions_demo.txt``.

   .. step {"saveCookie":"sessions_demo"}

   .. step {"saveCookie":{"name":"sessions_demo","path":"sessions_demo.txt","overwrite":true}}

#. Go to `the sign-out page <http://localhost:8092/cookies/set/sessions_demo/signed-out>`__, which replaces the cookie.

#. Load the cookie from ``sessions_demo.txt``.

   .. step {"loadCookie":"sessions_demo.txt"}

#. Go to `the cookie report <http://localhost:8092/cookies>`__, and check that it shows **sessions_demo=signed-in**.

#. Go to `the sign-out page <http://localhost:8092/cookies/set/sessions_demo/signed-out>`__ again, and load the cookie from the ``sessions_demo`` environment variable.

   .. step {"loadCookie":{"name":"sessions_demo","variable":"sessions_demo"}}

#. Go to `the cookie report <http://localhost:8092/cookies>`__ again, and check that it still shows **sessions_demo=signed-in**.

.. test end
