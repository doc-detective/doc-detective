Reuse a signed-in browser state
===============================

.. test {"testId":"sessions-state","detectSteps":true,"runOn":[{"platforms":["linux","mac","windows"],"browsers":[{"name":"firefox","headless":true,"window":{"width":1280,"height":900},"viewport":{"width":1200,"height":800}}],"browserFallback":"off","retries":2},{"platforms":["linux","mac","windows"],"browsers":{"name":"chrome","headless":true}}]}

Run these steps in Firefox and in Chrome.

#. Sign in at `the sign-in page <http://localhost:8092/cookies/set/sessions_state/signed-in>`__. The server sets the ``sessions_state`` cookie.

   .. step {"goTo":"http://localhost:8092/cookies/set/sessions_state/signed-in"}

#. Save the browser state to ``sessions-state.json`` in the output folder, and to ``sessions-state.json`` in a ``tmp`` folder next to this file.

   .. step {"saveState":{"path":"sessions-state.json","overwrite":true}}

   .. step {"saveState":{"path":"sessions-state.json","directory":"tmp","overwrite":true}}

#. Go to `the sign-out page <http://localhost:8092/cookies/set/sessions_state/signed-out>`__, which replaces the cookie.

#. Load the browser state from ``sessions-state.json`` in the output folder.

   .. step {"loadState":"sessions-state.json"}

#. Go to `the cookie report <http://localhost:8092/cookies>`__, and check that it shows **sessions_state=signed-in**.

#. Go to `the sign-out page <http://localhost:8092/cookies/set/sessions_state/signed-out>`__ again, and load the browser state from ``tmp/sessions-state.json``.

   .. step {"loadState":{"path":"sessions-state.json","directory":"tmp"}}

#. Go to `the cookie report <http://localhost:8092/cookies>`__ again, and check that it shows **sessions_state=signed-in**.

.. test end
