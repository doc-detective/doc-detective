Search from the toolbar
=======================

.. test {"testId":"nav-search-icons","detectSteps":true}

#. Go to `the toolbar page <http://localhost:8092/find-image.html>`_.

   .. step {"goTo":"http://localhost:8092/find-image.html"}

#. Click the magnifying-glass icon next to the search box.

   .. step {"click":{"elementImage":"search.svg"}}

#. Type "doc detective" and press Enter.
#. Check that the status bar shows **doc detective**.
#. Type "-docs" at the end of the search box.
#. Check that the status bar shows **doc detective-docs**.
#. Right-click the save icon and hold the button for half a second.

   .. step {"find":{"elementImage":{"path":"save.svg","threshold":0.95},"click":{"button":"right","duration":500}}}

#. Check that the status bar records the right-click.

.. test end
