Send a JSON string body
=======================

.. test {"testId":"http-request-body-string","detectSteps":false}

Send a ``POST`` request to ``http://localhost:8093/api/users`` with the JSON body ``{"name": "Ada"}``. The response echoes it.

.. step {"httpRequest":{"url":"http://localhost:8093/api/users","method":"post","request":{"headers":{"Content-Type":"application/json"},"body":"{\"name\": \"Ada\"}"},"response":{"body":{"name":"Ada"}}}}

.. test end
