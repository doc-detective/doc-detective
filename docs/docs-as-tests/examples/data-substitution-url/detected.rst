List products from a configured URL
===================================

.. test {"testId":"data-substitution-url","detectSteps":true}

#. Load the variables in ``shop.env``.

   .. step {"loadVariables":"shop.env"}

#. List the products. Send a ``GET`` request to ``$SHOP_URL/products``.

   .. step {"httpRequest":{"url":"$SHOP_URL/products","method":"get"}}

.. test end
