Expect a text response
======================

.. test {"testId":"http-request-response-string","detectSteps":true}

Send a ``GET`` request to ``http://localhost:8092/cookies/set/theme/dark``. The response is the text ``Cookie set.``

.. step {"httpRequest":{"url":"http://localhost:8092/cookies/set/theme/dark","response":{"body":"Cookie set."}}}

.. test end
