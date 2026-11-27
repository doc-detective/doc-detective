<!-- test {"testId":"data-publicvariables-config","detectSteps":true} -->

# List products and show the URL in reports

1. Load the variables in `shop.env`.
   <!-- step {"loadVariables":"shop.env"} -->
2. List the products. Send a `GET` request to `$SHOP_URL/products`.
   <!-- step {"httpRequest":{"url":"$SHOP_URL/products","method":"get"}} -->

<!-- test end -->
