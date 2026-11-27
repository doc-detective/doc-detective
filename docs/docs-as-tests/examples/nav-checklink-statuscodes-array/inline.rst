Accept several status codes
===========================

.. test {"testId":"nav-checklink-statuscodes-array","detectSteps":false}

#. Check that `the element test page <http://localhost:8092/enhanced-elements.html>`_ responds.

   .. step {"checkLink":{"url":"http://localhost:8092/enhanced-elements.html","statusCodes":[200,304]}}

.. test end
