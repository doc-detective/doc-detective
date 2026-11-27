Click a button described by an object
=====================================

.. test {"testId":"nav-click-object","detectSteps":true}

#. Go to `the click counter page <http://localhost:8092/find-click.html>`_.

   .. step {"goTo":"http://localhost:8092/find-click.html"}

#. Click **Count clicks**.

   .. step {"click":{"elementText":"Count clicks"}}

#. Check that the button counted the click.

.. test end
