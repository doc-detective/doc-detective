PUT a user
==========

.. test {"testId":"http-request-method-put","detectSteps":true}

Send a ``PUT`` request to ``http://localhost:8093/api/users/2`` with the body ``{"job":"lead"}``.

.. step {"httpRequest":{"url":"http://localhost:8093/api/users/2","method":"put","request":{"body":{"job":"lead"}},"response":{"body":{"job":"lead"}}}}

.. test end
