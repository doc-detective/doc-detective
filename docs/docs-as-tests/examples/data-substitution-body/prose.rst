Send a client name in a request body
====================================

#. Load the variables in ``shop.env``.

#. Send a ``POST`` request to ``http://localhost:8092/api/orders`` with the body ``{"client": "$SHOP_CLIENT"}``.
