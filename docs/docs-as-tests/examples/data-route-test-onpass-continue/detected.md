# Check the API, then the shop

<!-- test {"testId":"data-route-test-onpass-continue-api","onPass":[{"continue":true}],"detectSteps":true} -->

## Check the API

1. Send a `GET` request to `http://localhost:8092/api/health`.
   <!-- step {"httpRequest":{"url":"http://localhost:8092/api/health","method":"get"}} -->

<!-- test end -->

<!-- test {"testId":"data-route-test-onpass-continue-cart","detectSteps":true} -->

## Check the cart

1. Send a `GET` request to `http://localhost:8092/api/carts`.
   <!-- step {"httpRequest":{"url":"http://localhost:8092/api/carts","method":"get"}} -->

<!-- test end -->

<!-- test {"testId":"data-route-test-onpass-continue-products","detectSteps":true} -->

## Check the products

1. Send a `GET` request to `http://localhost:8092/api/products`.
   <!-- step {"httpRequest":{"url":"http://localhost:8092/api/products","method":"get"}} -->

<!-- test end -->
