# Create an order and look it up

1. Create an order. Send a `POST` request to `http://localhost:8092/api/orders` with this body:

   ```json
   {"id":"ord-1001"}
   ```
2. Look up the order. Send a `GET` request to `http://localhost:8092/api/orders?id=<id>`.
