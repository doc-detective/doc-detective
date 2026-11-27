Validate against the description
================================

.. test {"testId":"http-openapi-validate-none","detectSteps":false,"openApi":[{"name":"users","descriptionPath":"../http-openapi/users.openapi.json"}]}

Call the ``createUser`` operation with only a name.

.. step {"httpRequest":{"openApi":{"operationId":"createUser","validateAgainstSchema":"none"},"request":{"body":{"name":"Ada"}}}}

.. test end
