<!-- test {"testId":"http-request-additional-fields-false","detectSteps":true} -->

# Reject extra response fields

Send a `POST` request to `http://localhost:8093/api/users` with the body `{"name": "Ada"}`. The response holds only `name`.

<!-- step {"httpRequest":{"url":"http://localhost:8093/api/users","method":"post","request":{"body":{"name":"Ada"}},"response":{"body":{"name":"Ada"}},"allowAdditionalFields":false}} -->

<!-- test end -->
