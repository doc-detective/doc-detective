<!-- test {"testId":"data-variables-array-index","detectSteps":true} -->

# Look up the first item in a cart

1. Create a cart. Send a `POST` request to `http://localhost:8092/api/carts` with this body:

   ```json
   {"items":[{"sku":"A1","qty":2},{"sku":"B2","qty":1}]}
   ```
   <!-- step {"httpRequest":{"url":"http://localhost:8092/api/carts","method":"post","request":{"body":{"items":[{"sku":"A1","qty":2},{"sku":"B2","qty":1}]}}},"variables":{"FIRST_SKU":"$$response.body.items[0].sku"}} -->
2. Look up the first item. Send a `GET` request to `http://localhost:8092/api/products?sku=<sku>`.
   <!-- step {"httpRequest":{"url":"http://localhost:8092/api/products?sku=$FIRST_SKU","method":"get","response":{"body":{"sku":"A1"}}}} -->

<!-- test end -->
