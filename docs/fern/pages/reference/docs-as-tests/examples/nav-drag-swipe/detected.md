<!-- test {"testId":"nav-drag-swipe","detectSteps":true} -->

# Drag widgets and scroll the page

1. Go to [the drag and drop page](http://localhost:8092/drag-drop-test.html).
   <!-- step {"goTo":"http://localhost:8092/drag-drop-test.html"} -->
2. Drag **Table** onto **Drop Zone 1**.
   <!-- step {"dragAndDrop":{"source":"Table","target":{"selector":".drop-zone","elementText":"Drop Zone 1","timeout":5000},"duration":500}} -->
3. Check that **Table (dropped)** appears in the drop zone.
4. Press and hold **Chart** for one second.
   <!-- step {"click":{"selector":".draggable[data-widget=\"chart\"]","button":"left","duration":1000}} -->
5. Drag **Chart** onto **Drop Zone 2**.
   <!-- step {"dragAndDrop":{"source":{"elementText":"Chart","elementClass":"draggable","elementAttribute":{"data-widget":"chart","draggable":"true"},"timeout":5000},"target":".drop-zone[data-drop=\"zone2\"]","surface":"chrome"}} -->
6. Check that **Chart (dropped)** appears in the second drop zone.
7. Swipe up to scroll toward the bottom of the page.
   <!-- step {"swipe":"up"} -->
8. Swipe down a third of the screen to scroll back.
   <!-- step {"swipe":{"direction":"down","distance":0.3,"duration":300,"surface":"chrome"}} -->
9. Swipe from the middle of the page toward the top.
   <!-- step {"swipe":{"from":{"x":400,"y":400},"to":{"x":400,"y":250},"duration":300,"surface":{"browser":"chrome"}}} -->

<!-- test end -->
