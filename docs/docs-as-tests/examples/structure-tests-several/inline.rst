Check the demo pages
====================

Pages
-----

.. test {"testId":"structure-tests-several-pages","detectSteps":false}

#. Check that `the elements demo <http://localhost:8092/index.html>`_ loads.

   .. step {"checkLink":"http://localhost:8092/index.html"}

#. Check that `the type echo page <http://localhost:8092/type-echo.html>`_ loads.

   .. step {"checkLink":"http://localhost:8092/type-echo.html"}

.. test end

API
---

.. test {"testId":"structure-tests-several-api","detectSteps":false}

#. Check that `the status endpoint <http://localhost:8092/status/200>`_ answers.

   .. step {"checkLink":"http://localhost:8092/status/200"}

.. test end
