Press and hold a button
=======================

.. test {"testId":"nav-click-duration","detectSteps":false}

#. Go to `the click counter page <http://localhost:8092/find-click.html>`_.

   .. step {"goTo":"http://localhost:8092/find-click.html"}

#. Press and hold **Count clicks** for one second.

   .. step {"click":{"selector":"#counter","duration":1000}}

#. Check that the button counted the click.

   .. step {"find":{"selector":"#counter","elementAttribute":{"data-left":"1"}}}

.. test end
