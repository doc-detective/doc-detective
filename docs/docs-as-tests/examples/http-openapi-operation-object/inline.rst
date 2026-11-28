Call an operation with options
==============================

.. test {"testId":"http-openapi-operation-object","detectSteps":false,"openApi":[{"name":"users","descriptionPath":"../http-openapi/users.openapi.json"}]}

Call the ``createUser`` operation with Ada as the user.

.. step {"httpRequest":{"openApi":{"operationId":"createUser"},"request":{"body":{"name":"Ada","job":"engineer"}},"response":{"body":{"name":"Ada"}}}}

.. test end
