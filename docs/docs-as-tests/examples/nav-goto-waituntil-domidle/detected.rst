Wait for the page to stop changing
==================================

.. test {"testId":"nav-goto-waituntil-domidle","detectSteps":true}

#. Go to `the DOM mutations page <http://localhost:8092/waitUntil-test-dom-mutations.html>`_.

   .. step {"goTo":{"url":"http://localhost:8092/waitUntil-test-dom-mutations.html","waitUntil":{"domIdleTime":1000}}}

#. Check that the page shows **All mutations complete**.

.. test end
