# Check the API, then the shop

<!-- test {"testId":"data-route-test-onpass-stop-spec-api","onPass":[{"stop":"spec"}],"runOn":[{"platforms":["mac","linux"]}],"detectSteps":false} -->

## Check the API

1. Send a `GET` request to `http://localhost:8092/api/health`.
   <!-- step {"httpRequest":{"url":"http://localhost:8092/api/health","method":"get"}} -->

<!-- test end -->

<!-- test {"testId":"data-route-test-onpass-stop-spec-cart","detectSteps":false} -->

## Check the cart

1. Send a `GET` request to `http://localhost:8092/api/carts`.
   <!-- step {"httpRequest":{"url":"http://localhost:8092/api/carts","method":"get"}} -->

<!-- test end -->

<!-- test {"testId":"data-route-test-onpass-stop-spec-products","detectSteps":false} -->

## Check the products

1. Send a `GET` request to `http://localhost:8092/api/products`.
   <!-- step {"httpRequest":{"url":"http://localhost:8092/api/products","method":"get"}} -->

<!-- test end -->
