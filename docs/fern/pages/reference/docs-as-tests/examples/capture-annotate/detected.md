<!-- test {"testId":"capture-annotate","detectSteps":true,"autoScreenshot":false,"annotationDefaults":{"fontSize":14,"callout":{"background":"#0F172A","color":"#FDE047"},"transition":{"enter":"fade","exit":"fade","durationMs":250}}} -->

# Point out the controls on a toolbar

1. Go to [the toolbar page](http://localhost:8092/find-image.html).
   <!-- step {"goTo":"http://localhost:8092/find-image.html"} -->
2. Find the save button, marked 1, and the green check icon, outlined.
   <!-- step {"annotate":{"add":[{"id":"save-badge","badge":"#save","label":"1"},{"id":"check-outline","outline":{"elementImage":{"path":"check-icon.svg","threshold":0.9},"timeout":10000},"track":true,"transition":{"enter":"draw","durationMs":300}},{"id":"hint","callout":{"elementId":"save"},"label":"Saves your work","position":"bottom","transition":{"enter":"fade","exit":"fade","durationMs":200}},{"id":"banner","text":{"position":"top-right"},"label":"Sample toolbar","duration":3000}]}} -->
3. The status line at the top is hidden, because it changes on every visit.
   <!-- step {"annotate":{"add":[{"id":"redact","blur":{"selector":"#status span"},"all":true,"transition":{"enter":"none"}}]}} -->
4. Compare your toolbar with the screenshot.
   <!-- step {"screenshot":{"path":"capture-toolbar.png","directory":".dd-output","overwrite":"true"}} -->
5. Next, find the check icon, now marked 2.
   <!-- step {"annotate":{"update":[{"id":"save-badge","badge":"#check","label":"2"}]}} -->
   <!-- step {"annotate":{"clear":["hint"]}} -->
6. That's every control on the toolbar.
   <!-- step {"annotate":{"clear":true}} -->

<!-- test end -->
