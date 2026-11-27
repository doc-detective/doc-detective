Allow extra response fields
===========================

.. test {"testId":"http-request-additional-fields-true","detectSteps":true}

Send a ``POST`` request to ``http://localhost:8092/api/users`` with the body ``{"name": "Ada"}``. The response holds ``name`` and an extra field.

.. step {"httpRequest":{"url":"http://localhost:8092/api/users","method":"post","request":{"body":{"name":"Ada"}},"response":{"body":{"name":"Ada"}},"allowAdditionalFields":true}}

.. test end
