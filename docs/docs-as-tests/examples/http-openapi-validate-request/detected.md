<!-- test {"testId":"http-openapi-validate-request","detectSteps":true,"openApi":[{"name":"users","descriptionPath":"../http-openapi/users.openapi.json"}]} -->

# Validate against the description

Call the `createUser` operation with Ada as the user.

<!-- step {"httpRequest":{"openApi":{"operationId":"createUser","validateAgainstSchema":"request"},"request":{"body":{"name":"Ada","job":"engineer"}}}} -->

<!-- test end -->
