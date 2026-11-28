Replace a saved browser state
=============================

.. test {"testId":"sessions-state-overwrite-true","detectSteps":true}

#. Sign in at `the sign-in page <http://localhost:8092/cookies/set/sessions_pstateo/signed-in>`__. The server sets the ``sessions_pstateo`` cookie.

   .. step {"goTo":"http://localhost:8092/cookies/set/sessions_pstateo/signed-in"}

#. Save the browser state to ``sessions-pstateo.json``, replacing any earlier file.

   .. step {"saveState":{"path":"sessions-pstateo.json","overwrite":true}}

#. Sign out at `the sign-out page <http://localhost:8092/cookies/set/sessions_pstateo/signed-out>`__, which replaces the cookie.

   .. step {"goTo":"http://localhost:8092/cookies/set/sessions_pstateo/signed-out"}

#. Load the browser state from ``sessions-pstateo.json``.

   .. step {"loadState":{"path":"sessions-pstateo.json"}}

#. Open `the cookie report <http://localhost:8092/cookies>`__, and check that it shows **sessions_pstateo=signed-in**.

.. test end
