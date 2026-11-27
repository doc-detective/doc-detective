Require nested response fields
==============================

.. test {"testId":"http-request-response-required","detectSteps":true}

Send a ``POST`` request to ``http://localhost:8093/api/orders`` with a user and one item. The response has ``user.name`` and ``items[0].id``.

.. step {"httpRequest":{"url":"http://localhost:8093/api/orders","method":"post","request":{"body":{"user":{"name":"Ada"},"items":[{"id":"inv-1"}]}},"response":{"required":["user.name","items[0].id"]}}}

.. test end
