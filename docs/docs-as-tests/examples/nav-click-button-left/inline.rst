Left-click a button
===================

.. test {"testId":"nav-click-button-left","detectSteps":false}

#. Go to `the click counter page <http://localhost:8092/find-click.html>`_.

   .. step {"goTo":"http://localhost:8092/find-click.html"}

#. Left-click **Count clicks**.

   .. step {"click":{"selector":"#counter","button":"left"}}

#. Check that the button counted the click.

   .. step {"find":{"selector":"#counter","elementAttribute":{"data-left":"1"}}}

.. test end
