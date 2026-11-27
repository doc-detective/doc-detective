# Count the items in a cart

1. Create a cart. Send a `POST` request to `http://localhost:8092/api/carts` with this body:

   ```json
   {"items":[{"sku":"A1","qty":2},{"sku":"B2","qty":1}]}
   ```
2. Send the count in a `GET` request to `http://localhost:8092/api/carts?count=<count>`.
