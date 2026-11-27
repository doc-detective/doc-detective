Load a description for one test
===============================

.. test {"testId":"http-openapi-level-test","detectSteps":false,"openApi":[{"name":"users","descriptionPath":"../http-openapi/users.openapi.json"}]}

Call the ``createUser`` operation with Ada as the user.

.. step {"httpRequest":{"openApi":"createUser","request":{"body":{"name":"Ada","job":"engineer"}}}}

.. test end
