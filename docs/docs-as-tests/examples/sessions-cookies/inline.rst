Keep a session cookie
=====================

.. test {"testId":"sessions-cookies","detectSteps":false}

#. Sign in at `the sign-in page <http://localhost:8092/cookies/set/sessions_demo/signed-in>`__. The server sets the ``sessions_demo`` cookie.

   .. step {"goTo":"http://localhost:8092/cookies/set/sessions_demo/signed-in"}

#. Save the ``sessions_demo`` cookie four ways. Save it to the ``sessions_demo`` and ``SESSIONS_DEMO_COOKIE`` environment variables, and to ``sessions_demo.txt`` in the output folder. Save it to ``sessions_demo.txt`` in a ``tmp`` folder next to this file, keeping only the ``localhost`` cookie.

   .. step {"saveCookie":"sessions_demo"}

   .. step {"saveCookie":{"name":"sessions_demo","variable":"SESSIONS_DEMO_COOKIE"}}

   .. step {"saveCookie":{"name":"sessions_demo","path":"sessions_demo.txt","overwrite":true}}

   .. step {"saveCookie":{"name":"sessions_demo","path":"sessions_demo.txt","directory":"tmp","domain":"localhost","overwrite":true}}

#. Go to `the sign-out page <http://localhost:8092/cookies/set/sessions_demo/signed-out>`__, which replaces the cookie.

   .. step {"goTo":"http://localhost:8092/cookies/set/sessions_demo/signed-out"}

#. Load the cookie from ``sessions_demo.txt`` in the output folder.

   .. step {"loadCookie":"sessions_demo.txt"}

#. Go to `the cookie report <http://localhost:8092/cookies>`__, and check that it shows **sessions_demo=signed-in**.

   .. step {"goTo":"http://localhost:8092/cookies"}

   .. step {"find":"sessions_demo=signed-in"}

#. Go to `the sign-out page <http://localhost:8092/cookies/set/sessions_demo/signed-out>`__ again, and load the cookie from the ``SESSIONS_DEMO_COOKIE`` environment variable.

   .. step {"goTo":"http://localhost:8092/cookies/set/sessions_demo/signed-out"}

   .. step {"loadCookie":{"name":"sessions_demo","variable":"SESSIONS_DEMO_COOKIE"}}

#. Go to `the cookie report <http://localhost:8092/cookies>`__ again, and check that it shows **sessions_demo=signed-in**.

   .. step {"goTo":"http://localhost:8092/cookies"}

   .. step {"find":"sessions_demo=signed-in"}

#. Go to `the sign-out page <http://localhost:8092/cookies/set/sessions_demo/signed-out>`__ once more, and load the ``localhost`` cookie from ``tmp/sessions_demo.txt``.

   .. step {"goTo":"http://localhost:8092/cookies/set/sessions_demo/signed-out"}

   .. step {"loadCookie":{"name":"sessions_demo","path":"sessions_demo.txt","directory":"tmp","domain":"localhost"}}

#. Go to `the cookie report <http://localhost:8092/cookies>`__ a last time, and check that it shows **sessions_demo=signed-in**.

   .. step {"goTo":"http://localhost:8092/cookies"}

   .. step {"find":"sessions_demo=signed-in"}

.. test end
