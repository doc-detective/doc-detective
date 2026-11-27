List products and show the URL in reports
=========================================

.. test {"testId":"data-publicvariables-test-exact","publicVariables":["SHOP_URL"],"detectSteps":false}

#. Load the variables in ``shop.env``.

   .. step {"loadVariables":"shop.env"}

#. List the products. Send a ``GET`` request to ``$SHOP_URL/products``.

   .. step {"httpRequest":{"url":"$SHOP_URL/products","method":"get"}}

.. test end
