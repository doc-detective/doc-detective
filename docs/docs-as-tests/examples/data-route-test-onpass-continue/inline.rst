Check the API, then the shop
============================

.. test {"testId":"data-route-test-onpass-continue-api","onPass":[{"continue":true}],"detectSteps":false}

Check the API
-------------

#. Send a ``GET`` request to ``http://localhost:8092/api/health``.

   .. step {"httpRequest":{"url":"http://localhost:8092/api/health","method":"get"}}

.. test end

.. test {"testId":"data-route-test-onpass-continue-cart","detectSteps":false}

Check the cart
--------------

#. Send a ``GET`` request to ``http://localhost:8092/api/carts``.

   .. step {"httpRequest":{"url":"http://localhost:8092/api/carts","method":"get"}}

.. test end

.. test {"testId":"data-route-test-onpass-continue-products","detectSteps":false}

Check the products
------------------

#. Send a ``GET`` request to ``http://localhost:8092/api/products``.

   .. step {"httpRequest":{"url":"http://localhost:8092/api/products","method":"get"}}

.. test end
