<!-- test {"testId":"http-request-response-schema","detectSteps":true} -->

# Match the response to a schema

Send a `POST` request to `http://localhost:8093/api/invoices` with an invoice. In the response, `id` is a UUID, `created` is a date-time, `code` matches `^INV-[0-9]+$`, and `total` is a number.

<!-- step {"httpRequest":{"url":"http://localhost:8093/api/invoices","method":"post","request":{"body":{"id":"3f2b8c1e-9a4d-4e6f-8b1a-2c3d4e5f6a7b","created":"2026-11-26T10:00:00Z","code":"INV-1042","total":19.99}},"response":{"schema":{"type":"object","required":["id","created","code","total"],"properties":{"id":{"type":"string","format":"uuid"},"created":{"type":"string","format":"date-time"},"code":{"type":"string","pattern":"^INV-[0-9]+$"},"total":{"type":"number"}}}}}} -->

<!-- test end -->
