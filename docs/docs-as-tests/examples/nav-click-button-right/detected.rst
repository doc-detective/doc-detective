Right-click a button
====================

.. test {"testId":"nav-click-button-right","detectSteps":true}

#. Go to `the click counter page <http://localhost:8092/find-click.html>`_.

   .. step {"goTo":"http://localhost:8092/find-click.html"}

#. Right-click **Count clicks**.

   .. step {"click":{"selector":"#counter","button":"right"}}

#. Check that the button counted the click.

.. test end
