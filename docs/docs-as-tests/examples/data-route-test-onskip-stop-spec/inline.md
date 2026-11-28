# Find Node.js, then check the API

<!-- test {"testId":"data-route-test-onskip-stop-spec-windows","if":"$$platform == windows","onSkip":[{"stop":"spec"}],"detectSteps":false} -->

## Find Node.js on Windows

1. Find the Node.js executable:

   ```shell
   where node
   ```
   <!-- step {"runShell":"where node"} -->

<!-- test end -->

<!-- test {"testId":"data-route-test-onskip-stop-spec-cart","detectSteps":false} -->

## Check the cart

1. Send a `GET` request to `http://localhost:8092/api/carts`.
   <!-- step {"httpRequest":{"url":"http://localhost:8092/api/carts","method":"get"}} -->

<!-- test end -->

<!-- test {"testId":"data-route-test-onskip-stop-spec-products","detectSteps":false} -->

## Check the products

1. Send a `GET` request to `http://localhost:8092/api/products`.
   <!-- step {"httpRequest":{"url":"http://localhost:8092/api/products","method":"get"}} -->

<!-- test end -->
