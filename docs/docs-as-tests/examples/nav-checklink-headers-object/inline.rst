Send headers as an object
=========================

.. test {"testId":"nav-checklink-headers-object","detectSteps":false}

#. Check that `the API health check <http://localhost:8092/api/health>`_ responds.

   .. step {"checkLink":{"url":"http://localhost:8092/api/health","headers":{"Accept":"application/json","X-Test":"docs"}}}

.. test end
