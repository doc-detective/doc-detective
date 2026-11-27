Click a button by its text
==========================

.. test {"testId":"nav-click-string","detectSteps":false}

#. Go to `the click counter page <http://localhost:8092/find-click.html>`_.

   .. step {"goTo":"http://localhost:8092/find-click.html"}

#. Click **Count clicks**.

   .. step {"click":"Count clicks"}

#. Check that the button counted the click.

   .. step {"find":{"selector":"#counter","elementAttribute":{"data-left":"1"}}}

.. test end
