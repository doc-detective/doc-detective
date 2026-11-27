Save a response
===============

.. test {"testId":"http-request-overwrite-false","detectSteps":true}

Send a ``GET`` request to ``http://localhost:8093/api/users?page=2``, and save the response to ``page-2.json``.

.. step {"httpRequest":{"url":"http://localhost:8093/api/users?page=2","path":"page-2.json","overwrite":"false"}}

.. test end
