Drag a widget and scroll the page
=================================

.. test {"testId":"nav-drag-swipe","detectSteps":true}

#. Go to `the drag and drop page <http://localhost:8092/drag-drop-test.html>`_.

   .. step {"goTo":"http://localhost:8092/drag-drop-test.html"}

#. Drag **Table** onto **Drop Zone 1**.

   .. step {"dragAndDrop":{"source":"Table","target":{"selector":".drop-zone","elementText":"Drop Zone 1"},"duration":500}}

#. Check that **Table (dropped)** appears in the drop zone.
#. Press and hold **Chart** for one second.

   .. step {"click":{"selector":".draggable[data-widget=\"chart\"]","button":"left","duration":1000}}

#. Swipe up to scroll toward the bottom of the page.

   .. step {"swipe":"up"}

#. Swipe down a third of the screen to scroll back.

   .. step {"swipe":{"direction":"down","distance":0.3,"duration":300}}

#. Swipe from the middle of the page toward the top.

   .. step {"swipe":{"from":{"x":400,"y":400},"to":{"x":400,"y":250},"duration":300}}

.. test end
