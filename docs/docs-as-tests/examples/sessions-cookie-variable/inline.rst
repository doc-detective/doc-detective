Keep a cookie in a named variable
=================================

.. test {"testId":"sessions-cookie-variable","detectSteps":false}

#. Sign in at `the sign-in page <http://localhost:8092/cookies/set/sessions_pvar/signed-in>`__. The server sets the ``sessions_pvar`` cookie.

   .. step {"goTo":"http://localhost:8092/cookies/set/sessions_pvar/signed-in"}

#. Save the ``sessions_pvar`` cookie to the ``SESSIONS_PVAR`` environment variable.

   .. step {"saveCookie":{"name":"sessions_pvar","variable":"SESSIONS_PVAR"}}

#. Sign out at `the sign-out page <http://localhost:8092/cookies/set/sessions_pvar/signed-out>`__, which replaces the cookie.

   .. step {"goTo":"http://localhost:8092/cookies/set/sessions_pvar/signed-out"}

#. Load the cookie from ``SESSIONS_PVAR``.

   .. step {"loadCookie":{"name":"sessions_pvar","variable":"SESSIONS_PVAR"}}

#. Open `the cookie report <http://localhost:8092/cookies>`__, and check that it shows **sessions_pvar=signed-in**.

   .. step {"goTo":"http://localhost:8092/cookies"}

   .. step {"find":"sessions_pvar=signed-in"}

.. test end
