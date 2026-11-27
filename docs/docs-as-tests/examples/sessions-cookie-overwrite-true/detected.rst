Replace a saved cookie
======================

.. test {"testId":"sessions-cookie-overwrite-true","detectSteps":true}

#. Sign in at `the sign-in page <http://localhost:8092/cookies/set/sessions_pover/first>`__. The server sets the ``sessions_pover`` cookie.

   .. step {"goTo":"http://localhost:8092/cookies/set/sessions_pover/first"}

#. Save the ``sessions_pover`` cookie to ``sessions_pover.txt``, replacing any earlier file.

   .. step {"saveCookie":{"name":"sessions_pover","path":"sessions_pover.txt","overwrite":true}}

#. Sign in again at `the second sign-in page <http://localhost:8092/cookies/set/sessions_pover/second>`__, and save the cookie to the same file.

   .. step {"goTo":"http://localhost:8092/cookies/set/sessions_pover/second"}

   .. step {"saveCookie":{"name":"sessions_pover","path":"sessions_pover.txt","overwrite":true}}

#. Sign out at `the sign-out page <http://localhost:8092/cookies/set/sessions_pover/signed-out>`__, which replaces the cookie.

   .. step {"goTo":"http://localhost:8092/cookies/set/sessions_pover/signed-out"}

#. Load the cookie from ``sessions_pover.txt``.

   .. step {"loadCookie":{"name":"sessions_pover","path":"sessions_pover.txt"}}

#. Open `the cookie report <http://localhost:8092/cookies>`__, and check that it shows **sessions_pover=second**.

.. test end
