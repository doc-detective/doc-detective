Find an element and scroll to it
================================

.. test {"testId":"nav-find-moveto","detectSteps":false}

#. Go to `the toolbar page <http://localhost:8092/find-image.html>`_.

   .. step {"goTo":"http://localhost:8092/find-image.html"}

#. Scroll down to the icon at the bottom of the page.

   .. step {"find":{"selector":"#far","moveTo":true}}

.. test end
