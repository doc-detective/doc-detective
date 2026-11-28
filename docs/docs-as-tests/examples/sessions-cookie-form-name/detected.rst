Keep a cookie in an environment variable
========================================

.. test {"testId":"sessions-cookie-form-name","detectSteps":true}

#. Sign in at `the sign-in page <http://localhost:8092/cookies/set/sessions_pname/signed-in>`__. The server sets the ``sessions_pname`` cookie.

   .. step {"goTo":"http://localhost:8092/cookies/set/sessions_pname/signed-in"}

#. Save the ``sessions_pname`` cookie to the ``sessions_pname`` environment variable.

   .. step {"saveCookie":"sessions_pname"}

#. Sign out at `the sign-out page <http://localhost:8092/cookies/set/sessions_pname/signed-out>`__, which replaces the cookie.

   .. step {"goTo":"http://localhost:8092/cookies/set/sessions_pname/signed-out"}

#. Load the cookie from the ``sessions_pname`` environment variable.

   .. step {"loadCookie":"sessions_pname"}

#. Open `the cookie report <http://localhost:8092/cookies>`__, and check that it shows **sessions_pname=signed-in**.

.. test end
