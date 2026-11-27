Drag by text and selector strings
=================================

.. test {"testId":"nav-draganddrop-strings","detectSteps":true}

#. Go to `the drag and drop page <http://localhost:8092/drag-drop-test.html>`_.

   .. step {"goTo":"http://localhost:8092/drag-drop-test.html"}

#. Drag **Table** onto **Drop Zone 1**.

   .. step {"dragAndDrop":{"source":"Table","target":".drop-zone[data-drop=\"zone1\"]"}}

#. Check that **Table (dropped)** appears in the drop zone.

.. test end
