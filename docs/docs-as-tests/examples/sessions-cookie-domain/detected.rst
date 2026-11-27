Keep the cookie for one domain
==============================

.. test {"testId":"sessions-cookie-domain","detectSteps":true}

#. Sign in at `the sign-in page <http://localhost:8092/cookies/set/sessions_pdomain/signed-in>`__. The server sets the ``sessions_pdomain`` cookie.

   .. step {"goTo":"http://localhost:8092/cookies/set/sessions_pdomain/signed-in"}

#. Save the ``localhost`` cookie named ``sessions_pdomain`` to ``sessions_pdomain.txt``.

   .. step {"saveCookie":{"name":"sessions_pdomain","path":"sessions_pdomain.txt","domain":"localhost","overwrite":true}}

#. Sign out at `the sign-out page <http://localhost:8092/cookies/set/sessions_pdomain/signed-out>`__, which replaces the cookie.

   .. step {"goTo":"http://localhost:8092/cookies/set/sessions_pdomain/signed-out"}

#. Load the ``localhost`` cookie from ``sessions_pdomain.txt``.

   .. step {"loadCookie":{"name":"sessions_pdomain","path":"sessions_pdomain.txt","domain":"localhost"}}

#. Open `the cookie report <http://localhost:8092/cookies>`__, and check that it shows **sessions_pdomain=signed-in**.

.. test end
