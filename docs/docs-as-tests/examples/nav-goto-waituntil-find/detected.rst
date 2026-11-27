Wait for an element to appear
=============================

.. test {"testId":"nav-goto-waituntil-find","detectSteps":true}

#. Go to `the late element page <http://localhost:8092/waitUntil-test-late-element.html>`_.

   .. step {"goTo":{"url":"http://localhost:8092/waitUntil-test-late-element.html","waitUntil":{"find":{"selector":".dashboard-loaded"}}}}

#. Check that the page shows **Dashboard**.

.. test end
