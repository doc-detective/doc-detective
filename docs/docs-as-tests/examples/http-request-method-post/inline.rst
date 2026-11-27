POST a user
===========

.. test {"testId":"http-request-method-post","detectSteps":false}

Send a ``POST`` request to ``http://localhost:8093/api/users`` with the body ``{"name":"Ada"}``.

.. step {"httpRequest":{"url":"http://localhost:8093/api/users","method":"post","request":{"body":{"name":"Ada"}},"response":{"body":{"name":"Ada"}}}}

.. test end
