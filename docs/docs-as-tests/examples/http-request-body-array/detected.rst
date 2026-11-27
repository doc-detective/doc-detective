Send an array body
==================

.. test {"testId":"http-request-body-array","detectSteps":true}

Send a ``POST`` request to ``http://localhost:8093/api/users/batch`` with two users in an array. The response echoes the array.

.. step {"httpRequest":{"url":"http://localhost:8093/api/users/batch","method":"post","request":{"headers":{"Content-Type":"application/json"},"body":[{"name":"Ada"},{"name":"Grace"}]},"response":{"body":[{"name":"Ada"},{"name":"Grace"}]}}}

.. test end
