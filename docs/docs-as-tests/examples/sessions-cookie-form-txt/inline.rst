Keep a cookie in a file
=======================

.. test {"testId":"sessions-cookie-form-txt","detectSteps":false}

#. Delete any ``sessions_ptxt.txt`` that an earlier run left in the output folder.

   .. step {"runShell":"node -e \"require('fs').rmSync('docs/docs-as-tests/examples/.dd-output/sessions_ptxt.txt', { force: true })\""}

#. Sign in at `the sign-in page <http://localhost:8092/cookies/set/sessions_ptxt/signed-in>`__. The server sets the ``sessions_ptxt`` cookie.

   .. step {"goTo":"http://localhost:8092/cookies/set/sessions_ptxt/signed-in"}

#. Save the ``sessions_ptxt`` cookie to ``sessions_ptxt.txt``.

   .. step {"saveCookie":"sessions_ptxt.txt"}

#. Sign out at `the sign-out page <http://localhost:8092/cookies/set/sessions_ptxt/signed-out>`__, which replaces the cookie.

   .. step {"goTo":"http://localhost:8092/cookies/set/sessions_ptxt/signed-out"}

#. Load the cookie from ``sessions_ptxt.txt``.

   .. step {"loadCookie":"sessions_ptxt.txt"}

#. Open `the cookie report <http://localhost:8092/cookies>`__, and check that it shows **sessions_ptxt=signed-in**.

   .. step {"goTo":"http://localhost:8092/cookies"}

   .. step {"find":"sessions_ptxt=signed-in"}

.. test end
