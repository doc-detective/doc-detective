Call an operation with its examples
===================================

.. test {"testId":"http-openapi-useexample-request","detectSteps":true,"openApi":[{"name":"users","descriptionPath":"../http-openapi/users.openapi.json"}]}

Call the ``createUser`` operation with its example user.

.. step {"httpRequest":{"openApi":{"operationId":"createUser","useExample":"request"}}}

.. test end
