<!-- test {"testId":"nav-draganddrop-strings","detectSteps":false} -->

# Drag by text and selector strings

1. Go to [the drag and drop page](http://localhost:8092/drag-drop-test.html).
   <!-- step {"goTo":"http://localhost:8092/drag-drop-test.html"} -->
2. Drag **Table** onto **Drop Zone 1**.
   <!-- step {"dragAndDrop":{"source":"Table","target":".drop-zone[data-drop=\"zone1\"]"}} -->
3. Check that **Table (dropped)** appears in the drop zone.
   <!-- step {"find":{"selector":".drop-zone .dropped-item","elementText":"Table (dropped)"}} -->

<!-- test end -->
