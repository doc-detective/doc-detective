Keep the browser state in a file
================================

.. test {"testId":"sessions-state-form-string","detectSteps":true}

#. Delete any ``sessions-pstate.json`` that an earlier run left in the output folder.

   .. step {"runShell":"node -e \"require('fs').rmSync('docs/docs-as-tests/examples/.dd-output/sessions-pstate.json', { force: true })\""}

#. Sign in at `the sign-in page <http://localhost:8092/cookies/set/sessions_pstate/signed-in>`__. The server sets the ``sessions_pstate`` cookie.

   .. step {"goTo":"http://localhost:8092/cookies/set/sessions_pstate/signed-in"}

#. Save the browser state to ``sessions-pstate.json``.

   .. step {"saveState":"sessions-pstate.json"}

#. Sign out at `the sign-out page <http://localhost:8092/cookies/set/sessions_pstate/signed-out>`__, which replaces the cookie.

   .. step {"goTo":"http://localhost:8092/cookies/set/sessions_pstate/signed-out"}

#. Load the browser state from ``sessions-pstate.json``.

   .. step {"loadState":"sessions-pstate.json"}

#. Open `the cookie report <http://localhost:8092/cookies>`__, and check that it shows **sessions_pstate=signed-in**.

.. test end
