Send a client name in a header
==============================

.. test {"testId":"data-substitution-headers","detectSteps":true}

#. Load the variables in ``shop.env``.

   .. step {"loadVariables":"shop.env"}

#. Send a ``GET`` request to ``http://localhost:8092/api/products`` with the header ``X-Test: $SHOP_CLIENT``.

   .. step {"httpRequest":{"url":"http://localhost:8092/api/products","method":"get","request":{"headers":{"X-Test":"$SHOP_CLIENT"}},"response":{"headers":{"x-echo-test":"docs"}}}}

.. test end
