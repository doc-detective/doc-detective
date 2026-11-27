<!-- test {"testId":"http-openapi-validate-none","detectSteps":true,"openApi":[{"name":"users","descriptionPath":"../http-openapi/users.openapi.json"}]} -->

# Validate against the description

Call the `createUser` operation with only a name.

<!-- step {"httpRequest":{"openApi":{"operationId":"createUser","validateAgainstSchema":"none"},"request":{"body":{"name":"Ada"}}}} -->

<!-- test end -->
