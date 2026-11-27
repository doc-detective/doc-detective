Send headers as text
====================

.. test {"testId":"nav-checklink-headers-string","detectSteps":false}

#. Check that `the API health check <http://localhost:8092/api/health>`_ responds.

   .. step {"checkLink":{"url":"http://localhost:8092/api/health","headers":"Accept: application/json\nX-Test: docs"}}

.. test end
