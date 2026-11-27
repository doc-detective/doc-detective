Check the demo pages
====================

Pages
-----

.. test {"testId":"structure-ignore-test-pages","detectSteps":false}

#. Check that `the elements demo <http://localhost:8092/index.html>`_ loads.

   .. step {"checkLink":"http://localhost:8092/index.html"}

.. test end

.. test ignore start

API
---

.. test {"testId":"structure-ignore-test-api","detectSteps":false}

#. Check that `the status endpoint <http://localhost:8092/status/200>`_ answers.

   .. step {"checkLink":"http://localhost:8092/status/200"}

.. test end

.. test ignore end
