# Match the response to a schema

Send a `POST` request to `http://localhost:8093/api/invoices` with an invoice. In the response, `id` is a UUID, `created` is a date-time, `code` matches `^INV-[0-9]+$`, and `total` is a number.
