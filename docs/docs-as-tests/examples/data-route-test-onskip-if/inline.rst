Find Node.js, then check the API
================================

.. test {"testId":"data-route-test-onskip-if-windows","if":"$$platform == windows","onSkip":[{"if":"$$platform != windows","goToTest":"data-route-test-onskip-if-products"}],"detectSteps":false}

Find Node.js on Windows
-----------------------

#. Find the Node.js executable:

   .. code-block:: shell

      where node

   .. step {"runShell":"where node"}

.. test end

.. test {"testId":"data-route-test-onskip-if-cart","detectSteps":false}

Check the cart
--------------

#. Send a ``GET`` request to ``http://localhost:8092/api/carts``.

   .. step {"httpRequest":{"url":"http://localhost:8092/api/carts","method":"get"}}

.. test end

.. test {"testId":"data-route-test-onskip-if-products","detectSteps":false}

Check the products
------------------

#. Send a ``GET`` request to ``http://localhost:8092/api/products``.

   .. step {"httpRequest":{"url":"http://localhost:8092/api/products","method":"get"}}

.. test end
