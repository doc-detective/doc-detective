Check the demo pages
====================

Pages
-----

.. test {"testId":"structure-testend-implied-pages","detectSteps":false}

#. Check that `the elements demo <http://localhost:8092/index.html>`_ loads.

   .. step {"checkLink":"http://localhost:8092/index.html"}

API
---

.. test {"testId":"structure-testend-implied-api","detectSteps":false}

#. Check that `the status endpoint <http://localhost:8092/status/200>`_ answers.

   .. step {"checkLink":"http://localhost:8092/status/200"}
