Send a header as an object
==========================

.. test {"testId":"http-request-headers-object","detectSteps":false}

Send a ``GET`` request to ``http://localhost:8093/api/users`` with the header ``X-Test: docs``. The response's ``x-echo-test`` header is ``docs``.

.. step {"httpRequest":{"url":"http://localhost:8093/api/users","request":{"headers":{"X-Test":"docs"}},"response":{"headers":{"x-echo-test":"docs"}}}}

.. test end
