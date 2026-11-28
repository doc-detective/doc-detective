Create an order and look it up
==============================

#. Create an order. Send a ``POST`` request to ``http://localhost:8092/api/orders`` with this body:

   .. code-block:: json

      {"id":"ord-1001"}

#. Look up the order. Send a ``GET`` request to ``http://localhost:8092/api/orders?id=<id>``.
