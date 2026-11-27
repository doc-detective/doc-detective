Send a raw HTTP request
=======================

.. test {"testId":"http-request-block-http","detectSteps":true}

Send this request:

.. code-block:: http

   GET http://localhost:8093/api/users?page=2 HTTP/1.1

.. test end
