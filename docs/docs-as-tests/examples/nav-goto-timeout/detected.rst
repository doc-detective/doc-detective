Give a slow page more time to load
==================================

.. test {"testId":"nav-goto-timeout","detectSteps":true}

#. Go to `the static page <http://localhost:8092/waitUntil-test-static.html>`_.

   .. step {"goTo":{"url":"http://localhost:8092/waitUntil-test-static.html","timeout":60000}}

#. Check that the page shows **Static Page**.

.. test end
