<!-- test {"testId":"http-openapi","detectSteps":true,"openApi":[{"name":"users","descriptionPath":"users.openapi.json","validateAgainstSchema":"both","headers":{"X-Test":"docs"}}]} -->

# Create a user from the API description

The Users API description, `users.openapi.json`, defines each operation with an example.

Call the `createUser` operation with its example request. The response matches the example user, Ada.

<!-- step {"httpRequest":{"openApi":{"name":"users","operationId":"createUser","useExample":"both","server":"http://localhost:8093/api","statusCode":200}}} -->

Call `createUser` again with your own user. The response includes the `name` and `job` fields.

<!-- step {"httpRequest":{"openApi":"createUser","request":{"body":{"name":"Grace","job":"admiral"}},"response":{"body":{"name":"Grace"},"required":["name","job"]}}} -->

The `getUser` operation isn't live yet, so preview its response from the description's `ada` example.

<!-- step {"httpRequest":{"openApi":{"operationId":"getUser","mockResponse":true,"useExample":"response","exampleKey":"ada","validateAgainstSchema":"response"},"response":{"body":{"name":"Ada"}}}} -->

<!-- test end -->
