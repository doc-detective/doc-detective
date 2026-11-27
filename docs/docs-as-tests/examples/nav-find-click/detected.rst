Find an element and click it
============================

.. test {"testId":"nav-find-click","detectSteps":true}

#. Go to `the click counter page <http://localhost:8092/find-click.html>`_.

   .. step {"goTo":"http://localhost:8092/find-click.html"}

#. Find **Count clicks** and click it.

   .. step {"find":{"selector":"#counter","click":true}}

#. Check that the button counted one left click.

.. test end
