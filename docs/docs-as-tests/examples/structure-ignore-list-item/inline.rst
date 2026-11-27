Check the demo pages
====================

.. test {"testId":"structure-ignore-list-item","detectSteps":false}

#. Check that `the elements demo <http://localhost:8092/index.html>`_ loads.

   .. step {"checkLink":"http://localhost:8092/index.html"}

   .. test ignore start

#. Check that `the type echo page <http://localhost:8092/type-echo.html>`_ loads.

   .. step {"checkLink":"http://localhost:8092/type-echo.html"}

   .. test ignore end

#. Check that `the status endpoint <http://localhost:8092/status/200>`_ answers.

   .. step {"checkLink":"http://localhost:8092/status/200"}

.. test end
