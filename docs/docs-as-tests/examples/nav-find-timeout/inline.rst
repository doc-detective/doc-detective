Give a late element more time
=============================

.. test {"testId":"nav-find-timeout","detectSteps":false}

#. Go to `the late element page <http://localhost:8092/waitUntil-test-late-element.html>`_.

   .. step {"goTo":"http://localhost:8092/waitUntil-test-late-element.html"}

#. Wait for the status line to read **System operational**.

   .. step {"find":{"elementText":"System operational","timeout":10000}}

.. test end
