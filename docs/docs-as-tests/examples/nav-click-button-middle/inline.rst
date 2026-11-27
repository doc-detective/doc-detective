Middle-click a button
=====================

.. test {"testId":"nav-click-button-middle","detectSteps":false}

#. Go to `the click counter page <http://localhost:8092/find-click.html>`_.

   .. step {"goTo":"http://localhost:8092/find-click.html"}

#. Middle-click **Count clicks**.

   .. step {"click":{"selector":"#counter","button":"middle"}}

#. Check that the button counted the click.

   .. step {"find":{"selector":"#counter","elementAttribute":{"data-middle":"1"}}}

.. test end
