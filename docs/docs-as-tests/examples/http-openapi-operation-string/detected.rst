Call an operation by ID
=======================

.. test {"testId":"http-openapi-operation-string","detectSteps":true,"openApi":[{"name":"users","descriptionPath":"../http-openapi/users.openapi.json"}]}

Call the ``createUser`` operation with Ada as the user.

.. step {"httpRequest":{"openApi":"createUser","request":{"body":{"name":"Ada","job":"engineer"}},"response":{"body":{"name":"Ada"}}}}

.. test end
