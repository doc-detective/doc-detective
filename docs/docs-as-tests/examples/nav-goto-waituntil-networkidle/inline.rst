Wait for network requests to finish
===================================

.. test {"testId":"nav-goto-waituntil-networkidle","detectSteps":false}

#. Go to `the network test page <http://localhost:8092/waitUntil-test-network.html>`_.

   .. step {"goTo":{"url":"http://localhost:8092/waitUntil-test-network.html","waitUntil":{"networkIdleTime":500}}}

#. Check that the page shows **Content loaded from API**.

   .. step {"find":"Content loaded from API"}

.. test end
