<!-- test {"testId":"http-request-block-untagged","detectSteps":false} -->

# Send a raw request from a plain block

Send this request:

```
GET http://localhost:8093/api/users?page=2
X-Test: docs
```

<!-- step {"httpRequest":{"url":"http://localhost:8093/api/users?page=2","method":"get","request":{"headers":{"X-Test":"docs"}}}} -->

<!-- test end -->
