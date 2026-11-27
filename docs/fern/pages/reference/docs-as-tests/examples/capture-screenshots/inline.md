<!-- test {"testId":"capture-screenshots","detectSteps":false,"autoScreenshot":true,"annotationDefaults":{"color":"#E11D48","strokeWidth":3,"badge":{"background":"#E11D48","color":"#FFFFFF"}}} -->

# Take screenshots of a sign-in form

1. Go to [the sample form](http://localhost:8092/enhanced-elements.html).
   <!-- step {"goTo":"http://localhost:8092/enhanced-elements.html"} -->
2. The form opens.
   ![The sample form](.dd-output/capture-form.png){.screenshot}
   <!-- step {"screenshot":".dd-output/capture-form.png"} -->
3. Find the **Submit by ID** button at the top of the form.
   <!-- step {"screenshot":{"path":"capture-submit.png","directory":".dd-output","maxVariation":0.2,"overwrite":"aboveVariation","crop":{"elementText":"Submit by ID","padding":{"top":8,"right":16,"bottom":8,"left":16}}}} -->
4. Fill in the sign-in fields in the order the numbers show.
   <!-- step {"screenshot":{"path":"capture-sign-in.png","directory":".dd-output","overwrite":"true","crop":{"selector":"#inputs-section","padding":10},"annotations":[{"badge":"#username-input","label":"1"},{"badge":{"elementTestId":"password-field","timeout":10000},"label":"2"},{"callout":{"selector":"#username-input"},"label":"Your account name","position":"right","style":{"maxWidth":200,"fontSize":14}},{"outline":{"elementAttribute":{"data-validation":"email-validator"}},"style":{"color":"#7C3AED","radius":4}},{"blur":{"elementAttribute":{"type":"password"}}},{"arrow":{"position":{"x":40,"y":20}}},{"text":{"position":"bottom-right"},"label":"Sample data"}]}} -->

<!-- test end -->
